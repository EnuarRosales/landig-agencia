import type {
  CellOrder,
  NewCellOrder,
  CellOrderItem,
  NewCellOrderItem,
  CellOrderEvent,
  NewCellOrderEvent,
  CellOrderReturn,
  NewCellOrderReturn,
  CellShippingCarrier,
  NewCellShippingCarrier,
} from "../db/schemas/tenant/orders";
import type { ProductDynamicAttribute } from "../db/schemas/tenant/tenancy-catalog";

/**
 * Agregado completo de pedido con sus ítems, eventos y devoluciones correlacionadas.
 */
export interface OrderWithDetails {
  order: CellOrder;
  items: CellOrderItem[];
  events: CellOrderEvent[];
  returns: CellOrderReturn[];
}

/**
 * Error tipado de dominio emitido dentro de transacciones del repositorio para revertir cambios
 * atómicamente (por ejemplo `INSUFFICIENT_STOCK` o `ORDER_LOCKED_AFTER_DISPATCH`).
 */
export class OrderRepositoryDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OrderRepositoryDomainError";
  }
}

/**
 * Parámetros para la creación atómica de un pedido en la celda.
 */
export interface CreateOrderParams {
  order: Omit<NewCellOrder, "clientId">;
  items: Array<Omit<NewCellOrderItem, "clientId" | "orderId">>;
  event: Omit<NewCellOrderEvent, "clientId" | "orderId">;
  /** Si es `"deduct"`, descuenta inventario físico atómicamente en la misma transacción. */
  stockAction?: "deduct";
  /** Callback opcional con los IDs de productos físicos cuyo inventario fue mutado. */
  onTouchedProducts?: (productIds: string[]) => void;
}

/**
 * Parámetros de actualización pre-despacho de un pedido en la celda (`SPEC-11`).
 */
export interface UpdateOrderDetailsRepoParams {
  orderId: string;
  orderUpdates: Partial<Omit<NewCellOrder, "clientId" | "id" | "number">>;
  items?: Array<Omit<NewCellOrderItem, "clientId" | "orderId">>;
  event: Omit<NewCellOrderEvent, "clientId" | "orderId">;
  onTouchedProducts?: (productIds: string[]) => void;
}

/**
 * Opciones adicionales para la transición de estado en repositorio.
 */
export interface UpdateOrderStatusRepoOptions {
  carrierId?: string;
  carrierName?: string;
  trackingCode?: string;
  cancellationReason?: string;
  issueNotes?: string;
  stockAction?: "deduct" | "restore";
  onTouchedProducts?: (productIds: string[]) => void;
}

/**
 * Columnas de ordenamiento soportadas para el listado de pedidos (`SPEC-11`, `SPEC-17`).
 */
export type OrderListSortBy =
  | "created_at"
  | "total_cents"
  | "number"
  | "status"
  | "customer_name";

/**
 * Filtros de consulta, ordenamiento y paginación para el listado de pedidos.
 */
export interface ListOrdersFilter {
  query?: string;
  status?: string;
  statuses?: string[];
  paymentStatus?: string;
  shippingMethod?: string;
  carrier?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  offset?: number;
  sortBy?: OrderListSortBy;
  sortDir?: "asc" | "desc";
}

/**
 * Conteo consolidado de pedidos por grupo operativo y por estado (`SPEC-11`).
 */
export interface OrderStatusSummaryCounts {
  total: number;
  pending: number;
  preparingAndGuide: number;
  inTransitAndIssue: number;
  delivered: number;
  cancelledAndReturned: number;
  byStatus: Record<string, number>;
}

/**
 * Contexto vivo del catálogo, dirección y canal de pago para «Repetir Pedido» (`SPEC-11`).
 */
export interface RepeatOrderCatalogContext {
  productsById: Record<
    string,
    {
      id: string;
      name: string;
      sku: string | null;
      kind: string;
      compositionType: string;
      availability: string;
      status: string;
      priceCents: number;
      salePriceCents: number | null;
      costPriceCents: number;
      stockQuantity: number | null;
      attributes: ProductDynamicAttribute[];
      comboEffectiveStock: number | null;
      hasInactiveComboComponent: boolean;
    }
  >;
  defaultContactAddress: {
    id: string;
    countryCode: string;
    subdivisionCode: string | null;
    state: string | null;
    city: string;
    addressLine: string;
    addressComplement: string | null;
    neighborhood: string | null;
    postalCode: string | null;
    referenceNotes: string | null;
  } | null;
  activePaymentChannel: {
    id: string;
    channelCode: string;
    displayName: string;
    instructions: string | null;
  } | null;
}

/**
 * Snapshot de contacto y dirección para autocompletado y validación en pedidos (`SPEC-09`, `SPEC-11`).
 */
export interface OrderContactAddressSnapshot {
  contact: {
    id: string;
    fullName: string;
    phoneMobile: string | null;
    documentNumber: string | null;
  };
  address: {
    id: string;
    countryCode: string;
    subdivisionCode: string | null;
    state: string | null;
    city: string;
    addressLine: string;
    addressComplement: string | null;
    neighborhood: string | null;
    postalCode: string | null;
    referenceNotes: string | null;
  } | null;
}

/**
 * Contrato de repositorio para el dominio de pedidos y fulfillment en celdas de datos.
 */
export interface IOrdersRepository {
  /**
   * Genera de forma atómica y concurrente el siguiente número legible de pedido
   * en formato `ORD-YYYYMM-####` mediante UPSERT sobre `order_sequences`.
   */
  getNextOrderNumber(
    cellId: string,
    clientId: string,
    period: string,
  ): Promise<string>;

  /**
   * Consulta un pedido activo por conversación de Chatwoot para garantizar idempotencia.
   * Estados activos pre-despacho: 'pending_confirmation', 'confirmed', 'preparing', 'guide_generated'.
   */
  findActiveOrderByChatwootConversationId(
    cellId: string,
    clientId: string,
    chatwootConversationId: number,
  ): Promise<OrderWithDetails | null>;

  /**
   * Consulta un pedido por su identificador UUID y client_id en la celda.
   */
  findOrderById(
    cellId: string,
    clientId: string,
    orderId: string,
  ): Promise<OrderWithDetails | null>;

  /**
   * Consulta un pedido por su número consecutivo legible `ORD-YYYYMM-####`.
   */
  findOrderByNumber(
    cellId: string,
    clientId: string,
    number: string,
  ): Promise<OrderWithDetails | null>;

  /**
   * Lista pedidos con filtros, ordenamiento y paginación.
   */
  listOrders(
    cellId: string,
    clientId: string,
    filters?: ListOrdersFilter,
  ): Promise<{ items: CellOrder[]; total: number }>;

  /**
   * Obtiene métricas agregadas de conteo por estado para las tarjetas resumen del listado (`SPEC-11`).
   */
  getOrderStatusSummary?(
    cellId: string,
    clientId: string,
  ): Promise<OrderStatusSummaryCounts>;

  /**
   * Crea un nuevo pedido con sus líneas de producto, evento de auditoría y descuento opcional de inventario.
   */
  createOrder(
    cellId: string,
    clientId: string,
    params: CreateOrderParams,
  ): Promise<OrderWithDetails>;

  /**
   * Actualiza los datos editables de un pedido pre-despacho y sus líneas ajustando deltas de inventario.
   */
  updateOrderDetails?(
    cellId: string,
    clientId: string,
    params: UpdateOrderDetailsRepoParams,
  ): Promise<OrderWithDetails>;

  /**
   * Transiciona el estado del pedido, muta inventario si corresponde e inserta el evento inmutable de trazabilidad.
   */
  updateOrderStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    toStatus: string,
    event: Omit<NewCellOrderEvent, "clientId" | "orderId">,
    options?: UpdateOrderStatusRepoOptions,
  ): Promise<OrderWithDetails>;

  /**
   * Registra la marca de tiempo de generación de guía y opcionalmente avanza de `preparing` a `guide_generated`.
   */
  markGuideGenerated?(
    cellId: string,
    clientId: string,
    orderId: string,
    event: Omit<NewCellOrderEvent, "clientId" | "orderId">,
    advanceToGuideGenerated?: boolean,
  ): Promise<OrderWithDetails>;

  /**
   * Actualiza el estado de pago del pedido.
   */
  updateOrderPaymentStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    paymentStatus: string,
  ): Promise<CellOrder>;

  /**
   * Registra una devolución y audita el evento correspondiente.
   */
  createOrderReturn(
    cellId: string,
    clientId: string,
    orderReturn: Omit<NewCellOrderReturn, "clientId">,
    event?: Omit<NewCellOrderEvent, "clientId" | "orderId">,
  ): Promise<CellOrderReturn>;

  /**
   * Consulta el catálogo de transportadoras del inquilino.
   */
  listShippingCarriers(
    cellId: string,
    clientId: string,
  ): Promise<CellShippingCarrier[]>;

  /**
   * Crea o registra una transportadora en el catálogo del inquilino.
   */
  createShippingCarrier(
    cellId: string,
    clientId: string,
    carrier: Omit<NewCellShippingCarrier, "clientId">,
  ): Promise<CellShippingCarrier>;

  /**
   * Obtiene el contexto actual de catálogo, dirección por defecto y canal de pago para «Repetir Pedido».
   */
  getRepeatOrderCatalogContext?(
    cellId: string,
    clientId: string,
    productIds: string[],
    contactId?: string | null,
    paymentChannelId?: string | null,
  ): Promise<RepeatOrderCatalogContext>;

  /**
   * Consulta un canal de pago activo del comercio por su identificador.
   */
  getActivePaymentChannel?(
    cellId: string,
    clientId: string,
    channelId: string,
  ): Promise<{ id: string; channelCode: string; displayName: string; instructions: string | null } | null>;

  /**
   * Consulta un contacto y opcionalmente una de sus direcciones guardadas en CRM.
   */
  getContactAndAddress?(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId?: string | null,
  ): Promise<OrderContactAddressSnapshot | null>;

  /**
   * Consulta snapshot de productos por IDs para validar precios, costos y atributos al crear/editar.
   */
  getProductsForOrderItems?(
    cellId: string,
    clientId: string,
    productIds: string[],
  ): Promise<RepeatOrderCatalogContext["productsById"]>;

  /**
   * Agrega métricas comerciales de ventas, ticket promedio y devoluciones en caliente para REP-001.
   */
  getOrderMetrics(
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
  }>;
}
