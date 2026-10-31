import { ok, err, type Result } from "../types/result";
import type {
  IOrdersRepository,
  OrderWithDetails,
  ListOrdersFilter,
} from "../repositories/orders.repository.interface";
import type {
  CellOrder,
  CellOrderItem,
  CellOrderEvent,
  CellOrderReturn,
  CellShippingCarrier,
  NewCellShippingCarrier,
} from "../db/schemas/tenant/orders";
import type { ICrmRepository } from "../repositories/crm.repository.interface";

/**
 * Ítem de entrada para el registro de pedidos.
 */
export interface OrderItemInput {
  productId?: string;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPriceCents: number;
  tierMinQty?: number;
}

/**
 * Datos del cliente destinatario del pedido.
 */
export interface OrderCustomerInput {
  name: string;
  phone: string;
  document?: string;
}

/**
 * Datos de entrega y logística del pedido.
 */
export interface OrderShippingInput {
  method: "home" | "office";
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  carrierId?: string;
  carrierName?: string;
  shippingCents?: number;
}

/**
 * Contrato de entrada para registrar pedidos (BOT-002 RF-05.2, ORD-001 §5).
 */
export interface RegisterOrderInput {
  cellId: string;
  clientId: string;
  chatwootConversationId?: number;
  prospectId?: string;
  source?: "bot" | "manual";
  paymentMethod: string;
  paymentStatus?: "pending" | "paid" | "refunded" | "failed";
  customer: OrderCustomerInput;
  shipping: OrderShippingInput;
  items: OrderItemInput[];
  discountCents?: number;
  currency?: string;
  notes?: string;
  actor?: string;
}

/**
 * Entrada para la transición de estado del pedido en la máquina de estados.
 */
export interface TransitionOrderStatusInput {
  cellId: string;
  clientId: string;
  orderId: string;
  toStatus: "confirmed" | "preparing" | "shipped" | "delivered" | "cancelled" | "returned";
  actor: string;
  reason?: string;
  carrierId?: string;
  carrierName?: string;
  trackingCode?: string;
  confirmRefundIfPaid?: boolean;
}

/**
 * Entrada para registrar una devolución comercial de producto.
 */
export interface RegisterOrderReturnInput {
  cellId: string;
  clientId: string;
  orderId: string;
  reason: string;
  amountCents: number;
  actor: string;
  status?: "requested" | "approved" | "received" | "refunded";
}

/**
 * Matriz determinista de transiciones válidas de la máquina de estados (ORD-001 §4).
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  registered: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

/**
 * Servicio de dominio para la gestión del ciclo de vida de pedidos, fulfillment y devoluciones.
 */
export class OrdersService {
  constructor(
    private readonly ordersRepo: IOrdersRepository,
    private readonly crmRepo?: ICrmRepository,
  ) {}

  /**
   * Obtiene la clave de periodo YYYYMM para secuencias mensuales.
   */
  private getPeriodKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}${month}`;
  }

  /**
   * Registra un pedido asegurando idempotencia por conversación, cálculo exacto de totales
   * y avance automático del prospecto en CRM a cliente (ORD-001 T-04, T-05, T-09).
   */
  async registerOrder(input: RegisterOrderInput): Promise<Result<OrderWithDetails>> {
    const {
      cellId,
      clientId,
      chatwootConversationId,
      prospectId,
      source = "bot",
      paymentMethod,
      paymentStatus = "pending",
      customer,
      shipping,
      items,
      discountCents = 0,
      currency = "COP",
      notes,
      actor = source,
    } = input;

    // 1. Idempotencia estricta por conversación de Chatwoot
    if (chatwootConversationId !== undefined && chatwootConversationId !== null) {
      const existingActive = await this.ordersRepo.findActiveOrderByChatwootConversationId(
        cellId,
        clientId,
        chatwootConversationId,
      );
      if (existingActive) {
        return ok(existingActive);
      }
    }

    // 2. Validaciones básicas de ítems
    if (!items || items.length === 0) {
      return err("El pedido debe contener al menos una línea de producto.", "ORDER_EMPTY_ITEMS");
    }

    for (const item of items) {
      if (!item.productName || item.productName.trim().length === 0) {
        return err("El nombre del producto en el ítem es obligatorio.", "ORDER_ITEM_INVALID_NAME");
      }
      if (item.quantity <= 0) {
        return err(
          `La cantidad del ítem ${item.productName} debe ser mayor a cero.`,
          "ORDER_ITEM_INVALID_QUANTITY",
        );
      }
      if (item.unitPriceCents < 0) {
        return err(
          `El precio unitario del ítem ${item.productName} no puede ser negativo.`,
          "ORDER_ITEM_INVALID_PRICE",
        );
      }
    }

    // 3. Validación de método de envío y documento de cliente (RF-05.1)
    if (shipping.method === "office") {
      if (!customer.document || customer.document.trim().length === 0) {
        return err(
          "El documento de identidad del destinatario es obligatorio para reclamo en oficina.",
          "ORDER_OFFICE_DOCUMENT_REQUIRED",
        );
      }
    }

    if (!customer.name || customer.name.trim().length === 0) {
      return err("El nombre del cliente es obligatorio.", "ORDER_CUSTOMER_NAME_REQUIRED");
    }

    if (!customer.phone || customer.phone.trim().length === 0) {
      return err("El teléfono del cliente es obligatorio.", "ORDER_CUSTOMER_PHONE_REQUIRED");
    }

    // 4. Cálculo de totales inmutables en centavos (T-05)
    let subtotalCents = 0;
    const orderItemsToCreate = items.map((item) => {
      const lineTotalCents = item.quantity * item.unitPriceCents;
      subtotalCents += lineTotalCents;
      return {
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        tierMinQty: item.tierMinQty,
        lineTotalCents,
        createdBy: actor,
        updatedBy: actor,
      };
    });

    const shippingCents = shipping.shippingCents ?? 0;
    if (shippingCents < 0) {
      return err("El costo de envío no puede ser negativo.", "ORDER_SHIPPING_NEGATIVE");
    }
    if (discountCents < 0) {
      return err("El descuento no puede ser negativo.", "ORDER_DISCOUNT_NEGATIVE");
    }

    const totalCents = subtotalCents + shippingCents - discountCents;
    if (totalCents < 0) {
      return err(
        "El total del pedido no puede ser negativo tras aplicar descuentos.",
        "ORDER_TOTAL_NEGATIVE",
      );
    }

    // 5. Generación del consecutivo mensual único atómico
    const period = this.getPeriodKey();
    const orderNumber = await this.ordersRepo.getNextOrderNumber(cellId, clientId, period);

    // 6. Creación atómica del pedido, líneas y evento inicial
    const created = await this.ordersRepo.createOrder(cellId, clientId, {
      order: {
        number: orderNumber,
        prospectId,
        chatwootConversationId,
        source,
        status: "registered",
        paymentMethod,
        paymentStatus,
        shippingMethod: shipping.method,
        carrierId: shipping.carrierId,
        carrierName: shipping.carrierName,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim(),
        customerDocument: customer.document?.trim(),
        addressLine: shipping.addressLine?.trim(),
        city: shipping.city?.trim(),
        state: shipping.state?.trim(),
        postalCode: shipping.postalCode?.trim(),
        subtotalCents,
        shippingCents,
        discountCents,
        totalCents,
        currency: currency.toUpperCase().slice(0, 3),
        notes: notes?.trim(),
        createdBy: actor,
        updatedBy: actor,
      },
      items: orderItemsToCreate,
      event: {
        fromStatus: null,
        toStatus: "registered",
        actor,
        reason: "Registro inicial de pedido",
      },
    });

    // 7. Integración con CRM-001 (T-09): actualizar etapa a 'customer' si hay prospecto correlacionado
    if (this.crmRepo && prospectId) {
      try {
        await this.crmRepo.updateContact(cellId, clientId, prospectId, {
          stage: "customer",
          updatedBy: actor,
        });
      } catch {
        // La actualización de CRM es auxiliar y no debe revertir el pedido ya persistido
      }
    }

    return ok(created);
  }

  /**
   * Transiciona el estado del pedido validando la máquina de estados y registrando trazabilidad.
   */
  async transitionStatus(input: TransitionOrderStatusInput): Promise<Result<OrderWithDetails>> {
    const {
      cellId,
      clientId,
      orderId,
      toStatus,
      actor,
      reason,
      carrierId,
      carrierName,
      trackingCode,
      confirmRefundIfPaid = false,
    } = input;

    const existing = await this.ordersRepo.findOrderById(cellId, clientId, orderId);
    if (!existing) {
      return err(`Pedido con id ${orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    const currentStatus = existing.order.status;

    // 1. Validar que la transición esté en la matriz de estados
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      return err(
        `Transición inválida de estado '${currentStatus}' a '${toStatus}'.`,
        "INVALID_STATE_TRANSITION",
      );
    }

    // 2. Reglas específicas para cancelación
    if (toStatus === "cancelled") {
      if (!reason || reason.trim().length === 0) {
        return err(
          "El motivo de cancelación es obligatorio para cancelar un pedido.",
          "CANCEL_REASON_REQUIRED",
        );
      }

      // Si el pedido ya estaba pagado, exigir confirmación de reembolso
      if (existing.order.paymentStatus === "paid") {
        const hasRefundedReturn = existing.returns.some((r) => r.status === "refunded");
        if (!hasRefundedReturn && !confirmRefundIfPaid) {
          return err(
            "No se puede cancelar un pedido con estado pagado ('paid') sin procesar su reembolso.",
            "REFUND_REQUIRED_FOR_PAID_CANCELLATION",
          );
        }
      }
    }

    // 3. Reglas específicas para despacho (shipped)
    if (toStatus === "shipped") {
      const effectiveCarrierName = carrierName ?? existing.order.carrierName;
      const effectiveCarrierId = carrierId ?? existing.order.carrierId;
      if (!effectiveCarrierName && !effectiveCarrierId) {
        return err(
          "Para pasar el pedido a despacho ('shipped') se debe especificar una transportadora.",
          "CARRIER_REQUIRED_FOR_SHIPPED",
        );
      }
    }

    // 4. Reglas específicas para devolución (returned)
    if (toStatus === "returned") {
      const hasReceivedReturn = existing.returns.some((r) => r.status === "received");
      if (!hasReceivedReturn) {
        return err(
          "Para marcar el pedido como devuelto ('returned'), debe existir una devolución en estado 'received'.",
          "RECEIVED_RETURN_REQUIRED",
        );
      }
    }

    // 5. Aplicar la transición en el repositorio
    const updated = await this.ordersRepo.updateOrderStatus(
      cellId,
      clientId,
      orderId,
      toStatus,
      {
        fromStatus: currentStatus,
        toStatus,
        actor,
        reason: reason?.trim(),
      },
      carrierId || carrierName || trackingCode
        ? { carrierId, carrierName, trackingCode }
        : undefined,
    );

    return ok(updated);
  }

  /**
   * Actualiza el estado de cobro/pago del pedido.
   */
  async updatePaymentStatus(
    cellId: string,
    clientId: string,
    orderId: string,
    paymentStatus: "pending" | "paid" | "refunded" | "failed",
  ): Promise<Result<CellOrder>> {
    const existing = await this.ordersRepo.findOrderById(cellId, clientId, orderId);
    if (!existing) {
      return err(`Pedido con id ${orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    const updated = await this.ordersRepo.updateOrderPaymentStatus(
      cellId,
      clientId,
      orderId,
      paymentStatus,
    );
    return ok(updated);
  }

  /**
   * Registra una devolución física o comercial de un pedido entregado.
   */
  async registerReturn(input: RegisterOrderReturnInput): Promise<Result<CellOrderReturn>> {
    const {
      cellId,
      clientId,
      orderId,
      reason,
      amountCents,
      actor,
      status = "requested",
    } = input;

    const existing = await this.ordersRepo.findOrderById(cellId, clientId, orderId);
    if (!existing) {
      return err(`Pedido con id ${orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    if (!reason || reason.trim().length === 0) {
      return err("El motivo de la devolución es obligatorio.", "RETURN_REASON_REQUIRED");
    }

    if (amountCents < 0) {
      return err("El monto de la devolución no puede ser negativo.", "RETURN_AMOUNT_NEGATIVE");
    }

    const orderReturn = await this.ordersRepo.createOrderReturn(
      cellId,
      clientId,
      {
        orderId,
        reason: reason.trim(),
        amountCents,
        status,
        actor,
        createdBy: actor,
        updatedBy: actor,
      },
      {
        fromStatus: existing.order.status,
        toStatus: status === "received" ? "returned" : existing.order.status,
        actor,
        reason: `Devolución registrada: ${reason.trim()} (monto: ${amountCents} centavos)`,
      },
    );

    // Si la devolución se recibe directamente, transicionar el pedido a 'returned' si estaba en 'delivered'
    if (status === "received" && existing.order.status === "delivered") {
      await this.ordersRepo.updateOrderStatus(
        cellId,
        clientId,
        orderId,
        "returned",
        {
          fromStatus: "delivered",
          toStatus: "returned",
          actor,
          reason: `Devolución física recibida con éxito`,
        },
      );
    }

    return ok(orderReturn);
  }

  /**
   * Obtiene el detalle completo de un pedido por su identificador único.
   */
  async getOrderById(
    cellId: string,
    clientId: string,
    orderId: string,
  ): Promise<Result<OrderWithDetails>> {
    const order = await this.ordersRepo.findOrderById(cellId, clientId, orderId);
    if (!order) {
      return err(`Pedido con id ${orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }
    return ok(order);
  }

  /**
   * Obtiene el detalle de un pedido por su número consecutivo `ORD-YYYYMM-####`.
   */
  async getOrderByNumber(
    cellId: string,
    clientId: string,
    orderNumber: string,
  ): Promise<Result<OrderWithDetails>> {
    const order = await this.ordersRepo.findOrderByNumber(cellId, clientId, orderNumber);
    if (!order) {
      return err(`Pedido con número ${orderNumber} no encontrado.`, "ORDER_NOT_FOUND");
    }
    return ok(order);
  }

  /**
   * Lista pedidos con filtros y paginación.
   */
  async listOrders(
    cellId: string,
    clientId: string,
    filters?: ListOrdersFilter,
  ): Promise<Result<{ items: CellOrder[]; total: number }>> {
    const result = await this.ordersRepo.listOrders(cellId, clientId, filters);
    return ok(result);
  }

  /**
   * Lista las transportadoras activas del inquilino.
   */
  async listShippingCarriers(
    cellId: string,
    clientId: string,
  ): Promise<Result<CellShippingCarrier[]>> {
    const carriers = await this.ordersRepo.listShippingCarriers(cellId, clientId);
    return ok(carriers);
  }

  /**
   * Crea una nueva transportadora en el catálogo del inquilino.
   */
  async createShippingCarrier(
    cellId: string,
    clientId: string,
    carrier: Omit<NewCellShippingCarrier, "clientId">,
  ): Promise<Result<CellShippingCarrier>> {
    if (!carrier.name || carrier.name.trim().length === 0) {
      return err("El nombre de la transportadora es obligatorio.", "CARRIER_NAME_REQUIRED");
    }

    const created = await this.ordersRepo.createShippingCarrier(cellId, clientId, carrier);
    return ok(created);
  }

  /**
   * Obtiene métricas agregadas de ventas, pedidos y devoluciones en caliente para REP-001 (T-10).
   */
  async getOrderMetrics(
    cellId: string,
    clientId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    Result<{
      totalOrders: number;
      totalSalesCents: number;
      averageTicketCents: number;
      deliveredOrders: number;
      cancelledOrders: number;
      returnedOrders: number;
      totalReturnsCents: number;
    }>
  > {
    if (startDate > endDate) {
      return err("La fecha inicial no puede ser superior a la fecha final.", "INVALID_DATE_RANGE");
    }

    const metrics = await this.ordersRepo.getOrderMetrics(cellId, clientId, startDate, endDate);
    return ok(metrics);
  }
}
