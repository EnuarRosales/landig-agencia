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
 * Parámetros para la creación atómica de un pedido en la celda.
 */
export interface CreateOrderParams {
  order: Omit<NewCellOrder, "clientId">;
  items: Array<Omit<NewCellOrderItem, "clientId" | "orderId">>;
  event: Omit<NewCellOrderEvent, "clientId" | "orderId">;
}

/**
 * Filtros de consulta y paginación para el listado de pedidos.
 */
export interface ListOrdersFilter {
  query?: string;
  status?: string;
  paymentStatus?: string;
  shippingMethod?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
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
   * Estados activos: 'registered', 'confirmed', 'preparing', 'shipped'.
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
   * Crea un nuevo pedido con sus líneas de producto y evento de auditoría en una transacción atómica.
   */
  createOrder(
    cellId: string,
    clientId: string,
    params: CreateOrderParams,
  ): Promise<OrderWithDetails>;

  /**
   * Transiciona el estado del pedido e inserta el evento inmutable de trazabilidad.
   */
  updateOrderStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    toStatus: string,
    event: Omit<NewCellOrderEvent, "clientId" | "orderId">,
    carrierUpdate?: { carrierId?: string; carrierName?: string; trackingCode?: string },
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
