import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
  cellTenantPaymentChannels,
  type CellOrder,
  type CellOrderReturn,
  type CellShippingCarrier,
  type NewCellOrderEvent,
  type NewCellOrderReturn,
  type NewCellShippingCarrier,
} from "../db/schemas/tenant/orders";
import {
  cellProducts,
  cellProductBundleItems,
  type CellProduct,
} from "../db/schemas/tenant/tenancy-catalog";
import {
  cellPromotions,
  cellPromotionTargets,
  type PromotionDiscountType,
  type PromotionScopeType,
} from "../db/schemas/tenant/promotions";
import {
  resolveEffectivePromotionsForProducts,
  type PromotionRecordWithTargets,
} from "../services/promotion-resolution";
import {
  cellContacts,
  cellContactAddresses,
} from "../db/schemas/tenant/crm";
import {
  computeComboDerivedMetrics,
  normalizeStoredAttributes,
  type ProductComboComponentDto,
  type ProductCompositionType,
  type ProductKind,
  type ProductStatus,
} from "../services/tenant-products-catalog.helpers";
import {
  OrderRepositoryDomainError,
  type IOrdersRepository,
  type OrderWithDetails,
  type CreateOrderParams,
  type UpdateOrderDetailsRepoParams,
  type UpdateOrderStatusRepoOptions,
  type ListOrdersFilter,
  type OrderStatusSummaryCounts,
  type RepeatOrderCatalogContext,
  type OrderContactAddressSnapshot,
} from "./orders.repository.interface";
import type {
  CellConnectionChecker,
  CellDatabaseProvider,
} from "./drizzle-cell-auth.repository";
import { CellUnavailableError } from "./cell-auth.repository.interface";

const PRE_DISPATCH_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "preparing",
  "guide_generated",
] as const;

type CellTx = Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];

interface PhysicalDemandEntry {
  productId: string;
  strictQty: number;
  flexibleQty: number;
}

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

  private async loadOrderAggregateInTx(
    tx: CellTx,
    clientId: string,
    order: CellOrder,
  ): Promise<OrderWithDetails> {
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
  }

  /**
   * Resuelve el mapa de demanda física (productos simples + componentes de combos) bloqueando
   * los registros involucrados mediante `SELECT ... FOR UPDATE` en orden determinista.
   */
  private async resolvePhysicalStockDemandInTx(
    tx: CellTx,
    clientId: string,
    items: Array<{ productId?: string | null; quantity: number }>,
  ): Promise<{
    demands: Map<string, PhysicalDemandEntry>;
    lockedProducts: Map<string, CellProduct>;
  }> {
    const uniqueIds = Array.from(
      new Set(
        items
          .map((i) => i.productId)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
      ),
    ).sort();

    const lockedProducts = new Map<string, CellProduct>();
    const demands = new Map<string, PhysicalDemandEntry>();

    if (uniqueIds.length === 0) {
      return { demands, lockedProducts };
    }

    const parentRows = await tx
      .select()
      .from(cellProducts)
      .where(
        and(
          eq(cellProducts.clientId, clientId),
          inArray(cellProducts.id, uniqueIds),
          isNull(cellProducts.deletedAt),
        ),
      )
      .orderBy(asc(cellProducts.id))
      .for("update");

    for (const row of parentRows) {
      lockedProducts.set(row.id, row);
    }

    const comboParentIds = parentRows
      .filter((p) => p.compositionType === "combo")
      .map((p) => p.id);

    const bundleComponentsByCombo = new Map<
      string,
      Array<{ componentProductId: string; quantity: number }>
    >();

    if (comboParentIds.length > 0) {
      const bundleRows = await tx
        .select()
        .from(cellProductBundleItems)
        .where(
          and(
            eq(cellProductBundleItems.clientId, clientId),
            inArray(cellProductBundleItems.bundleProductId, comboParentIds),
          ),
        );

      const missingComponentIds = Array.from(
        new Set(
          bundleRows
            .map((b) => b.componentProductId)
            .filter((cid) => !lockedProducts.has(cid)),
        ),
      ).sort();

      if (missingComponentIds.length > 0) {
        const compRows = await tx
          .select()
          .from(cellProducts)
          .where(
            and(
              eq(cellProducts.clientId, clientId),
              inArray(cellProducts.id, missingComponentIds),
              isNull(cellProducts.deletedAt),
            ),
          )
          .orderBy(asc(cellProducts.id))
          .for("update");

        for (const row of compRows) {
          lockedProducts.set(row.id, row);
        }
      }

      for (const b of bundleRows) {
        const list = bundleComponentsByCombo.get(b.bundleProductId) ?? [];
        list.push({ componentProductId: b.componentProductId, quantity: b.quantity });
        bundleComponentsByCombo.set(b.bundleProductId, list);
      }
    }

    const addDemand = (productId: string, qty: number, isStrictInStock: boolean) => {
      if (qty <= 0) return;
      const prev = demands.get(productId) ?? { productId, strictQty: 0, flexibleQty: 0 };
      if (isStrictInStock) {
        prev.strictQty += qty;
      } else {
        prev.flexibleQty += qty;
      }
      demands.set(productId, prev);
    };

    for (const item of items) {
      if (!item.productId || item.quantity <= 0) continue;
      const product = lockedProducts.get(item.productId);
      if (!product) continue;

      if (product.compositionType === "combo") {
        const components = bundleComponentsByCombo.get(product.id) ?? [];
        for (const comp of components) {
          const compProduct = lockedProducts.get(comp.componentProductId);
          if (!compProduct || compProduct.kind !== "physical") continue;
          const totalUnits = comp.quantity * item.quantity;
          const strict =
            product.availability === "in_stock" && compProduct.availability === "in_stock";
          addDemand(compProduct.id, totalUnits, strict);
        }
      } else if (product.kind === "physical") {
        addDemand(product.id, item.quantity, product.availability === "in_stock");
      }
    }

    return { demands, lockedProducts };
  }

  /**
   * Aplica mutaciones de stock físico dentro de la transacción (`deduct`, `restore` o `adjust`)
   * validando `INSUFFICIENT_STOCK` para artículos `in_stock` y acotando a 0 los `preorder`/`backorder`.
   */
  private async applyInventoryDeltaInTx(
    tx: CellTx,
    clientId: string,
    actor: string,
    params:
      | { mode: "deduct"; items: Array<{ productId?: string | null; quantity: number }> }
      | { mode: "restore"; items: Array<{ productId?: string | null; quantity: number }> }
      | {
          mode: "adjust";
          previousItems: Array<{ productId?: string | null; quantity: number }>;
          nextItems: Array<{ productId?: string | null; quantity: number }>;
        },
  ): Promise<string[]> {
    const allItems =
      params.mode === "adjust"
        ? [...params.previousItems, ...params.nextItems]
        : params.items;

    const { lockedProducts } = await this.resolvePhysicalStockDemandInTx(
      tx,
      clientId,
      allItems,
    );

    const touchedIds = new Set<string>();

    if (params.mode === "deduct" || params.mode === "restore") {
      const { demands } = await this.resolvePhysicalStockDemandInTx(tx, clientId, params.items);
      for (const [productId, entry] of demands.entries()) {
        const product = lockedProducts.get(productId);
        if (!product) continue;
        const currentStock = product.stockQuantity ?? 0;

        if (params.mode === "deduct") {
          const totalRequired = entry.strictQty + entry.flexibleQty;
          if (entry.strictQty > 0 && currentStock < entry.strictQty) {
            throw new OrderRepositoryDomainError(
              `Stock insuficiente para "${product.name}": disponible ${currentStock}, requerido ${entry.strictQty}.`,
              "INSUFFICIENT_STOCK",
            );
          }
          const nextStock = Math.max(0, currentStock - totalRequired);
          if (nextStock !== currentStock) {
            await tx
              .update(cellProducts)
              .set({
                stockQuantity: nextStock,
                updatedAt: sql`NOW()`,
                updatedBy: actor,
              })
              .where(and(eq(cellProducts.clientId, clientId), eq(cellProducts.id, productId)));
            touchedIds.add(productId);
          }
        } else {
          // Al restaurar, solo se reintegra cantidad estricta (`in_stock`) para no inflar preórdenes en 0
          const restoreQty = entry.strictQty;
          if (restoreQty > 0) {
            const nextStock = currentStock + restoreQty;
            await tx
              .update(cellProducts)
              .set({
                stockQuantity: nextStock,
                updatedAt: sql`NOW()`,
                updatedBy: actor,
              })
              .where(and(eq(cellProducts.clientId, clientId), eq(cellProducts.id, productId)));
            touchedIds.add(productId);
          }
        }
      }
      return Array.from(touchedIds);
    }

    // Modo "adjust" para edición pre-despacho cuando stock_deducted = true
    const oldDemand = await this.resolvePhysicalStockDemandInTx(tx, clientId, params.previousItems);
    const newDemand = await this.resolvePhysicalStockDemandInTx(tx, clientId, params.nextItems);
    const allProductIds = Array.from(
      new Set([...oldDemand.demands.keys(), ...newDemand.demands.keys()]),
    ).sort();

    for (const productId of allProductIds) {
      const product = lockedProducts.get(productId);
      if (!product) continue;
      const oldEntry = oldDemand.demands.get(productId) ?? { productId, strictQty: 0, flexibleQty: 0 };
      const newEntry = newDemand.demands.get(productId) ?? { productId, strictQty: 0, flexibleQty: 0 };

      const strictDelta = newEntry.strictQty - oldEntry.strictQty;
      const flexDelta = newEntry.flexibleQty - oldEntry.flexibleQty;
      const totalDelta = strictDelta + flexDelta;
      if (totalDelta === 0) continue;

      const currentStock = product.stockQuantity ?? 0;
      if (strictDelta > 0 && currentStock < strictDelta) {
        throw new OrderRepositoryDomainError(
          `Stock insuficiente para "${product.name}": disponible ${currentStock}, adicional requerido ${strictDelta}.`,
          "INSUFFICIENT_STOCK",
        );
      }

      const nextStock =
        totalDelta > 0
          ? Math.max(0, currentStock - totalDelta)
          : currentStock + Math.max(0, -strictDelta);

      if (nextStock !== currentStock) {
        await tx
          .update(cellProducts)
          .set({
            stockQuantity: nextStock,
            updatedAt: sql`NOW()`,
            updatedBy: actor,
          })
          .where(and(eq(cellProducts.clientId, clientId), eq(cellProducts.id, productId)));
        touchedIds.add(productId);
      }
    }

    return Array.from(touchedIds);
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
            inArray(cellOrders.status, [...PRE_DISPATCH_STATUSES]),
          ),
        )
        .limit(1);

      if (!order) return null;
      return await this.loadOrderAggregateInTx(tx, clientId, order);
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
      return await this.loadOrderAggregateInTx(tx, clientId, order);
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
      return await this.loadOrderAggregateInTx(tx, clientId, order);
    });
  }

  private async applyPromotionQuotaDeltaInTx(
    tx: any,
    clientId: string,
    actor: string,
    params:
      | { mode: "deduct" | "restore"; items: Array<{ promotionId?: string | null; quantity: number }> }
      | {
          mode: "adjust";
          previousItems: Array<{ promotionId?: string | null; quantity: number }>;
          nextItems: Array<{ promotionId?: string | null; quantity: number }>;
        },
  ): Promise<void> {
    const deltaByPromotion = new Map<string, number>();

    if (params.mode === "deduct" || params.mode === "restore") {
      const sign = params.mode === "deduct" ? 1 : -1;
      for (const item of params.items) {
        if (!item.promotionId || item.quantity <= 0) continue;
        deltaByPromotion.set(
          item.promotionId,
          (deltaByPromotion.get(item.promotionId) ?? 0) + sign * item.quantity,
        );
      }
    } else if (params.mode === "adjust") {
      for (const prev of params.previousItems) {
        if (!prev.promotionId || prev.quantity <= 0) continue;
        deltaByPromotion.set(
          prev.promotionId,
          (deltaByPromotion.get(prev.promotionId) ?? 0) - prev.quantity,
        );
      }
      for (const next of params.nextItems) {
        if (!next.promotionId || next.quantity <= 0) continue;
        deltaByPromotion.set(
          next.promotionId,
          (deltaByPromotion.get(next.promotionId) ?? 0) + next.quantity,
        );
      }
    }

    for (const [promotionId, delta] of deltaByPromotion.entries()) {
      if (delta === 0) continue;
      await tx
        .update(cellPromotions)
        .set({
          discountedUnitsSold: sql`GREATEST(0, ${cellPromotions.discountedUnitsSold} + ${delta})`,
          updatedAt: sql`NOW()`,
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.id, promotionId),
          ),
        );
    }
  }

  async createOrder(
    cellId: string,
    clientId: string,
    params: CreateOrderParams,
  ): Promise<OrderWithDetails> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);
    let touchedIds: string[] = [];

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      let stockDeducted = Boolean(params.order.stockDeducted);
      if (params.stockAction === "deduct" && !stockDeducted) {
        touchedIds = await this.applyInventoryDeltaInTx(
          tx,
          clientId,
          params.order.createdBy ?? "system",
          {
            mode: "deduct",
            items: params.items,
          },
        );
        stockDeducted = true;
      }

      let promotionQuotaDeducted = Boolean(params.order.promotionQuotaDeducted);
      const shouldDeductPromotionQuota =
        (params.promotionQuotaAction === "deduct" || params.stockAction === "deduct") &&
        !promotionQuotaDeducted;
      if (shouldDeductPromotionQuota) {
        await this.applyPromotionQuotaDeltaInTx(
          tx,
          clientId,
          params.order.createdBy ?? "system",
          {
            mode: "deduct",
            items: params.items,
          },
        );
        promotionQuotaDeducted = true;
      }

      const [insertedOrder] = await tx
        .insert(cellOrders)
        .values({
          ...params.order,
          stockDeducted,
          promotionQuotaDeducted,
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

    if (params.onTouchedProducts && touchedIds.length > 0) {
      params.onTouchedProducts(touchedIds);
    }

    return result;
  }

  async updateOrderDetails(
    cellId: string,
    clientId: string,
    params: UpdateOrderDetailsRepoParams,
  ): Promise<OrderWithDetails> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);
    let touchedIds: string[] = [];

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [existingOrder] = await tx
        .select()
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.id, params.orderId),
          ),
        )
        .for("update");

      if (!existingOrder) {
        throw new OrderRepositoryDomainError(
          `Pedido con id ${params.orderId} no encontrado.`,
          "ORDER_NOT_FOUND",
        );
      }

      if (!PRE_DISPATCH_STATUSES.includes(existingOrder.status as (typeof PRE_DISPATCH_STATUSES)[number])) {
        throw new OrderRepositoryDomainError(
          "No se pueden modificar los detalles o ítems de un pedido que ya fue despachado o finalizado.",
          "ORDER_LOCKED_AFTER_DISPATCH",
        );
      }

      if (params.items) {
        const previousItems = await tx
          .select()
          .from(cellOrderItems)
          .where(
            and(
              eq(cellOrderItems.clientId, clientId),
              eq(cellOrderItems.orderId, params.orderId),
            ),
          );

        if (existingOrder.stockDeducted) {
          touchedIds = await this.applyInventoryDeltaInTx(
            tx,
            clientId,
            params.event.actor,
            {
              mode: "adjust",
              previousItems,
              nextItems: params.items,
            },
          );
        }

        if (existingOrder.promotionQuotaDeducted) {
          await this.applyPromotionQuotaDeltaInTx(tx, clientId, params.event.actor, {
            mode: "adjust",
            previousItems,
            nextItems: params.items,
          });
        }

        await tx
          .delete(cellOrderItems)
          .where(
            and(
              eq(cellOrderItems.clientId, clientId),
              eq(cellOrderItems.orderId, params.orderId),
            ),
          );

        await tx.insert(cellOrderItems).values(
          params.items.map((item) => ({
            ...item,
            clientId,
            orderId: params.orderId,
          })),
        );
      }

      const [updatedOrder] = await tx
        .update(cellOrders)
        .set({
          ...params.orderUpdates,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.id, params.orderId),
          ),
        )
        .returning();

      if (!updatedOrder) {
        throw new Error(`No fue posible actualizar el pedido ${params.orderId}.`);
      }

      await tx.insert(cellOrderEvents).values({
        ...params.event,
        clientId,
        orderId: params.orderId,
      });

      return await this.loadOrderAggregateInTx(tx, clientId, updatedOrder);
    });

    if (params.onTouchedProducts && touchedIds.length > 0) {
      params.onTouchedProducts(touchedIds);
    }

    return result;
  }

  async updateOrderStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    toStatus: string,
    event: Omit<NewCellOrderEvent, "clientId" | "orderId">,
    options?: UpdateOrderStatusRepoOptions,
  ): Promise<OrderWithDetails> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);
    let touchedIds: string[] = [];

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [existingOrder] = await tx
        .select()
        .from(cellOrders)
        .where(
          and(
            eq(cellOrders.clientId, clientId),
            eq(cellOrders.id, orderId),
          ),
        )
        .for("update");

      if (!existingOrder) {
        throw new OrderRepositoryDomainError(
          `Pedido ${orderId} no encontrado en la celda.`,
          "ORDER_NOT_FOUND",
        );
      }

      const updateData: Record<string, unknown> = {
        status: toStatus,
        updatedAt: sql`NOW()`,
        updatedBy: event.actor,
      };

      if (options) {
        if (options.carrierId !== undefined) {
          updateData.carrierId = options.carrierId;
        }
        if (options.carrierName !== undefined) {
          updateData.carrierName = options.carrierName;
        }
        if (options.trackingCode !== undefined) {
          updateData.trackingCode = options.trackingCode;
        }
        if (options.cancellationReason !== undefined) {
          updateData.cancellationReason = options.cancellationReason;
        }
        if (options.issueNotes !== undefined) {
          updateData.issueNotes = options.issueNotes;
        }
      }

      if (toStatus === "guide_generated" && !existingOrder.guideGeneratedAt) {
        updateData.guideGeneratedAt = sql`NOW()`;
      }

      const effectivePromoAction = options?.promotionQuotaAction ?? options?.stockAction;
      let loadedOrderItems: typeof cellOrderItems.$inferSelect[] | null = null;
      const loadOrderItems = async () => {
        if (!loadedOrderItems) {
          loadedOrderItems = await tx
            .select()
            .from(cellOrderItems)
            .where(
              and(
                eq(cellOrderItems.clientId, clientId),
                eq(cellOrderItems.orderId, orderId),
              ),
            );
        }
        return loadedOrderItems;
      };

      if (options?.stockAction === "deduct" && !existingOrder.stockDeducted) {
        const items = await loadOrderItems();

        touchedIds = await this.applyInventoryDeltaInTx(tx, clientId, event.actor, {
          mode: "deduct",
          items,
        });
        updateData.stockDeducted = true;
      } else if (options?.stockAction === "restore" && existingOrder.stockDeducted) {
        const items = await loadOrderItems();

        touchedIds = await this.applyInventoryDeltaInTx(tx, clientId, event.actor, {
          mode: "restore",
          items,
        });
        updateData.stockDeducted = false;
      }

      if (effectivePromoAction === "deduct" && !existingOrder.promotionQuotaDeducted) {
        const items = await loadOrderItems();
        await this.applyPromotionQuotaDeltaInTx(tx, clientId, event.actor, {
          mode: "deduct",
          items,
        });
        updateData.promotionQuotaDeducted = true;
      } else if (effectivePromoAction === "restore" && existingOrder.promotionQuotaDeducted) {
        const items = await loadOrderItems();
        await this.applyPromotionQuotaDeltaInTx(tx, clientId, event.actor, {
          mode: "restore",
          items,
        });
        updateData.promotionQuotaDeducted = false;
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

      return await this.loadOrderAggregateInTx(tx, clientId, updatedOrder);
    });

    if (options?.onTouchedProducts && touchedIds.length > 0) {
      options.onTouchedProducts(touchedIds);
    }

    return result;
  }

  async markGuideGenerated(
    cellId: string,
    clientId: string,
    orderId: string,
    event: Omit<NewCellOrderEvent, "clientId" | "orderId">,
    advanceToGuideGenerated: boolean = false,
  ): Promise<OrderWithDetails> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [existing] = await tx
        .select()
        .from(cellOrders)
        .where(and(eq(cellOrders.clientId, clientId), eq(cellOrders.id, orderId)))
        .for("update");

      if (!existing) {
        throw new OrderRepositoryDomainError(
          `Pedido ${orderId} no encontrado en la celda.`,
          "ORDER_NOT_FOUND",
        );
      }

      const nextStatus =
        advanceToGuideGenerated && existing.status === "preparing"
          ? "guide_generated"
          : existing.status;

      const [updatedOrder] = await tx
        .update(cellOrders)
        .set({
          guideGeneratedAt: sql`NOW()`,
          status: nextStatus,
          updatedAt: sql`NOW()`,
          updatedBy: event.actor,
        })
        .where(and(eq(cellOrders.clientId, clientId), eq(cellOrders.id, orderId)))
        .returning();

      await tx.insert(cellOrderEvents).values({
        ...event,
        fromStatus: existing.status,
        toStatus: nextStatus,
        clientId,
        orderId,
      });

      return await this.loadOrderAggregateInTx(tx, clientId, updatedOrder!);
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

      if (filters?.statuses && filters.statuses.length > 0) {
        conditions.push(inArray(cellOrders.status, filters.statuses));
      } else if (filters?.status && filters.status !== "all") {
        conditions.push(eq(cellOrders.status, filters.status));
      }
      if (filters?.paymentStatus && filters.paymentStatus !== "all") {
        conditions.push(eq(cellOrders.paymentStatus, filters.paymentStatus));
      }
      if (filters?.shippingMethod && filters.shippingMethod !== "all") {
        conditions.push(eq(cellOrders.shippingMethod, filters.shippingMethod));
      }
      if (filters?.carrier && filters.carrier.trim().length > 0) {
        const carrierPattern = `%${filters.carrier.trim().toLowerCase()}%`;
        conditions.push(sql`LOWER(COALESCE(${cellOrders.carrierName}, '')) LIKE ${carrierPattern}`);
      }
      if (filters?.startDate) {
        conditions.push(sql`${cellOrders.createdAt} >= ${filters.startDate}`);
      }
      if (filters?.endDate) {
        conditions.push(sql`${cellOrders.createdAt} <= ${filters.endDate}`);
      }
      if (filters?.query && filters.query.trim().length > 0) {
        const pattern = `%${filters.query.trim().toLowerCase()}%`;
        conditions.push(
          or(
            sql`LOWER(${cellOrders.number}) LIKE ${pattern}`,
            sql`LOWER(${cellOrders.customerName}) LIKE ${pattern}`,
            sql`LOWER(${cellOrders.customerPhone}) LIKE ${pattern}`,
            sql`LOWER(COALESCE(${cellOrders.trackingCode}, '')) LIKE ${pattern}`,
            sql`LOWER(COALESCE(${cellOrders.city}, '')) LIKE ${pattern}`,
          )!,
        );
      }

      const whereClause = and(...conditions);

      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellOrders)
        .where(whereClause);

      const total = countResult?.count ?? 0;

      const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 100);
      const page = Math.max(filters?.page ?? 1, 1);
      const offset =
        filters?.offset !== undefined
          ? Math.max(filters.offset, 0)
          : (page - 1) * limit;

      const sortColumn = (() => {
        switch (filters?.sortBy) {
          case "total_cents":
            return cellOrders.totalCents;
          case "number":
            return cellOrders.number;
          case "status":
            return cellOrders.status;
          case "customer_name":
            return cellOrders.customerName;
          case "created_at":
          default:
            return cellOrders.createdAt;
        }
      })();

      const orderExpr = filters?.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

      const items = await tx
        .select()
        .from(cellOrders)
        .where(whereClause)
        .orderBy(orderExpr)
        .limit(limit)
        .offset(offset);

      return {
        items,
        total,
      };
    });
  }

  async getOrderStatusSummary(
    cellId: string,
    clientId: string,
  ): Promise<OrderStatusSummaryCounts> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const rows = await tx
        .select({
          status: cellOrders.status,
          count: sql<number>`count(*)::int`,
        })
        .from(cellOrders)
        .where(eq(cellOrders.clientId, clientId))
        .groupBy(cellOrders.status);

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        byStatus[r.status] = r.count;
        total += r.count;
      }

      const pending =
        (byStatus.pending_confirmation ?? 0) + (byStatus.confirmed ?? 0);
      const preparingAndGuide =
        (byStatus.preparing ?? 0) + (byStatus.guide_generated ?? 0);
      const inTransitAndIssue =
        (byStatus.dispatched ?? 0) +
        (byStatus.in_transit ?? 0) +
        (byStatus.out_for_delivery ?? 0) +
        (byStatus.delivery_issue ?? 0);
      const delivered = byStatus.delivered ?? 0;
      const cancelledAndReturned =
        (byStatus.cancelled ?? 0) +
        (byStatus.return_in_progress ?? 0) +
        (byStatus.returned ?? 0);

      return {
        total,
        pending,
        preparingAndGuide,
        inTransitAndIssue,
        delivered,
        cancelledAndReturned,
        byStatus,
      };
    });
  }

  async getProductsForOrderItems(
    cellId: string,
    clientId: string,
    productIds: string[],
  ): Promise<RepeatOrderCatalogContext["productsById"]> {
    const uniqueIds = Array.from(
      new Set(productIds.filter((id) => typeof id === "string" && id.trim().length > 0)),
    );
    const out: RepeatOrderCatalogContext["productsById"] = {};
    if (uniqueIds.length === 0) return out;

    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const products = await tx
        .select()
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            inArray(cellProducts.id, uniqueIds),
            isNull(cellProducts.deletedAt),
          ),
        );

      const comboIds = products
        .filter((p) => p.compositionType === "combo")
        .map((p) => p.id);

      const bundleRows =
        comboIds.length > 0
          ? await tx
              .select()
              .from(cellProductBundleItems)
              .where(
                and(
                  eq(cellProductBundleItems.clientId, clientId),
                  inArray(cellProductBundleItems.bundleProductId, comboIds),
                ),
              )
          : [];

      const compIds = Array.from(new Set(bundleRows.map((b) => b.componentProductId)));
      const compProducts =
        compIds.length > 0
          ? await tx
              .select()
              .from(cellProducts)
              .where(
                and(
                  eq(cellProducts.clientId, clientId),
                  inArray(cellProducts.id, compIds),
                  isNull(cellProducts.deletedAt),
                ),
              )
          : [];
      const compMap = new Map(compProducts.map((c) => [c.id, c]));

      const activePromos = await tx
        .select()
        .from(cellPromotions)
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.isActive, true),
            isNull(cellPromotions.deletedAt),
          ),
        );
      const promoTargets =
        activePromos.length > 0
          ? await tx
              .select()
              .from(cellPromotionTargets)
              .where(
                and(
                  eq(cellPromotionTargets.clientId, clientId),
                  inArray(
                    cellPromotionTargets.promotionId,
                    activePromos.map((pr) => pr.id),
                  ),
                ),
              )
          : [];
      const targetsByPromo = new Map<string, typeof promoTargets>();
      for (const pt of promoTargets) {
        const list = targetsByPromo.get(pt.promotionId) ?? [];
        list.push(pt);
        targetsByPromo.set(pt.promotionId, list);
      }
      const promoRecords: PromotionRecordWithTargets[] = activePromos.map((pr) => ({
        id: pr.id,
        name: pr.name,
        description: pr.description ?? null,
        scopeType: pr.scopeType as PromotionScopeType,
        discountType: pr.discountType as PromotionDiscountType,
        discountValue: Number(pr.discountValue),
        startsAt: pr.startsAt,
        endsAt: pr.endsAt ?? null,
        maxDiscountedUnits: pr.maxDiscountedUnits ?? null,
        discountedUnitsSold: Number(pr.discountedUnitsSold ?? 0),
        isActive: Boolean(pr.isActive),
        deletedAt: pr.deletedAt ?? null,
        createdAt: pr.createdAt,
        targets: (targetsByPromo.get(pr.id) ?? []).map((t) => ({
          targetType: t.targetType as "product" | "category",
          productId: t.productId ?? null,
          categoryName: t.categoryName ?? null,
        })),
      }));
      const effectivePromoMap = resolveEffectivePromotionsForProducts(
        products.map((p) => ({
          id: p.id,
          category: p.category ?? null,
          priceCents: p.priceCents,
        })),
        promoRecords,
      );

      for (const p of products) {
        let comboEffectiveStock: number | null = null;
        let hasInactiveComboComponent = false;

        if (p.compositionType === "combo") {
          const components: ProductComboComponentDto[] = bundleRows
            .filter((b) => b.bundleProductId === p.id)
            .map((b) => {
              const comp = compMap.get(b.componentProductId);
              return {
                componentProductId: b.componentProductId,
                name: comp?.name ?? "Componente",
                sku: comp?.sku ?? null,
                kind: (comp?.kind ?? "physical") as ProductKind,
                status: (comp?.status ?? "inactive") as ProductStatus,
                priceCents: comp?.priceCents ?? 0,
                costPriceCents: comp?.costPriceCents ?? 0,
                stockQuantity: comp?.stockQuantity ?? 0,
                quantity: b.quantity,
                sortOrder: b.sortOrder,
                coverImageUrl: null,
              };
            });
          const derived = computeComboDerivedMetrics(components);
          comboEffectiveStock = derived.effectiveStock;
          hasInactiveComboComponent = derived.hasInactiveComponent;
        }

        const activePromotion = effectivePromoMap.get(p.id) ?? null;

        out[p.id] = {
          id: p.id,
          name: p.name,
          sku: p.sku,
          kind: p.kind,
          compositionType: p.compositionType as ProductCompositionType,
          availability: p.availability,
          status: p.status,
          priceCents: p.priceCents,
          salePriceCents: activePromotion ? activePromotion.effectivePriceCents : p.salePriceCents,
          activePromotion,
          costPriceCents: p.costPriceCents,
          stockQuantity: p.stockQuantity,
          attributes: normalizeStoredAttributes(p.attributes),
          comboEffectiveStock,
          hasInactiveComboComponent,
        };
      }

      return out;
    });
  }

  async getRepeatOrderCatalogContext(
    cellId: string,
    clientId: string,
    productIds: string[],
    contactId?: string | null,
    paymentChannelId?: string | null,
  ): Promise<RepeatOrderCatalogContext> {
    const productsById = await this.getProductsForOrderItems(cellId, clientId, productIds);

    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      let defaultContactAddress: RepeatOrderCatalogContext["defaultContactAddress"] = null;
      if (contactId) {
        const addresses = await tx
          .select()
          .from(cellContactAddresses)
          .where(
            and(
              eq(cellContactAddresses.clientId, clientId),
              eq(cellContactAddresses.contactId, contactId),
            ),
          )
          .orderBy(desc(cellContactAddresses.isDefault), asc(cellContactAddresses.createdAt))
          .limit(1);

        const addr = addresses[0];
        if (addr) {
          defaultContactAddress = {
            id: addr.id,
            countryCode: addr.countryCode,
            subdivisionCode: addr.subdivisionCode,
            state: addr.state,
            city: addr.city,
            addressLine: addr.addressLine,
            addressComplement: addr.addressComplement,
            neighborhood: addr.neighborhood,
            postalCode: addr.postalCode,
            referenceNotes: addr.referenceNotes,
          };
        }
      }

      let activePaymentChannel: RepeatOrderCatalogContext["activePaymentChannel"] = null;
      if (paymentChannelId) {
        const [channel] = await tx
          .select()
          .from(cellTenantPaymentChannels)
          .where(
            and(
              eq(cellTenantPaymentChannels.clientId, clientId),
              eq(cellTenantPaymentChannels.id, paymentChannelId),
              eq(cellTenantPaymentChannels.isActive, true),
            ),
          )
          .limit(1);

        if (channel) {
          activePaymentChannel = {
            id: channel.id,
            channelCode: channel.channelCode,
            displayName: channel.displayName,
            instructions: channel.instructions,
          };
        }
      }

      return {
        productsById,
        defaultContactAddress,
        activePaymentChannel,
      };
    });
  }

  async getActivePaymentChannel(
    cellId: string,
    clientId: string,
    channelId: string,
  ): Promise<{ id: string; channelCode: string; displayName: string; instructions: string | null } | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [channel] = await tx
        .select()
        .from(cellTenantPaymentChannels)
        .where(
          and(
            eq(cellTenantPaymentChannels.clientId, clientId),
            eq(cellTenantPaymentChannels.id, channelId),
            eq(cellTenantPaymentChannels.isActive, true),
          ),
        )
        .limit(1);

      if (!channel) return null;
      return {
        id: channel.id,
        channelCode: channel.channelCode,
        displayName: channel.displayName,
        instructions: channel.instructions,
      };
    });
  }

  async getContactAndAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId?: string | null,
  ): Promise<OrderContactAddressSnapshot | null> {
    await this.ensureCellAvailable(cellId);
    const db = await this.getDbForCell(cellId);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);

      const [contact] = await tx
        .select()
        .from(cellContacts)
        .where(
          and(
            eq(cellContacts.clientId, clientId),
            eq(cellContacts.id, contactId),
            isNull(cellContacts.deletedAt),
          ),
        )
        .limit(1);

      if (!contact) return null;

      let address: OrderContactAddressSnapshot["address"] = null;
      if (addressId) {
        const [addr] = await tx
          .select()
          .from(cellContactAddresses)
          .where(
            and(
              eq(cellContactAddresses.clientId, clientId),
              eq(cellContactAddresses.contactId, contactId),
              eq(cellContactAddresses.id, addressId),
            ),
          )
          .limit(1);

        if (addr) {
          address = {
            id: addr.id,
            countryCode: addr.countryCode,
            subdivisionCode: addr.subdivisionCode,
            state: addr.state,
            city: addr.city,
            addressLine: addr.addressLine,
            addressComplement: addr.addressComplement,
            neighborhood: addr.neighborhood,
            postalCode: addr.postalCode,
            referenceNotes: addr.referenceNotes,
          };
        }
      }

      return {
        contact: {
          id: contact.id,
          fullName: contact.fullName,
          phoneMobile: contact.phoneMobile,
          documentNumber: contact.documentNumber,
        },
        address,
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
