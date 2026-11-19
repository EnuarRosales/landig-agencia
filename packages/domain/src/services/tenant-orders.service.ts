import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { cellDatabasePoolManager } from "../db/cell-client";
import { clients } from "../db/schemas/admin/clients";
import { clientBrandings } from "../db/schemas/admin/client-brandings";
import { tenantBots, type BotDefaultMessageKey } from "../db/schemas/admin/bot-tenancy";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import { DrizzleOrdersRepository } from "../repositories/drizzle-orders.repository";
import { DrizzleCrmRepository } from "../repositories/drizzle-crm.repository";
import type {
  ListOrdersFilter,
  OrderListSortBy,
  OrderStatusSummaryCounts,
  OrderWithDetails,
} from "../repositories/orders.repository.interface";
import type { CellOrder, CellOrderReturn, OrderStatus } from "../db/schemas/tenant/orders";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { buildImgproxyUrl } from "../utils/imgproxy";
import {
  getTenantProductsAndMediaService,
  type TenantProductsAndMediaService,
} from "./tenant-products-and-media.service";
import {
  OrdersService,
  PRE_DISPATCH_ORDER_STATUSES,
  getAllowedNextStatuses,
  type RegisterOrderInput,
  type UpdateOrderDetailsInput,
  type TransitionOrderStatusInput,
  type RepeatOrderResult,
  type RegisterOrderReturnInput,
} from "./orders.service";
import {
  OrderGuideRendererService,
  type OrderGuideFormat,
  type OrderGuideMerchantInfo,
  type OrderGuideSize,
  type RenderedOrderGuide,
} from "./order-guide-renderer.service";

/**
 * DTO de ítem de línea en el detalle de pedido (`SPEC-11`).
 */
export interface OrderItemDto {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  selectedAttributes: Record<string, string> | null;
  tierMinQty: number | null;
  promotionId?: string | null;
  promotionName?: string | null;
  originalUnitPriceCents?: number | null;
  lineTotalCents: number;
}

/**
 * DTO de evento cronológico de auditoría del pedido.
 */
export interface OrderEventDto {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actor: string;
  reason: string | null;
  createdAt: string;
}

/**
 * DTO de devolución asociada al pedido.
 */
export interface OrderReturnDto {
  id: string;
  reason: string;
  amountCents: number;
  status: string;
  actor: string;
  createdAt: string;
}

/**
 * DTO estándar de fila de pedido para listado paginado (`SPEC-11`, `SPEC-17`).
 */
export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  number: string;
  contactId: string | null;
  prospectId: string | null;
  contactAddressId: string | null;
  source: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentChannelId: string | null;
  paymentStatus: string;
  shippingMethod: string;
  carrierId: string | null;
  carrierName: string | null;
  trackingCode: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument: string | null;
  countryCode: string;
  subdivisionCode: string | null;
  city: string | null;
  state: string | null;
  addressLine: string | null;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  stockDeducted: boolean;
  promotionQuotaDeducted?: boolean;
  guideGeneratedAt: string | null;
  repeatedFromOrderId: string | null;
  canEditDetails: boolean;
  allowedNextStatuses: OrderStatus[];
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO completo del detalle del pedido incluyendo ítems, eventos, devoluciones y transiciones válidas.
 */
export interface OrderDetailDto extends OrderListItemDto {
  addressComplement: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  referenceNotes: string | null;
  notes: string | null;
  cancellationReason: string | null;
  issueNotes: string | null;
  externalErpSystem: string | null;
  externalErpReference: string | null;
  items: OrderItemDto[];
  events: OrderEventDto[];
  returns: OrderReturnDto[];
}

/**
 * Respuesta paginada estándar de listado de pedidos (`SPEC-11`, `SPEC-17`).
 */
export interface OrderListResultDto {
  items: OrderListItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: OrderStatusSummaryCounts;
}

/**
 * Convierte una fila `CellOrder` al DTO de listado enriquecido con permisos de edición y transiciones.
 */
export function mapOrderToListItemDto(o: CellOrder): OrderListItemDto {
  const status = o.status as OrderStatus;
  return {
    id: o.id,
    orderNumber: o.number,
    number: o.number,
    contactId: o.prospectId ?? null,
    prospectId: o.prospectId ?? null,
    contactAddressId: o.contactAddressId ?? null,
    source: o.source,
    status,
    paymentMethod: o.paymentMethod,
    paymentChannelId: o.paymentChannelId ?? null,
    paymentStatus: o.paymentStatus,
    shippingMethod: o.shippingMethod,
    carrierId: o.carrierId ?? null,
    carrierName: o.carrierName ?? null,
    trackingCode: o.trackingCode ?? null,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerDocument: o.customerDocument ?? null,
    countryCode: o.countryCode,
    subdivisionCode: o.subdivisionCode ?? null,
    city: o.city ?? null,
    state: o.state ?? null,
    addressLine: o.addressLine ?? null,
    subtotalCents: o.subtotalCents,
    shippingCents: o.shippingCents,
    discountCents: o.discountCents,
    totalCents: o.totalCents,
    currency: o.currency,
    stockDeducted: o.stockDeducted,
    promotionQuotaDeducted: Boolean(o.promotionQuotaDeducted),
    guideGeneratedAt: o.guideGeneratedAt ? new Date(o.guideGeneratedAt).toISOString() : null,
    repeatedFromOrderId: o.repeatedFromOrderId ?? null,
    canEditDetails: PRE_DISPATCH_ORDER_STATUSES.includes(status),
    allowedNextStatuses: getAllowedNextStatuses(status),
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: o.updatedAt ? new Date(o.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/**
 * Convierte un agregado `OrderWithDetails` al DTO completo de detalle para API y UI.
 */
export function mapOrderWithDetailsToDto(agg: OrderWithDetails): OrderDetailDto {
  const base = mapOrderToListItemDto(agg.order);
  return {
    ...base,
    addressComplement: agg.order.addressComplement ?? null,
    neighborhood: agg.order.neighborhood ?? null,
    postalCode: agg.order.postalCode ?? null,
    referenceNotes: agg.order.referenceNotes ?? null,
    notes: agg.order.notes ?? null,
    cancellationReason: agg.order.cancellationReason ?? null,
    issueNotes: agg.order.issueNotes ?? null,
    externalErpSystem: agg.order.externalErpSystem ?? null,
    externalErpReference: agg.order.externalErpReference ?? null,
    items: agg.items.map((item) => ({
      id: item.id,
      productId: item.productId ?? null,
      productName: item.productName,
      productSku: item.productSku ?? null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      unitCostCents: item.unitCostCents,
      selectedAttributes: item.selectedAttributes ?? null,
      tierMinQty: item.tierMinQty ?? null,
      promotionId: item.promotionId ?? null,
      promotionName: item.promotionName ?? null,
      originalUnitPriceCents: item.originalUnitPriceCents ?? null,
      lineTotalCents: item.lineTotalCents,
    })),
    events: agg.events.map((ev) => ({
      id: ev.id,
      fromStatus: ev.fromStatus ?? null,
      toStatus: ev.toStatus,
      actor: ev.actor,
      reason: ev.reason ?? null,
      createdAt: ev.createdAt ? new Date(ev.createdAt).toISOString() : new Date().toISOString(),
    })),
    returns: agg.returns.map((ret) => ({
      id: ret.id,
      reason: ret.reason,
      amountCents: ret.amountCents,
      status: ret.status,
      actor: ret.actor,
      createdAt: ret.createdAt ? new Date(ret.createdAt).toISOString() : new Date().toISOString(),
    })),
  };
}

/**
 * Interpola las variables estándar de las plantillas `SPEC-10` con datos reales del pedido.
 */
export function renderOrderTemplateVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

/**
 * Fachada multi-celda de pedidos por inquilino (`clientId`) para el Backoffice y rutas API (`SPEC-11`).
 *
 * Resuelve automáticamente la celda destino, delega reglas de negocio en {@link OrdersService},
 * dispara evaluaciones de stock bajo (`SPEC-08`) y renderiza guías imprimibles HTML/PDF.
 */
export class TenantOrdersService {
  private readonly ordersRepo: DrizzleOrdersRepository;
  private readonly customProductsService?: TenantProductsAndMediaService;
  private readonly ordersService: OrdersService;
  private readonly guideRenderer: OrderGuideRendererService;

  constructor(
    private readonly cellResolver: (clientId: string) => Promise<string> = (clientId) =>
      cellDatabasePoolManager.resolveCellIdForClient(clientId),
    ordersRepo?: DrizzleOrdersRepository,
    productsService?: TenantProductsAndMediaService,
    guideRenderer?: OrderGuideRendererService,
  ) {
    this.ordersRepo = ordersRepo ?? new DrizzleOrdersRepository();
    this.customProductsService = productsService;
    this.guideRenderer = guideRenderer ?? new OrderGuideRendererService();

    this.ordersService = new OrdersService(this.ordersRepo, new DrizzleCrmRepository(), {
      onStockMutated: async ({ clientId, productIds, actor }) => {
        await this.handleStockMutated(clientId, productIds, actor);
      },
      onOrderTransitionNotification: async ({ clientId, orderDetails, toStatus }) => {
        await this.handleTransitionNotification(clientId, orderDetails, toStatus);
      },
    });
  }

  private async handleStockMutated(
    clientId: string,
    productIds: string[],
    actor: string,
  ): Promise<void> {
    const productsService = this.customProductsService ?? getTenantProductsAndMediaService();
    for (const productId of productIds) {
      try {
        const evalRes = await productsService.evaluateLowStockAfterStockMutation(
          clientId,
          productId,
          actor,
        );
        if (evalRes.ok && evalRes.data.triggered && evalRes.data.dispatch) {
          await evalRes.data.dispatch();
        }
      } catch (errEval) {
        appLogger.warn("[TenantOrdersService] Error evaluando stock mínimo tras mutación", {
          clientId,
          productId,
          error: errEval instanceof Error ? errEval.message : String(errEval),
        });
      }
    }
  }

  private async handleTransitionNotification(
    clientId: string,
    orderDetails: OrderWithDetails,
    toStatus: OrderStatus,
  ): Promise<void> {
    const templateKey: BotDefaultMessageKey | null =
      toStatus === "confirmed"
        ? "order_confirmation"
        : toStatus === "dispatched"
          ? "dispatch_tracking"
          : toStatus === "delivery_issue"
            ? "delivery_issue"
            : null;
    if (!templateKey) return;

    try {
      const db = getDb();
      const [clientRow] = await db
        .select({ displayName: clients.displayName })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      const [botRow] = await db
        .select({ defaultMessages: tenantBots.defaultMessages })
        .from(tenantBots)
        .where(eq(tenantBots.clientId, clientId))
        .limit(1);

      const templateEntry = botRow?.defaultMessages?.[templateKey];
      if (!templateEntry || !templateEntry.enabled || !templateEntry.body) {
        return;
      }

      const rendered = renderOrderTemplateVariables(templateEntry.body, {
        customer_name: orderDetails.order.customerName,
        order_number: orderDetails.order.number,
        payment_instructions: orderDetails.order.paymentMethod,
        carrier_name: orderDetails.order.carrierName ?? "",
        tracking_code: orderDetails.order.trackingCode ?? "",
        business_name: clientRow?.displayName ?? "Mocter",
      });

      appLogger.info("tenant.order.notification_prepared", {
        clientId,
        orderId: orderDetails.order.id,
        orderNumber: orderDetails.order.number,
        templateKey,
        renderedLength: rendered.length,
        hasConversation: Boolean(orderDetails.order.chatwootConversationId),
      });
    } catch (notifyErr) {
      appLogger.warn("[TenantOrdersService] No se pudo preparar plantilla de notificación", {
        clientId,
        orderId: orderDetails.order.id,
        templateKey,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }
  }

  private async resolveMerchantInfo(
    clientId: string,
    fallbackLocale: "es" | "en" = "es",
  ): Promise<OrderGuideMerchantInfo> {
    try {
      const db = getDb();
      const [clientRow] = await db
        .select({
          displayName: clients.displayName,
          phone: clients.phone,
          commercialEmail: clients.commercialEmail,
          contactEmail: clients.contactEmail,
          addressLine: clients.addressLine,
          city: clients.city,
          taxId: clients.taxId,
          locale: clients.locale,
          logoMediaId: clients.logoMediaId,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      let logoUrl: string | null = null;
      const [branding] = await db
        .select({ logoUrl: clientBrandings.logoUrl })
        .from(clientBrandings)
        .where(eq(clientBrandings.clientId, clientId))
        .limit(1);

      if (branding?.logoUrl) {
        logoUrl = branding.logoUrl;
      } else if (clientRow?.logoMediaId) {
        const [media] = await db
          .select({ storageKey: mediaCatalog.storageKey })
          .from(mediaCatalog)
          .where(eq(mediaCatalog.id, clientRow.logoMediaId))
          .limit(1);
        if (media?.storageKey) {
          try {
            logoUrl = buildImgproxyUrl(media.storageKey, {
              width: 240,
              height: 120,
              resizingType: "fit",
            });
          } catch {
            logoUrl = null;
          }
        }
      }

      return {
        businessName: clientRow?.displayName ?? "Mocter Commerce",
        logoUrl,
        phone: clientRow?.phone ?? null,
        email: clientRow?.commercialEmail ?? clientRow?.contactEmail ?? null,
        address: clientRow?.addressLine ?? null,
        city: clientRow?.city ?? null,
        documentNumber: clientRow?.taxId ?? null,
        locale: clientRow?.locale === "en" ? "en" : fallbackLocale,
      };
    } catch {
      return {
        businessName: "Mocter Commerce",
        locale: fallbackLocale,
      };
    }
  }

  /**
   * Lista pedidos con paginación estándar (`SPEC-17`), filtros y resumen por grupos de estado.
   */
  async listOrders(
    clientId: string,
    filters: ListOrdersFilter = {},
  ): Promise<Result<OrderListResultDto>> {
    const cellId = await this.cellResolver(clientId);
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
    const sortBy: OrderListSortBy = filters.sortBy ?? "created_at";
    const sortDir: "asc" | "desc" = filters.sortDir ?? "desc";

    const res = await this.ordersService.listOrders(cellId, clientId, {
      ...filters,
      page,
      limit,
      sortBy,
      sortDir,
    });
    if (!res.ok) return res;

    const total = res.data.total;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const summary: OrderStatusSummaryCounts = res.data.summary ?? {
      total,
      pending: 0,
      preparingAndGuide: 0,
      inTransitAndIssue: 0,
      delivered: 0,
      cancelledAndReturned: 0,
      byStatus: {},
    };

    return ok({
      items: res.data.items.map(mapOrderToListItemDto),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      summary,
    });
  }

  /**
   * Obtiene el detalle integral de un pedido por ID con ítems, eventos, devoluciones y transiciones válidas.
   */
  async getOrderDetail(clientId: string, orderId: string): Promise<Result<OrderDetailDto>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.ordersService.getOrderById(cellId, clientId, orderId);
    if (!res.ok) return res;
    return ok(mapOrderWithDetailsToDto(res.data));
  }

  /**
   * Crea un nuevo pedido manual desde el Backoffice delegando en {@link OrdersService}.
   */
  async createOrder(
    clientId: string,
    input: Omit<RegisterOrderInput, "cellId" | "clientId">,
  ): Promise<Result<OrderDetailDto>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.ordersService.registerOrder({
      ...input,
      cellId,
      clientId,
      source: input.source ?? "manual",
    });
    if (!res.ok) return res;
    return ok(mapOrderWithDetailsToDto(res.data));
  }

  /**
   * Actualiza un pedido en etapa pre-despacho (`SPEC-11 RN-SPEC-11-03`).
   */
  async updateOrderDetails(
    clientId: string,
    orderId: string,
    input: Omit<UpdateOrderDetailsInput, "cellId" | "clientId" | "orderId">,
  ): Promise<Result<OrderDetailDto>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.ordersService.updateOrderDetails({
      ...input,
      cellId,
      clientId,
      orderId,
    });
    if (!res.ok) return res;
    return ok(mapOrderWithDetailsToDto(res.data));
  }

  /**
   * Ejecuta una transición de estado controlada en la máquina de 12 estados homologados.
   */
  async transitionOrderStatus(
    clientId: string,
    orderId: string,
    input: Omit<TransitionOrderStatusInput, "cellId" | "clientId" | "orderId">,
  ): Promise<Result<OrderDetailDto>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.ordersService.transitionStatus({
      ...input,
      cellId,
      clientId,
      orderId,
    });
    if (!res.ok) return res;
    return ok(mapOrderWithDetailsToDto(res.data));
  }

  /**
   * Ejecuta «Repetir Pedido» clonando ítems activos con precios actuales (`SPEC-11 RN-SPEC-11-05`).
   */
  async repeatOrder(
    clientId: string,
    orderId: string,
    actor: string,
    confirmImmediately: boolean = false,
  ): Promise<Result<RepeatOrderResult & { createdOrderDto?: OrderDetailDto }>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.ordersService.repeatOrder({
      cellId,
      clientId,
      orderId,
      actor,
      confirmImmediately,
    });
    if (!res.ok) return res;
    return ok({
      ...res.data,
      ...(res.data.createdOrder
        ? { createdOrderDto: mapOrderWithDetailsToDto(res.data.createdOrder) }
        : {}),
    });
  }

  /**
   * Genera la guía / remisión imprimible en formato HTML o PDF binario y registra la auditoría correspondiente.
   */
  async generateOrderGuide(params: {
    clientId: string;
    orderId: string;
    actor: string;
    format?: OrderGuideFormat;
    size?: OrderGuideSize;
    advanceStatus?: boolean;
    locale?: "es" | "en";
  }): Promise<Result<RenderedOrderGuide & { order: OrderDetailDto }>> {
    const cellId = await this.cellResolver(params.clientId);
    const recordRes = await this.ordersService.recordGuideGeneration({
      cellId,
      clientId: params.clientId,
      orderId: params.orderId,
      actor: params.actor,
      advanceStatus: params.advanceStatus,
    });
    if (!recordRes.ok) return recordRes;

    const rawAgg = await this.ordersService.getOrderById(cellId, params.clientId, params.orderId);
    if (!rawAgg.ok) return rawAgg;

    const merchant = await this.resolveMerchantInfo(params.clientId, params.locale ?? "es");
    const rendered = this.guideRenderer.render({
      orderDetails: rawAgg.data,
      merchant,
      format: params.format ?? "html",
      size: params.size ?? "10x15",
    });

    return ok({
      ...rendered,
      order: mapOrderWithDetailsToDto(rawAgg.data),
    });
  }

  /**
   * Actualiza el estado de pago de un pedido.
   */
  async updatePaymentStatus(
    clientId: string,
    orderId: string,
    paymentStatus: "pending" | "paid" | "refunded" | "failed",
  ): Promise<Result<CellOrder>> {
    const cellId = await this.cellResolver(clientId);
    return await this.ordersService.updatePaymentStatus(cellId, clientId, orderId, paymentStatus);
  }

  /**
   * Registra una devolución comercial para un pedido.
   */
  async registerReturn(
    clientId: string,
    orderId: string,
    input: Omit<RegisterOrderReturnInput, "cellId" | "clientId" | "orderId">,
  ): Promise<Result<CellOrderReturn>> {
    const cellId = await this.cellResolver(clientId);
    return await this.ordersService.registerReturn({
      ...input,
      cellId,
      clientId,
      orderId,
    });
  }

  /**
   * Lista transportadoras activas del comercio.
   */
  async listShippingCarriers(clientId: string) {
    const cellId = await this.cellResolver(clientId);
    return await this.ordersService.listShippingCarriers(cellId, clientId);
  }

  /**
   * Crea una nueva transportadora en el catálogo del comercio.
   */
  async createShippingCarrier(
    clientId: string,
    input: { name: string; trackingUrlTemplate?: string | null; actor: string },
  ) {
    const cellId = await this.cellResolver(clientId);
    return await this.ordersService.createShippingCarrier(cellId, clientId, {
      name: input.name.trim(),
      trackingUrlTemplate: input.trackingUrlTemplate?.trim() || null,
      isActive: true,
      createdBy: input.actor,
      updatedBy: input.actor,
    });
  }
}

export const tenantOrdersService = new TenantOrdersService();
