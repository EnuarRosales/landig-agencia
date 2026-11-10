import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getCellDb } from "../db/cell-client";
import * as schema from "../db/schemas";
import {
  cellOrders,
  cellOrderItems,
  cellOrderEvents,
  cellOrderReturns,
  cellOrderSequences,
  cellShippingCarriers,
  type CellOrder,
  type CellOrderItem,
  type CellOrderEvent,
  type NewCellOrderEvent,
  type CellOrderReturn,
  type CellShippingCarrier,
  type NewCellOrderReturn,
  type NewCellShippingCarrier,
} from "../db/schemas/tenant/orders";
import type {
  IOrdersRepository,
  OrderWithDetails,
  CreateOrderParams,
  ListOrdersFilter,
} from "./orders.repository.interface";
import type {
  CellConnectionChecker,
  CellDatabaseProvider,
} from "./drizzle-cell-auth.repository";
import { CellUnavailableError } from "./cell-auth.repository.interface";

/**
 * Implementación Drizzle ORM del repositorio de pedidos y fulfillment en celdas de datos.
 *
 * Aplica aislamiento estricto fijando `app.current_client_id` dentro de transacciones aisladas
 * para garantizar cumplimiento de las políticas PostgreSQL `ENABLE + FORCE ROW LEVEL SECURITY`.
 */
export class DrizzleOrdersRepository implements IOrdersRepository {
  constructor(
    private readonly dbProvider: CellDatabaseProvider = (cellId?: string) => getCellDb(cellId ?? "cell-01"),
    private readonly cellHealthChecker?: CellConnectionChecker,
  ) {}

  private async getDbForCell(cellId: string): Promise<PostgresJsDatabase<typeof schema>> {
    return await this.dbProvider(cellId);
  }

  private async ensureCellAvailable(cellId: string): Promise<void> {
    if (this.cellHealthChecker) {
      const isAvailable = await this.cellHealthChecker(cellId);
      if (!isAvailable) {
        throw new CellUnavailableError(`Celda ${cellId} fuera de servicio.`, cellId);
      }
    }
  }

  async getNextOrderNumber(
    cellId: string,
    clientId: string,
    period: string,
  ): Promise<string> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const result = await tx
        .insert(cellOrderSequences)
        .values({
          clientId,
          period,
          currentVal: 1,
        })
        .onConflictDoUpdate({
          target: [cellOrderSequences.clientId, cellOrderSequences.period],
          set: {
            currentVal: sql`${cellOrderSequences.currentVal} + 1`,
            updatedAt: sql`NOW()`,
          },
        })
        .returning({ currentVal: cellOrderSequences.currentVal });

      const nextVal = result[0]?.currentVal ?? 1;
      const formattedSeq = String(nextVal).padStart(4, "0");
      return `ORD-${period}-${formattedSeq}`;
    });
  }

  async findActiveOrderByChatwootConversationId(
    cellId: string,
    clientId: string,
    chatwootConversationId: number,
  ): Promise<OrderWithDetails | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [order] = await tx
        .select()
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.chatwootConversationId, chatwootConversationId),
            inArray(cellOrders.status, ["registered", "confirmed", "preparing", "shipped"]),
          ),
        )
        .limit(1);

      if (!order) return null;

      const items = await tx
        .select()
        .from(cellOrderItems)
        .where(
          and(
            eq(cellOrderItems.clientId, clientId),
            eq(cellOrderItems.orderId, order.id),
          ),
        );

      const events = await tx
        .select()
        .from(cellOrderEvents)
        .where(
          and(
            eq(cellOrderEvents.clientId, clientId),
            eq(cellOrderEvents.orderId, order.id),
          ),
        )
        .orderBy(desc(cellOrderEvents.createdAt));

      const returns = await tx
        .select()
        .from(cellOrderReturns)
        .where(
          and(
            eq(cellOrderReturns.clientId, clientId),
            eq(cellOrderReturns.orderId, order.id),
          ),
        );

      return {
        order,
        items,
        events,
        returns,
      };
    });
  }

  async findOrderById(
    cellId: string,
    clientId: string,
    orderId: string,
  ): Promise<OrderWithDetails | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [order] = await tx
        .select()
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.id, orderId),
          ),
        )
        .limit(1);

      if (!order) return null;

      const items = await tx
        .select()
        .from(cellOrderItems)
        .where(
          and(
            eq(cellOrderItems.clientId, clientId),
            eq(cellOrderItems.orderId, order.id),
          ),
        );

      const events = await tx
        .select()
        .from(cellOrderEvents)
        .where(
          and(
            eq(cellOrderEvents.clientId, clientId),
            eq(cellOrderEvents.orderId, order.id),
          ),
        )
        .orderBy(desc(cellOrderEvents.createdAt));

      const returns = await tx
        .select()
        .from(cellOrderReturns)
        .where(
          and(
            eq(cellOrderReturns.clientId, clientId),
            eq(cellOrderReturns.orderId, order.id),
          ),
        );

      return {
        order,
        items,
        events,
        returns,
      };
    });
  }

  async findOrderByNumber(
    cellId: string,
    clientId: string,
    number: string,
  ): Promise<OrderWithDetails | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [order] = await tx
        .select()
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.number, number),
          ),
        )
        .limit(1);

      if (!order) return null;

      const items = await tx
        .select()
        .from(cellOrderItems)
        .where(
          and(
            eq(cellOrderItems.clientId, clientId),
            eq(cellOrderItems.orderId, order.id),
          ),
        );

      const events = await tx
        .select()
        .from(cellOrderEvents)
        .where(
          and(
            eq(cellOrderEvents.clientId, clientId),
            eq(cellOrderEvents.orderId, order.id),
          ),
        )
        .orderBy(desc(cellOrderEvents.createdAt));

      const returns = await tx
        .select()
        .from(cellOrderReturns)
        .where(
          and(
            eq(cellOrderReturns.clientId, clientId),
            eq(cellOrderReturns.orderId, order.id),
          ),
        );

      return {
        order,
        items,
        events,
        returns,
      };
    });
  }

  async createOrder(
    cellId: string,
    clientId: string,
    params: CreateOrderParams,
  ): Promise<OrderWithDetails> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [insertedOrder] = await tx
        .insert(cellOrders)
        .values({
          ...params.order,
          clientId,
        })
        .returning();

      if (!insertedOrder) {
        throw new Error("No fue posible persistir el pedido en la celda.");
      }

      const itemsToInsert = params.items.map((item) => ({
        ...item,
        clientId,
        orderId: insertedOrder.id,
      }));

      const insertedItems = await tx
        .insert(cellOrderItems)
        .values(itemsToInsert)
        .returning();

      const [insertedEvent] = await tx
        .insert(cellOrderEvents)
        .values({
          ...params.event,
          clientId,
          orderId: insertedOrder.id,
        })
        .returning();

      return {
        order: insertedOrder,
        items: insertedItems,
        events: insertedEvent ? [insertedEvent] : [],
        returns: [],
      };
    });
  }

  async updateOrderStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    toStatus: string,
    event: Omit<NewCellOrderEvent, "clientId" | "orderId">,
    carrierUpdate?: { carrierId?: string; carrierName?: string; trackingCode?: string },
  ): Promise<OrderWithDetails> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const updateData: Record<string, unknown> = {
        status: toStatus,
        updatedAt: sql`NOW()`,
      };

      if (carrierUpdate) {
        if (carrierUpdate.carrierId !== undefined) {
          updateData.carrierId = carrierUpdate.carrierId;
        }
        if (carrierUpdate.carrierName !== undefined) {
          updateData.carrierName = carrierUpdate.carrierName;
        }
        if (carrierUpdate.trackingCode !== undefined) {
          updateData.trackingCode = carrierUpdate.trackingCode;
        }
      }

      const [updatedOrder] = await tx
        .update(cellOrders)
        .set(updateData)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.id, orderId),
          ),
        )
        .returning();

      if (!updatedOrder) {
        throw new Error(`Pedido ${orderId} no encontrado en la celda.`);
      }

      await tx.insert(cellOrderEvents).values({
        ...event,
        clientId,
        orderId,
      });

      const items = await tx
        .select()
        .from(cellOrderItems)
        .where(
          and(
            eq(cellOrderItems.clientId, clientId),
            eq(cellOrderItems.orderId, orderId),
          ),
        );

      const events = await tx
        .select()
        .from(cellOrderEvents)
        .where(
          and(
            eq(cellOrderEvents.clientId, clientId),
            eq(cellOrderEvents.orderId, orderId),
          ),
        )
        .orderBy(desc(cellOrderEvents.createdAt));

      const returns = await tx
        .select()
        .from(cellOrderReturns)
        .where(
          and(
            eq(cellOrderReturns.clientId, clientId),
            eq(cellOrderReturns.orderId, orderId),
          ),
        );

      return {
        order: updatedOrder,
        items,
        events,
        returns,
      };
    });
  }

  async updateOrderPaymentStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    paymentStatus: string,
  ): Promise<CellOrder> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [updated] = await tx
        .update(cellOrders)
        .set({
          paymentStatus,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.id, orderId),
          ),
        )
        .returning();

      if (!updated) {
        throw new Error(`Pedido ${orderId} no encontrado para actualizar estado de pago.`);
      }

      return updated;
    });
  }

  async createOrderReturn(
    cellId: string,
    clientId: string,
    orderReturn: Omit<NewCellOrderReturn, "clientId">,
    event?: Omit<NewCellOrderEvent, "clientId" | "orderId">,
  ): Promise<CellOrderReturn> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [insertedReturn] = await tx
        .insert(cellOrderReturns)
        .values({
          ...orderReturn,
          clientId,
        })
        .returning();

      if (!insertedReturn) {
        throw new Error("No se pudo registrar la devolución del pedido.");
      }

      if (event) {
        await tx.insert(cellOrderEvents).values({
          ...event,
          clientId,
          orderId: orderReturn.orderId,
        });
      }

      return insertedReturn;
    });
  }

  async listShippingCarriers(
    cellId: string,
    clientId: string,
  ): Promise<CellShippingCarrier[]> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      return await tx
        .select()
        .from(cellShippingCarriers)
        .where(
          and(
            eq(cellShippingCarriers.clientId, clientId),
            eq(cellShippingCarriers.isActive, true),
          ),
        )
        .orderBy(cellShippingCarriers.name);
    });
  }

  async createShippingCarrier(
    cellId: string,
    clientId: string,
    carrier: Omit<NewCellShippingCarrier, "clientId">,
  ): Promise<CellShippingCarrier> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [inserted] = await tx
        .insert(cellShippingCarriers)
        .values({
          ...carrier,
          clientId,
        })
        .returning();

      return inserted!;
    });
  }

  async listOrders(
    cellId: string,
    clientId: string,
    filters?: ListOrdersFilter,
  ): Promise<{ items: CellOrder[]; total: number }> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const conditions = [eq(cellOrders.clientId, clientId)];

      if (filters?.status) {
        conditions.push(eq(cellOrders.status, filters.status));
      }
      if (filters?.paymentStatus) {
        conditions.push(eq(cellOrders.paymentStatus, filters.paymentStatus));
      }
      if (filters?.shippingMethod) {
        conditions.push(eq(cellOrders.shippingMethod, filters.shippingMethod));
      }
      if (filters?.startDate) {
        conditions.push(sql`${cellOrders.createdAt} >= ${filters.startDate}`);
      }
      if (filters?.endDate) {
        conditions.push(sql`${cellOrders.createdAt} <= ${filters.endDate}`);
      }
      if (filters?.query) {
        const pattern = `%${filters.query.trim().toLowerCase()}%`;
        conditions.push(
          or(
            sql`LOWER(${cellOrders.number}) LIKE ${pattern}`,
            sql`LOWER(${cellOrders.customerName}) LIKE ${pattern}`,
            sql`LOWER(${cellOrders.customerPhone}) LIKE ${pattern}`,
          )!,
        );
      }

      const whereClause = and(...conditions);

      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellOrders)
        .where(whereClause);

      const total = countResult?.count ?? 0;

      const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 100);
      const offset = Math.max(filters?.offset ?? 0, 0);

      const items = await tx
        .select()
        .from(cellOrders)
        .where(whereClause)
        .orderBy(desc(cellOrders.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items,
        total,
      };
    });
  }

  async getOrderMetrics(
    cellId: string,
    clientId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalOrders: number;
    totalSalesCents: number;
    averageTicketCents: number;
    deliveredOrders: number;
    cancelledOrders: number;
    returnedOrders: number;
    totalReturnsCents: number;
  }> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [orderStats] = await tx
        .select({
          totalOrders: sql<number>`count(*)::int`,
          totalSalesCents: sql<number>`coalesce(sum(case when status not in ('cancelled', 'returned') then total_cents else 0 end), 0)::bigint`,
          deliveredOrders: sql<number>`count(*) filter (where status = 'delivered')::int`,
          cancelledOrders: sql<number>`count(*) filter (where status = 'cancelled')::int`,
          returnedOrders: sql<number>`count(*) filter (where status = 'returned')::int`,
        })
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            sql`${cellOrders.createdAt} >= ${startDate}`,
            sql`${cellOrders.createdAt} <= ${endDate}`,
          ),
        );

      const [returnStats] = await tx
        .select({
          totalReturnsCents: sql<number>`coalesce(sum(amount_cents), 0)::bigint`,
        })
        .from(cellOrderReturns)
        .where(
          and(
            eq(cellOrderReturns.clientId, clientId),
            sql`${cellOrderReturns.createdAt} >= ${startDate}`,
            sql`${cellOrderReturns.createdAt} <= ${endDate}`,
          ),
        );

      const totalOrders = orderStats?.totalOrders ?? 0;
      const totalSalesCents = Number(orderStats?.totalSalesCents ?? 0);
      const activeCount = totalOrders - (orderStats?.cancelledOrders ?? 0) - (orderStats?.returnedOrders ?? 0);
      const averageTicketCents = activeCount > 0 ? Math.round(totalSalesCents / activeCount) : 0;

      return {
        totalOrders,
        totalSalesCents,
        averageTicketCents,
        deliveredOrders: orderStats?.deliveredOrders ?? 0,
        cancelledOrders: orderStats?.cancelledOrders ?? 0,
        returnedOrders: orderStats?.returnedOrders ?? 0,
        totalReturnsCents: Number(returnStats?.totalReturnsCents ?? 0),
      };
    });
  }
}
