import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import {
  ORDER_STATUS_LIST,
  type OrderStatus,
  type CellOrder,
  type CellOrderReturn,
  type CellShippingCarrier,
  type NewCellShippingCarrier,
} from "../db/schemas/tenant/orders";
import {
  OrderRepositoryDomainError,
  type IOrdersRepository,
  type OrderWithDetails,
  type ListOrdersFilter,
  type OrderStatusSummaryCounts,
} from "../repositories/orders.repository.interface";
import type { ICrmRepository } from "../repositories/crm.repository.interface";
import {
  normalizeAndValidatePhoneE164,
  resolveCountryAlpha2FromInput,
  resolveIsoSubdivision,
} from "../geo/index";

/**
 * Etiquetas bilingües oficiales (Title Case) para los 12 estados homologados Dropi / Effi (`SPEC-11`).
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, { es: string; en: string }> = {
  pending_confirmation: { es: "Pendiente De Confirmación", en: "Pending Confirmation" },
  confirmed: { es: "Confirmado", en: "Confirmed" },
  preparing: { es: "En Preparación", en: "Preparing" },
  guide_generated: { es: "Guía Generada", en: "Guide Generated" },
  dispatched: { es: "Despachado", en: "Dispatched" },
  in_transit: { es: "En Tránsito", en: "In Transit" },
  out_for_delivery: { es: "En Reparto", en: "Out For Delivery" },
  delivery_issue: { es: "Novedad En Entrega", en: "Delivery Issue" },
  delivered: { es: "Entregado", en: "Delivered" },
  return_in_progress: { es: "Devolución En Curso", en: "Return In Progress" },
  returned: { es: "Devuelto", en: "Returned" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
};

/**
 * Estados previos al despacho físico en los cuales aún se permite edición integral del pedido (`RN-SPEC-11-03`).
 */
export const PRE_DISPATCH_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending_confirmation",
  "confirmed",
  "preparing",
  "guide_generated",
];

/**
 * Matriz operativa flexible de transiciones válidas para los 12 estados homologados (`SPEC-11 RN-SPEC-11-02`).
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["preparing", "guide_generated", "dispatched", "cancelled"],
  preparing: ["guide_generated", "dispatched", "cancelled"],
  guide_generated: ["dispatched", "cancelled"],
  dispatched: ["in_transit", "out_for_delivery", "delivery_issue", "delivered", "return_in_progress"],
  in_transit: ["out_for_delivery", "delivery_issue", "delivered", "return_in_progress"],
  out_for_delivery: ["delivered", "delivery_issue", "return_in_progress"],
  delivery_issue: ["out_for_delivery", "delivered", "return_in_progress"],
  delivered: ["return_in_progress", "returned"],
  return_in_progress: ["returned", "cancelled"],
  returned: [],
  cancelled: [],
};

/**
 * Retorna la lista de estados destino válidos desde un estado actual dado.
 */
export function getAllowedNextStatuses(currentStatus: string): OrderStatus[] {
  const list = ALLOWED_ORDER_TRANSITIONS[currentStatus as OrderStatus];
  return list ? [...list] : [];
}

/**
 * Ítem de entrada para el registro o actualización de pedidos.
 */
export interface OrderItemInput {
  productId?: string;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number;
  selectedAttributes?: Record<string, string> | null;
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
  contactAddressId?: string;
  countryCode?: string;
  subdivisionCode?: string;
  addressLine?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  referenceNotes?: string;
  geoResolutionStatus?: "resolved" | "soft_normalized" | "iso_resolved" | "provider_resolved" | "unresolved" | "ambiguous";
  rawLocationInput?: string;
  providerGeoRefs?: Record<string, string | null>;
  carrierId?: string;
  carrierName?: string;
  trackingCode?: string;
  shippingCents?: number;
}

/**
 * Contrato de entrada para registrar pedidos (`BOT-002 RF-05.2`, `ORD-001 §5`, `SPEC-11`).
 */
export interface RegisterOrderInput {
  cellId: string;
  clientId: string;
  chatwootConversationId?: number;
  prospectId?: string;
  /** Alias semántico de `prospectId` (`SPEC-11`). */
  contactId?: string;
  source?: "bot" | "manual";
  initialStatus?: "pending_confirmation" | "confirmed";
  paymentMethod: string;
  paymentChannelId?: string;
  paymentStatus?: "pending" | "paid" | "refunded" | "failed";
  customer: OrderCustomerInput;
  shipping: OrderShippingInput;
  items: OrderItemInput[];
  discountCents?: number;
  currency?: string;
  notes?: string;
  repeatedFromOrderId?: string;
  externalErpSystem?: string;
  externalErpReference?: string;
  actor?: string;
}

/**
 * Entrada para edición integral pre-despacho de un pedido (`SPEC-11 §9.2`).
 */
export interface UpdateOrderDetailsInput {
  cellId: string;
  clientId: string;
  orderId: string;
  actor: string;
  prospectId?: string | null;
  contactId?: string | null;
  paymentMethod?: string;
  paymentChannelId?: string | null;
  paymentStatus?: "pending" | "paid" | "refunded" | "failed";
  customer?: Partial<OrderCustomerInput>;
  shipping?: Partial<OrderShippingInput>;
  items?: OrderItemInput[];
  discountCents?: number;
  notes?: string | null;
  externalErpSystem?: string | null;
  externalErpReference?: string | null;
}

/**
 * Entrada para la transición de estado del pedido en la máquina de 12 estados (`SPEC-11`).
 */
export interface TransitionOrderStatusInput {
  cellId: string;
  clientId: string;
  orderId: string;
  toStatus: OrderStatus;
  actor: string;
  actorRole?: string;
  reason?: string;
  issueNotes?: string;
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
  actorRole?: string;
  status?: "requested" | "approved" | "received" | "refunded";
}

/**
 * Ítem descartado durante «Repetir Pedido» por estar inactivo o eliminado (`SPEC-11 RN-SPEC-11-05`).
 */
export interface RepeatOrderSkippedItem {
  productId: string | null;
  productName: string;
  productSku: string | null;
  quantity: number;
  reason: "PRODUCT_NOT_FOUND" | "PRODUCT_INACTIVE" | "COMBO_COMPONENT_INACTIVE";
  message: string;
}

/**
 * Resultado de «Repetir Pedido»: borrador prellenado o pedido creado inmediatamente.
 */
export interface RepeatOrderResult {
  mode: "draft" | "created";
  repeatedFromOrderId: string;
  repeatedFromOrderNumber: string;
  skippedItems: RepeatOrderSkippedItem[];
  warnings: string[];
  draft: Omit<RegisterOrderInput, "cellId" | "clientId">;
  createdOrder?: OrderWithDetails;
}

/**
 * Hook desacoplado invocado tras transiciones relevantes de pedido para evaluar alertas de stock bajo
 * o renderizar plantillas de mensajes `SPEC-10`.
 */
export interface OrdersServiceSideEffects {
  onStockMutated?: (params: {
    cellId: string;
    clientId: string;
    productIds: string[];
    actor: string;
  }) => Promise<void> | void;
  onOrderTransitionNotification?: (params: {
    cellId: string;
    clientId: string;
    orderDetails: OrderWithDetails;
    fromStatus: string;
    toStatus: OrderStatus;
    actor: string;
  }) => Promise<void> | void;
}

function mapRepoGeoStatus(
  status?: OrderShippingInput["geoResolutionStatus"],
): "resolved" | "soft_normalized" | "ambiguous" | "unresolved" | undefined {
  if (!status) return undefined;
  if (status === "provider_resolved") return "resolved";
  if (status === "iso_resolved") return "soft_normalized";
  return status;
}

function isOwnerOrPlatformRole(actorRole?: string): boolean {
  if (!actorRole) return true;
  const normalized = actorRole.trim().toLowerCase();
  return (
    normalized === "tenant_owner" ||
    normalized === "tenancy_owner" ||
    normalized === "platform_owner" ||
    normalized === "platform_admin"
  );
}

/**
 * Servicio de dominio para la gestión del ciclo de vida de pedidos, inventario, repetición y guías (`SPEC-11`).
 */
export class OrdersService {
  constructor(
    private readonly ordersRepo: IOrdersRepository,
    private readonly crmRepo?: ICrmRepository,
    private readonly sideEffects?: OrdersServiceSideEffects,
  ) {}

  private getPeriodKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}${month}`;
  }

  private async runStockMutatedHook(
    cellId: string,
    clientId: string,
    productIds: string[],
    actor: string,
  ): Promise<void> {
    if (!this.sideEffects?.onStockMutated || productIds.length === 0) return;
    try {
      await this.sideEffects.onStockMutated({ cellId, clientId, productIds, actor });
    } catch (hookError) {
      appLogger.warn("[OrdersService] Error no fatal en hook de inventario", {
        clientId,
        error: hookError instanceof Error ? hookError.message : String(hookError),
      });
    }
  }

  private async runTransitionNotificationHook(params: {
    cellId: string;
    clientId: string;
    orderDetails: OrderWithDetails;
    fromStatus: string;
    toStatus: OrderStatus;
    actor: string;
  }): Promise<void> {
    if (!this.sideEffects?.onOrderTransitionNotification) return;
    if (
      params.toStatus !== "confirmed" &&
      params.toStatus !== "dispatched" &&
      params.toStatus !== "delivery_issue"
    ) {
      return;
    }
    try {
      await this.sideEffects.onOrderTransitionNotification(params);
    } catch (hookError) {
      appLogger.warn("[OrdersService] Error no fatal en hook de notificación de pedido", {
        clientId: params.clientId,
        orderId: params.orderDetails.order.id,
        toStatus: params.toStatus,
        error: hookError instanceof Error ? hookError.message : String(hookError),
      });
    }
  }

  /**
   * Registra un pedido asegurando idempotencia por conversación, cálculo exacto de totales,
   * snapshot de atributos/costos/dirección/canal y avance automático del contacto en CRM.
   */
  async registerOrder(input: RegisterOrderInput): Promise<Result<OrderWithDetails>> {
    const result = await this.registerOrderDetailed(input);
    return result.ok ? ok(result.data.details) : result;
  }

  /**
   * Igual que {@link OrdersService.registerOrder} pero indica si el pedido se creó en esta
   * llamada (`created = true`) o se devolvió el existente por idempotencia (`created = false`).
   */
  async registerOrderDetailed(
    input: RegisterOrderInput,
  ): Promise<Result<{ details: OrderWithDetails; created: boolean }>> {
    const {
      cellId,
      clientId,
      chatwootConversationId,
      prospectId: rawProspectId,
      contactId: rawContactId,
      source = "bot",
      initialStatus = "pending_confirmation",
      paymentMethod: rawPaymentMethod,
      paymentChannelId,
      paymentStatus = "pending",
      customer,
      shipping,
      items,
      discountCents = 0,
      currency = "COP",
      notes,
      repeatedFromOrderId,
      externalErpSystem,
      externalErpReference,
      actor = source,
    } = input;

    const effectiveContactId = rawContactId ?? rawProspectId;

    // 1. Idempotencia estricta por conversación de Chatwoot
    if (chatwootConversationId !== undefined && chatwootConversationId !== null) {
      const existingActive = await this.ordersRepo.findActiveOrderByChatwootConversationId(
        cellId,
        clientId,
        chatwootConversationId,
      );
      if (existingActive) {
        return ok({ details: existingActive, created: false });
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
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
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

    // 3. Validación de canal de pago (`SPEC-05`) y libreta CRM (`SPEC-09`)
    let resolvedPaymentMethod = (rawPaymentMethod ?? "").trim();
    if (paymentChannelId && this.ordersRepo.getActivePaymentChannel) {
      const channel = await this.ordersRepo.getActivePaymentChannel(cellId, clientId, paymentChannelId);
      if (!channel) {
        return err("El canal de pago seleccionado no existe o no está activo.", "INVALID_PAYMENT_CHANNEL");
      }
      if (!resolvedPaymentMethod) {
        resolvedPaymentMethod = channel.displayName;
      }
    }
    if (!resolvedPaymentMethod) {
      resolvedPaymentMethod = "transferencia";
    }

    let resolvedShippingFromAddress: Partial<OrderShippingInput> = {};
    if (effectiveContactId && this.ordersRepo.getContactAndAddress) {
      const contactSnap = await this.ordersRepo.getContactAndAddress(
        cellId,
        clientId,
        effectiveContactId,
        shipping.contactAddressId ?? null,
      );
      if (!contactSnap) {
        return err("El contacto CRM seleccionado no existe.", "CONTACT_NOT_FOUND");
      }
      if (shipping.contactAddressId && !contactSnap.address) {
        return err("La dirección seleccionada no pertenece al contacto.", "CONTACT_ADDRESS_NOT_FOUND");
      }
      if (contactSnap.address) {
        resolvedShippingFromAddress = {
          countryCode: contactSnap.address.countryCode,
          subdivisionCode: contactSnap.address.subdivisionCode ?? undefined,
          state: contactSnap.address.state ?? undefined,
          city: contactSnap.address.city,
          addressLine: contactSnap.address.addressLine,
          addressComplement: contactSnap.address.addressComplement ?? undefined,
          neighborhood: contactSnap.address.neighborhood ?? undefined,
          postalCode: contactSnap.address.postalCode ?? undefined,
          referenceNotes: contactSnap.address.referenceNotes ?? undefined,
        };
      }
    }

    // 4. Validar atributos requeridos y resolver costo unitario snapshot desde catálogo (`SPEC-08`)
    const itemProductIds = items
      .map((i) => i.productId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    const productsSnapshot =
      itemProductIds.length > 0 && this.ordersRepo.getProductsForOrderItems
        ? await this.ordersRepo.getProductsForOrderItems(cellId, clientId, itemProductIds)
        : {};

    for (const item of items) {
      if (!item.productId) continue;
      const prod = productsSnapshot[item.productId];
      if (!prod) continue;
      for (const attr of prod.attributes) {
        if (attr.requiredForOrder) {
          const val = item.selectedAttributes?.[attr.name];
          if (!val || String(val).trim().length === 0) {
            return err(
              `El producto "${item.productName}" requiere seleccionar el atributo "${attr.name}".`,
              "ORDER_REQUIRED_ATTRIBUTE_MISSING",
            );
          }
        }
      }
    }

    const effectiveShipping: OrderShippingInput = {
      ...resolvedShippingFromAddress,
      ...shipping,
      countryCode: shipping.countryCode ?? resolvedShippingFromAddress.countryCode,
      subdivisionCode: shipping.subdivisionCode ?? resolvedShippingFromAddress.subdivisionCode,
      state: shipping.state ?? resolvedShippingFromAddress.state,
      city: shipping.city ?? resolvedShippingFromAddress.city,
      addressLine: shipping.addressLine ?? resolvedShippingFromAddress.addressLine,
      addressComplement: shipping.addressComplement ?? resolvedShippingFromAddress.addressComplement,
      neighborhood: shipping.neighborhood ?? resolvedShippingFromAddress.neighborhood,
      postalCode: shipping.postalCode ?? resolvedShippingFromAddress.postalCode,
      referenceNotes: shipping.referenceNotes ?? resolvedShippingFromAddress.referenceNotes,
    };

    // 5. Validación de método de envío, documento y teléfono E.164
    if (effectiveShipping.method === "office") {
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

    const resolvedCountryCode = resolveCountryAlpha2FromInput(effectiveShipping.countryCode) ?? "CO";
    const phoneRes = normalizeAndValidatePhoneE164({
      rawPhone: customer.phone,
      defaultCountryCode: resolvedCountryCode,
      allowLocalWithDefaultCountry: source === "bot",
    });
    if (!phoneRes.ok) {
      return err(phoneRes.error, "ORDER_CUSTOMER_PHONE_INVALID");
    }
    const normalizedCustomerPhone = phoneRes.data.e164;

    const rawSubInput = effectiveShipping.subdivisionCode?.trim() || effectiveShipping.state?.trim() || "";
    const isoSub = rawSubInput
      ? resolveIsoSubdivision({ countryCode: resolvedCountryCode, input: rawSubInput })
      : null;
    const resolvedSubdivisionCode =
      effectiveShipping.subdivisionCode?.trim() ||
      (isoSub?.status === "resolved" ? isoSub.matches[0]?.code ?? undefined : undefined);
    const resolvedStateName =
      effectiveShipping.state?.trim() ||
      (isoSub?.status === "resolved" ? isoSub.matches[0]?.name ?? undefined : undefined);
    const resolvedGeoStatus =
      mapRepoGeoStatus(effectiveShipping.geoResolutionStatus) ??
      (resolvedSubdivisionCode && effectiveShipping.city?.trim() ? "soft_normalized" : "unresolved");

    // 6. Cálculo de totales inmutables en centavos
    let subtotalCents = 0;
    const orderItemsToCreate = items.map((item) => {
      const prod = item.productId ? productsSnapshot[item.productId] : undefined;
      const unitCostCents = item.unitCostCents ?? prod?.costPriceCents ?? 0;
      const lineTotalCents = item.quantity * item.unitPriceCents;
      subtotalCents += lineTotalCents;
      return {
        productId: item.productId,
        productName: item.productName.trim(),
        productSku: item.productSku ?? prod?.sku ?? undefined,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        unitCostCents: Math.max(0, unitCostCents),
        selectedAttributes: item.selectedAttributes ?? null,
        tierMinQty: item.tierMinQty,
        lineTotalCents,
        createdBy: actor,
        updatedBy: actor,
      };
    });

    const shippingCents = effectiveShipping.shippingCents ?? 0;
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

    // 7. Generación del consecutivo mensual único atómico
    const period = this.getPeriodKey();
    const orderNumber = await this.ordersRepo.getNextOrderNumber(cellId, clientId, period);

    // 8. Creación atómica del pedido (con descuento de stock si nace 'confirmed')
    let touchedProducts: string[] = [];
    let created: OrderWithDetails;
    try {
      created = await this.ordersRepo.createOrder(cellId, clientId, {
        order: {
          number: orderNumber,
          prospectId: effectiveContactId,
          contactAddressId: effectiveShipping.contactAddressId,
          chatwootConversationId,
          source,
          status: initialStatus,
          paymentMethod: resolvedPaymentMethod,
          paymentChannelId,
          paymentStatus,
          shippingMethod: effectiveShipping.method,
          carrierId: effectiveShipping.carrierId,
          carrierName: effectiveShipping.carrierName?.trim(),
          trackingCode: effectiveShipping.trackingCode?.trim(),
          customerName: customer.name.trim(),
          customerPhone: normalizedCustomerPhone,
          customerDocument: customer.document?.trim(),
          countryCode: resolvedCountryCode,
          subdivisionCode: resolvedSubdivisionCode,
          addressLine: effectiveShipping.addressLine?.trim(),
          addressComplement: effectiveShipping.addressComplement?.trim(),
          neighborhood: effectiveShipping.neighborhood?.trim(),
          city: effectiveShipping.city?.trim(),
          state: resolvedStateName,
          postalCode: effectiveShipping.postalCode?.trim(),
          referenceNotes: effectiveShipping.referenceNotes?.trim(),
          geoResolutionStatus: resolvedGeoStatus,
          rawLocationInput:
            effectiveShipping.rawLocationInput?.trim() ||
            [effectiveShipping.countryCode, effectiveShipping.state, effectiveShipping.city]
              .filter(Boolean)
              .join(" / ") ||
            undefined,
          providerGeoRefs: effectiveShipping.providerGeoRefs ?? {},
          subtotalCents,
          shippingCents,
          discountCents,
          totalCents,
          currency: currency.toUpperCase().slice(0, 3),
          notes: notes?.trim(),
          repeatedFromOrderId,
          externalErpSystem: externalErpSystem?.trim(),
          externalErpReference: externalErpReference?.trim(),
          createdBy: actor,
          updatedBy: actor,
        },
        items: orderItemsToCreate,
        event: {
          fromStatus: null,
          toStatus: initialStatus,
          actor,
          reason: repeatedFromOrderId
            ? `Pedido creado mediante Repetir Pedido (${repeatedFromOrderId})`
            : "Registro inicial de pedido",
        },
        ...(initialStatus === "confirmed"
          ? {
              stockAction: "deduct" as const,
              onTouchedProducts: (ids: string[]) => {
                touchedProducts = ids;
              },
            }
          : {}),
      });
    } catch (error) {
      if (error instanceof OrderRepositoryDomainError) {
        return err(error.message, error.code);
      }
      throw error;
    }

    if (touchedProducts.length > 0) {
      await this.runStockMutatedHook(cellId, clientId, touchedProducts, actor);
    }

    if (initialStatus === "confirmed") {
      await this.runTransitionNotificationHook({
        cellId,
        clientId,
        orderDetails: created,
        fromStatus: "pending_confirmation",
        toStatus: "confirmed",
        actor,
      });
    }

    // 9. Integración con CRM-001: actualizar etapa a 'customer' si hay contacto correlacionado
    if (this.crmRepo && effectiveContactId) {
      try {
        await this.crmRepo.updateContact(cellId, clientId, effectiveContactId, {
          stage: "customer",
          updatedBy: actor,
        });
      } catch {
        // La actualización de CRM es auxiliar y no debe revertir el pedido ya persistido
      }
    }

    appLogger.info("tenant.order.created", {
      clientId,
      orderId: created.order.id,
      orderNumber: created.order.number,
      toStatus: created.order.status,
      source,
    });

    return ok({ details: created, created: true });
  }

  /**
   * Edita los detalles de un pedido antes del despacho (`RN-SPEC-11-03`).
   * Bloquea con `ORDER_LOCKED_AFTER_DISPATCH` si ya alcanzó `dispatched` o posterior.
   */
  async updateOrderDetails(input: UpdateOrderDetailsInput): Promise<Result<OrderWithDetails>> {
    if (!this.ordersRepo.updateOrderDetails) {
      return err("Actualización de pedido no soportada por el repositorio.", "UNSUPPORTED_OPERATION");
    }

    const existing = await this.ordersRepo.findOrderById(input.cellId, input.clientId, input.orderId);
    if (!existing) {
      return err(`Pedido con id ${input.orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    if (!PRE_DISPATCH_ORDER_STATUSES.includes(existing.order.status as OrderStatus)) {
      return err(
        "No se puede editar un pedido que ya fue despachado o finalizado.",
        "ORDER_LOCKED_AFTER_DISPATCH",
      );
    }

    const orderUpdates: Record<string, unknown> = {
      updatedBy: input.actor,
    };

    const nextContactId = input.contactId !== undefined ? input.contactId : input.prospectId;
    if (nextContactId !== undefined) {
      orderUpdates.prospectId = nextContactId;
    }

    if (input.paymentChannelId !== undefined) {
      if (input.paymentChannelId && this.ordersRepo.getActivePaymentChannel) {
        const ch = await this.ordersRepo.getActivePaymentChannel(
          input.cellId,
          input.clientId,
          input.paymentChannelId,
        );
        if (!ch) {
          return err("El canal de pago seleccionado no existe o no está activo.", "INVALID_PAYMENT_CHANNEL");
        }
        orderUpdates.paymentChannelId = ch.id;
        orderUpdates.paymentMethod = input.paymentMethod?.trim() || ch.displayName;
      } else {
        orderUpdates.paymentChannelId = input.paymentChannelId;
      }
    }
    if (input.paymentMethod !== undefined && !orderUpdates.paymentMethod) {
      orderUpdates.paymentMethod = input.paymentMethod.trim();
    }
    if (input.paymentStatus !== undefined) {
      orderUpdates.paymentStatus = input.paymentStatus;
    }

    // Validar cliente y teléfono si cambian
    const nextShippingMethod = input.shipping?.method ?? (existing.order.shippingMethod as "home" | "office");
    const nextDoc =
      input.customer?.document !== undefined
        ? input.customer.document?.trim() || null
        : existing.order.customerDocument;

    if (nextShippingMethod === "office" && (!nextDoc || nextDoc.length === 0)) {
      return err(
        "El documento de identidad del destinatario es obligatorio para reclamo en oficina.",
        "ORDER_OFFICE_DOCUMENT_REQUIRED",
      );
    }

    if (input.customer?.name !== undefined) {
      if (!input.customer.name.trim()) {
        return err("El nombre del cliente es obligatorio.", "ORDER_CUSTOMER_NAME_REQUIRED");
      }
      orderUpdates.customerName = input.customer.name.trim();
    }
    if (input.customer?.document !== undefined) {
      orderUpdates.customerDocument = nextDoc;
    }

    const nextCountryCode =
      resolveCountryAlpha2FromInput(input.shipping?.countryCode) ??
      existing.order.countryCode ??
      "CO";
    if (input.customer?.phone !== undefined) {
      const phoneRes = normalizeAndValidatePhoneE164({
        rawPhone: input.customer.phone,
        defaultCountryCode: nextCountryCode,
        allowLocalWithDefaultCountry: false,
      });
      if (!phoneRes.ok) {
        return err(phoneRes.error, "ORDER_CUSTOMER_PHONE_INVALID");
      }
      orderUpdates.customerPhone = phoneRes.data.e164;
    }

    if (input.shipping) {
      if (input.shipping.method !== undefined) orderUpdates.shippingMethod = input.shipping.method;
      if (input.shipping.contactAddressId !== undefined) {
        orderUpdates.contactAddressId = input.shipping.contactAddressId;
      }
      if (input.shipping.countryCode !== undefined) orderUpdates.countryCode = nextCountryCode;
      if (input.shipping.subdivisionCode !== undefined) {
        orderUpdates.subdivisionCode = input.shipping.subdivisionCode?.trim() || null;
      }
      if (input.shipping.addressLine !== undefined) {
        orderUpdates.addressLine = input.shipping.addressLine?.trim() || null;
      }
      if (input.shipping.addressComplement !== undefined) {
        orderUpdates.addressComplement = input.shipping.addressComplement?.trim() || null;
      }
      if (input.shipping.neighborhood !== undefined) {
        orderUpdates.neighborhood = input.shipping.neighborhood?.trim() || null;
      }
      if (input.shipping.city !== undefined) {
        orderUpdates.city = input.shipping.city?.trim() || null;
      }
      if (input.shipping.state !== undefined) {
        orderUpdates.state = input.shipping.state?.trim() || null;
      }
      if (input.shipping.postalCode !== undefined) {
        orderUpdates.postalCode = input.shipping.postalCode?.trim() || null;
      }
      if (input.shipping.referenceNotes !== undefined) {
        orderUpdates.referenceNotes = input.shipping.referenceNotes?.trim() || null;
      }
      if (input.shipping.carrierId !== undefined) {
        orderUpdates.carrierId = input.shipping.carrierId || null;
      }
      if (input.shipping.carrierName !== undefined) {
        orderUpdates.carrierName = input.shipping.carrierName?.trim() || null;
      }
      if (input.shipping.trackingCode !== undefined) {
        orderUpdates.trackingCode = input.shipping.trackingCode?.trim() || null;
      }
    }

    if (input.notes !== undefined) orderUpdates.notes = input.notes?.trim() || null;
    if (input.externalErpSystem !== undefined) {
      orderUpdates.externalErpSystem = input.externalErpSystem?.trim() || null;
    }
    if (input.externalErpReference !== undefined) {
      orderUpdates.externalErpReference = input.externalErpReference?.trim() || null;
    }

    let itemsToSave:
      | Array<{
          productId?: string;
          productName: string;
          productSku?: string;
          quantity: number;
          unitPriceCents: number;
          unitCostCents: number;
          selectedAttributes: Record<string, string> | null;
          tierMinQty?: number;
          lineTotalCents: number;
          createdBy: string;
          updatedBy: string;
        }>
      | undefined;

    let nextSubtotalCents = existing.order.subtotalCents;
    if (input.items !== undefined) {
      if (input.items.length === 0) {
        return err("El pedido debe contener al menos una línea de producto.", "ORDER_EMPTY_ITEMS");
      }
      const productIds = input.items
        .map((i) => i.productId)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
      const productsSnapshot =
        productIds.length > 0 && this.ordersRepo.getProductsForOrderItems
          ? await this.ordersRepo.getProductsForOrderItems(input.cellId, input.clientId, productIds)
          : {};

      nextSubtotalCents = 0;
      itemsToSave = [];
      for (const item of input.items) {
        if (!item.productName || !item.productName.trim()) {
          return err("El nombre del producto en el ítem es obligatorio.", "ORDER_ITEM_INVALID_NAME");
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
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
        const prod = item.productId ? productsSnapshot[item.productId] : undefined;
        if (prod) {
          for (const attr of prod.attributes) {
            if (attr.requiredForOrder) {
              const val = item.selectedAttributes?.[attr.name];
              if (!val || String(val).trim().length === 0) {
                return err(
                  `El producto "${item.productName}" requiere seleccionar el atributo "${attr.name}".`,
                  "ORDER_REQUIRED_ATTRIBUTE_MISSING",
                );
              }
            }
          }
        }
        const lineTotalCents = item.quantity * item.unitPriceCents;
        nextSubtotalCents += lineTotalCents;
        itemsToSave.push({
          productId: item.productId,
          productName: item.productName.trim(),
          productSku: item.productSku ?? prod?.sku ?? undefined,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          unitCostCents: Math.max(0, item.unitCostCents ?? prod?.costPriceCents ?? 0),
          selectedAttributes: item.selectedAttributes ?? null,
          tierMinQty: item.tierMinQty,
          lineTotalCents,
          createdBy: input.actor,
          updatedBy: input.actor,
        });
      }
      orderUpdates.subtotalCents = nextSubtotalCents;
    }

    const nextShippingCents = input.shipping?.shippingCents ?? existing.order.shippingCents;
    const nextDiscountCents = input.discountCents ?? existing.order.discountCents;
    if (nextShippingCents < 0) {
      return err("El costo de envío no puede ser negativo.", "ORDER_SHIPPING_NEGATIVE");
    }
    if (nextDiscountCents < 0) {
      return err("El descuento no puede ser negativo.", "ORDER_DISCOUNT_NEGATIVE");
    }
    const nextTotalCents = nextSubtotalCents + nextShippingCents - nextDiscountCents;
    if (nextTotalCents < 0) {
      return err(
        "El total del pedido no puede ser negativo tras aplicar descuentos.",
        "ORDER_TOTAL_NEGATIVE",
      );
    }
    orderUpdates.shippingCents = nextShippingCents;
    orderUpdates.discountCents = nextDiscountCents;
    orderUpdates.totalCents = nextTotalCents;

    let touchedProducts: string[] = [];
    let updated: OrderWithDetails;
    try {
      updated = await this.ordersRepo.updateOrderDetails(input.cellId, input.clientId, {
        orderId: input.orderId,
        orderUpdates: orderUpdates as Partial<CellOrder>,
        items: itemsToSave,
        event: {
          fromStatus: existing.order.status,
          toStatus: existing.order.status,
          actor: input.actor,
          reason: "Edición pre-despacho del pedido",
        },
        onTouchedProducts: (ids) => {
          touchedProducts = ids;
        },
      });
    } catch (error) {
      if (error instanceof OrderRepositoryDomainError) {
        return err(error.message, error.code);
      }
      throw error;
    }

    if (touchedProducts.length > 0) {
      await this.runStockMutatedHook(input.cellId, input.clientId, touchedProducts, input.actor);
    }

    return ok(updated);
  }

  /**
   * Transiciona el estado del pedido validando la máquina de 12 estados, RBAC, requisitos de guía,
   * ajuste idempotente de inventario y registro inmutable de auditoría (`SPEC-11`).
   */
  async transitionStatus(input: TransitionOrderStatusInput): Promise<Result<OrderWithDetails>> {
    const {
      cellId,
      clientId,
      orderId,
      toStatus,
      actor,
      actorRole,
      reason,
      issueNotes,
      carrierId,
      carrierName,
      trackingCode,
      confirmRefundIfPaid = false,
    } = input;

    if (!ORDER_STATUS_LIST.includes(toStatus)) {
      return err(`Estado de pedido desconocido: '${toStatus}'.`, "INVALID_ORDER_STATUS");
    }

    const existing = await this.ordersRepo.findOrderById(cellId, clientId, orderId);
    if (!existing) {
      return err(`Pedido con id ${orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    const currentStatus = existing.order.status;

    // 1. Validar que la transición esté permitida en la matriz operativa
    const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus as OrderStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      return err(
        `Transición inválida de estado '${currentStatus}' a '${toStatus}'.`,
        "INVALID_STATE_TRANSITION",
      );
    }

    // 2. Reglas específicas para cancelación y RBAC
    if (toStatus === "cancelled") {
      if (!reason || reason.trim().length === 0) {
        return err(
          "El motivo de cancelación es obligatorio para cancelar un pedido.",
          "CANCEL_REASON_REQUIRED",
        );
      }

      if (existing.order.paymentStatus === "paid") {
        if (!isOwnerOrPlatformRole(actorRole)) {
          return err(
            "Solo el propietario del comercio puede cancelar un pedido que ya registra pago.",
            "FORBIDDEN_PAID_CANCELLATION",
          );
        }
        const hasRefundedReturn = existing.returns.some((r) => r.status === "refunded");
        if (!hasRefundedReturn && !confirmRefundIfPaid) {
          return err(
            "No se puede cancelar un pedido con estado pagado ('paid') sin confirmar o procesar su reembolso.",
            "REFUND_REQUIRED_FOR_PAID_CANCELLATION",
          );
        }
      }
    }

    // 3. Reglas para novedad en entrega (`delivery_issue`)
    const effectiveIssueNotes = issueNotes?.trim() || reason?.trim();
    if (toStatus === "delivery_issue" && (!effectiveIssueNotes || effectiveIssueNotes.length === 0)) {
      return err(
        "Debe especificar el detalle de la novedad de entrega.",
        "ISSUE_NOTES_REQUIRED",
      );
    }

    // 4. Reglas de dirección y guía para `guide_generated` y `dispatched`
    if (toStatus === "guide_generated" || toStatus === "dispatched") {
      const hasAddress = Boolean(existing.order.addressLine?.trim() && existing.order.city?.trim());
      if (existing.order.shippingMethod !== "office" && !hasAddress) {
        return err(
          "El pedido requiere una dirección y ciudad de entrega válida antes de generar guía o despachar.",
          "ADDRESS_REQUIRED_FOR_DISPATCH",
        );
      }
    }

    if (toStatus === "dispatched") {
      const effectiveCarrierName = carrierName?.trim() || existing.order.carrierName?.trim();
      const effectiveCarrierId = carrierId || existing.order.carrierId;
      const effectiveTrackingCode = trackingCode?.trim() || existing.order.trackingCode?.trim();
      if ((!effectiveCarrierName && !effectiveCarrierId) || !effectiveTrackingCode) {
        return err(
          "Para pasar el pedido a 'dispatched' es obligatorio indicar la transportadora y el número de guía.",
          "CARRIER_AND_TRACKING_REQUIRED_FOR_DISPATCH",
        );
      }
    }

    // 5. Regla para `returned`: si viene directo de `delivered`, exigir devolución en estado `received`
    if (toStatus === "returned" && currentStatus === "delivered") {
      const hasReceivedReturn = existing.returns.some((r) => r.status === "received");
      if (!hasReceivedReturn) {
        return err(
          "Para marcar un pedido entregado directamente como devuelto ('returned'), debe existir una devolución en estado 'received' o iniciar 'return_in_progress'.",
          "RECEIVED_RETURN_REQUIRED",
        );
      }
    }

    // 6. Determinar mutación idempotente de inventario
    let stockAction: "deduct" | "restore" | undefined;
    if (
      (toStatus === "confirmed" ||
        toStatus === "preparing" ||
        toStatus === "guide_generated" ||
        toStatus === "dispatched") &&
      !existing.order.stockDeducted
    ) {
      stockAction = "deduct";
    } else if (
      (toStatus === "cancelled" || toStatus === "returned") &&
      existing.order.stockDeducted
    ) {
      stockAction = "restore";
    }

    let touchedProducts: string[] = [];
    const hasExtraOptions = Boolean(
      carrierId ||
        carrierName ||
        trackingCode ||
        stockAction ||
        toStatus === "cancelled" ||
        toStatus === "delivery_issue",
    );

    let updated: OrderWithDetails;
    try {
      updated = await this.ordersRepo.updateOrderStatus(
        cellId,
        clientId,
        orderId,
        toStatus,
        {
          fromStatus: currentStatus,
          toStatus,
          actor,
          reason:
            toStatus === "delivery_issue"
              ? effectiveIssueNotes
              : reason?.trim(),
        },
        hasExtraOptions
          ? {
              ...(carrierId ? { carrierId } : {}),
              ...(carrierName ? { carrierName: carrierName.trim() } : {}),
              ...(trackingCode ? { trackingCode: trackingCode.trim() } : {}),
              ...(toStatus === "cancelled" && reason ? { cancellationReason: reason.trim() } : {}),
              ...(toStatus === "delivery_issue" && effectiveIssueNotes
                ? { issueNotes: effectiveIssueNotes }
                : {}),
              ...(stockAction
                ? {
                    stockAction,
                    onTouchedProducts: (ids: string[]) => {
                      touchedProducts = ids;
                    },
                  }
                : {}),
            }
          : undefined,
      );
    } catch (error) {
      if (error instanceof OrderRepositoryDomainError) {
        return err(error.message, error.code);
      }
      throw error;
    }

    if (touchedProducts.length > 0) {
      await this.runStockMutatedHook(cellId, clientId, touchedProducts, actor);
    }

    await this.runTransitionNotificationHook({
      cellId,
      clientId,
      orderDetails: updated,
      fromStatus: currentStatus,
      toStatus,
      actor,
    });

    appLogger.info("tenant.order.status_changed", {
      clientId,
      orderId,
      fromStatus: currentStatus,
      toStatus,
      stockAction: stockAction ?? "none",
    });

    return ok(updated);
  }

  /**
   * Clona ítems activos de un pedido existente recalculando precios vigentes de catálogo
   * (`SPEC-11 RN-SPEC-11-05`). Si `confirmImmediately: true`, crea el nuevo pedido enseguida.
   */
  async repeatOrder(params: {
    cellId: string;
    clientId: string;
    orderId: string;
    actor: string;
    confirmImmediately?: boolean;
  }): Promise<Result<RepeatOrderResult>> {
    const base = await this.ordersRepo.findOrderById(params.cellId, params.clientId, params.orderId);
    if (!base) {
      return err(`Pedido con id ${params.orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    const productIds = base.items
      .map((i) => i.productId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    const ctx = this.ordersRepo.getRepeatOrderCatalogContext
      ? await this.ordersRepo.getRepeatOrderCatalogContext(
          params.cellId,
          params.clientId,
          productIds,
          base.order.prospectId,
          base.order.paymentChannelId,
        )
      : {
          productsById: {},
          defaultContactAddress: null,
          activePaymentChannel: null,
        };

    const skippedItems: RepeatOrderSkippedItem[] = [];
    const warnings: string[] = [];
    const nextItems: OrderItemInput[] = [];

    for (const oldItem of base.items) {
      if (!oldItem.productId) {
        nextItems.push({
          productName: oldItem.productName,
          productSku: oldItem.productSku ?? undefined,
          quantity: oldItem.quantity,
          unitPriceCents: oldItem.unitPriceCents,
          unitCostCents: oldItem.unitCostCents,
          selectedAttributes: oldItem.selectedAttributes ?? null,
        });
        warnings.push(`"${oldItem.productName}" se copió como ítem manual sin vínculo de catálogo.`);
        continue;
      }

      const live = ctx.productsById[oldItem.productId];
      if (!live) {
        const msg = `El producto "${oldItem.productName}" fue eliminado del catálogo y no se incluyó.`;
        skippedItems.push({
          productId: oldItem.productId,
          productName: oldItem.productName,
          productSku: oldItem.productSku ?? null,
          quantity: oldItem.quantity,
          reason: "PRODUCT_NOT_FOUND",
          message: msg,
        });
        warnings.push(msg);
        continue;
      }

      if (live.status !== "active") {
        const msg = `El producto "${live.name}" se encuentra inactivo en catálogo y fue excluido.`;
        skippedItems.push({
          productId: live.id,
          productName: live.name,
          productSku: live.sku,
          quantity: oldItem.quantity,
          reason: "PRODUCT_INACTIVE",
          message: msg,
        });
        warnings.push(msg);
        continue;
      }

      if (live.compositionType === "combo" && live.hasInactiveComboComponent) {
        const msg = `El combo "${live.name}" contiene un componente inactivo y fue excluido.`;
        skippedItems.push({
          productId: live.id,
          productName: live.name,
          productSku: live.sku,
          quantity: oldItem.quantity,
          reason: "COMBO_COMPONENT_INACTIVE",
          message: msg,
        });
        warnings.push(msg);
        continue;
      }

      const currentPriceCents =
        live.salePriceCents !== null && live.salePriceCents > 0
          ? live.salePriceCents
          : live.priceCents;

      if (currentPriceCents !== oldItem.unitPriceCents) {
        warnings.push(
          `El precio de "${live.name}" se actualizó de ${oldItem.unitPriceCents / 100} a ${currentPriceCents / 100} según el catálogo vigente.`,
        );
      }

      const availableStock =
        live.compositionType === "combo" ? live.comboEffectiveStock : live.stockQuantity;
      if (
        live.kind === "physical" &&
        live.availability === "in_stock" &&
        availableStock !== null &&
        availableStock < oldItem.quantity
      ) {
        warnings.push(
          `Stock limitado para "${live.name}": disponible ${availableStock}, solicitado originalmente ${oldItem.quantity}.`,
        );
      }

      nextItems.push({
        productId: live.id,
        productName: live.name,
        productSku: live.sku ?? undefined,
        quantity: oldItem.quantity,
        unitPriceCents: currentPriceCents,
        unitCostCents: live.costPriceCents,
        selectedAttributes: oldItem.selectedAttributes ?? null,
      });
    }

    const addr = ctx.defaultContactAddress;
    const draft: Omit<RegisterOrderInput, "cellId" | "clientId"> = {
      prospectId: base.order.prospectId ?? undefined,
      contactId: base.order.prospectId ?? undefined,
      source: "manual",
      initialStatus: "pending_confirmation",
      paymentMethod: ctx.activePaymentChannel?.displayName ?? base.order.paymentMethod,
      paymentChannelId: ctx.activePaymentChannel?.id,
      paymentStatus: "pending",
      customer: {
        name: base.order.customerName,
        phone: base.order.customerPhone,
        document: base.order.customerDocument ?? undefined,
      },
      shipping: {
        method: (base.order.shippingMethod as "home" | "office") || "home",
        contactAddressId: addr?.id ?? base.order.contactAddressId ?? undefined,
        countryCode: addr?.countryCode ?? base.order.countryCode,
        subdivisionCode: addr?.subdivisionCode ?? base.order.subdivisionCode ?? undefined,
        state: addr?.state ?? base.order.state ?? undefined,
        city: addr?.city ?? base.order.city ?? undefined,
        addressLine: addr?.addressLine ?? base.order.addressLine ?? undefined,
        addressComplement: addr?.addressComplement ?? base.order.addressComplement ?? undefined,
        neighborhood: addr?.neighborhood ?? base.order.neighborhood ?? undefined,
        postalCode: addr?.postalCode ?? base.order.postalCode ?? undefined,
        referenceNotes: addr?.referenceNotes ?? base.order.referenceNotes ?? undefined,
        carrierId: base.order.carrierId ?? undefined,
        carrierName: base.order.carrierName ?? undefined,
        shippingCents: base.order.shippingCents,
      },
      items: nextItems,
      discountCents: 0,
      currency: base.order.currency,
      notes: base.order.notes ?? undefined,
      repeatedFromOrderId: base.order.id,
      actor: params.actor,
    };

    if (!params.confirmImmediately) {
      appLogger.info("tenant.order.repeated", {
        clientId: params.clientId,
        sourceOrderId: base.order.id,
        mode: "draft",
        skippedCount: skippedItems.length,
      });
      return ok({
        mode: "draft",
        repeatedFromOrderId: base.order.id,
        repeatedFromOrderNumber: base.order.number,
        skippedItems,
        warnings,
        draft,
      });
    }

    if (nextItems.length === 0) {
      return err(
        "Ninguno de los productos del pedido original está activo en el catálogo para crear el nuevo pedido.",
        "REPEAT_ORDER_NO_ACTIVE_ITEMS",
      );
    }

    const createRes = await this.registerOrderDetailed({
      ...draft,
      cellId: params.cellId,
      clientId: params.clientId,
    });
    if (!createRes.ok) {
      return createRes;
    }

    appLogger.info("tenant.order.repeated", {
      clientId: params.clientId,
      sourceOrderId: base.order.id,
      newOrderId: createRes.data.details.order.id,
      mode: "created",
      skippedCount: skippedItems.length,
    });

    return ok({
      mode: "created",
      repeatedFromOrderId: base.order.id,
      repeatedFromOrderNumber: base.order.number,
      skippedItems,
      warnings,
      draft,
      createdOrder: createRes.data.details,
    });
  }

  /**
   * Registra la generación de guía imprimible y opcionalmente avanza el pedido de `preparing` a `guide_generated`.
   */
  async recordGuideGeneration(params: {
    cellId: string;
    clientId: string;
    orderId: string;
    actor: string;
    advanceStatus?: boolean;
  }): Promise<Result<OrderWithDetails>> {
    const existing = await this.ordersRepo.findOrderById(params.cellId, params.clientId, params.orderId);
    if (!existing) {
      return err(`Pedido con id ${params.orderId} no encontrado.`, "ORDER_NOT_FOUND");
    }

    const hasAddress = Boolean(existing.order.addressLine?.trim() && existing.order.city?.trim());
    if (existing.order.shippingMethod !== "office" && !hasAddress) {
      return err(
        "El pedido requiere dirección y ciudad de entrega para generar su guía.",
        "ADDRESS_REQUIRED_FOR_DISPATCH",
      );
    }

    if (!this.ordersRepo.markGuideGenerated) {
      return ok(existing);
    }

    const updated = await this.ordersRepo.markGuideGenerated(
      params.cellId,
      params.clientId,
      params.orderId,
      {
        fromStatus: existing.order.status,
        toStatus:
          params.advanceStatus && existing.order.status === "preparing"
            ? "guide_generated"
            : existing.order.status,
        actor: params.actor,
        reason: "Generación de guía / remisión imprimible",
      },
      Boolean(params.advanceStatus),
    );

    appLogger.info("tenant.order.guide_generated", {
      clientId: params.clientId,
      orderId: params.orderId,
      orderNumber: updated.order.number,
      status: updated.order.status,
    });

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
   * Registra una devolución física o comercial de un pedido (`RN-SPEC-11-07`: montos restringidos al propietario).
   */
  async registerReturn(input: RegisterOrderReturnInput): Promise<Result<CellOrderReturn>> {
    const {
      cellId,
      clientId,
      orderId,
      reason,
      amountCents,
      actor,
      actorRole,
      status = "requested",
    } = input;

    if (amountCents > 0 && !isOwnerOrPlatformRole(actorRole)) {
      return err(
        "Solo el propietario del comercio puede emitir devoluciones monetarias.",
        "FORBIDDEN_MONETARY_RETURN",
      );
    }

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

    if (
      status === "received" &&
      (existing.order.status === "delivered" || existing.order.status === "return_in_progress")
    ) {
      let touchedProducts: string[] = [];
      await this.ordersRepo.updateOrderStatus(
        cellId,
        clientId,
        orderId,
        "returned",
        {
          fromStatus: existing.order.status,
          toStatus: "returned",
          actor,
          reason: "Devolución física recibida con éxito",
        },
        existing.order.stockDeducted
          ? {
              stockAction: "restore",
              onTouchedProducts: (ids) => {
                touchedProducts = ids;
              },
            }
          : undefined,
      );
      if (touchedProducts.length > 0) {
        await this.runStockMutatedHook(cellId, clientId, touchedProducts, actor);
      }
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
   * Lista pedidos con filtros, ordenamiento, paginación y métricas resumen por estado.
   */
  async listOrders(
    cellId: string,
    clientId: string,
    filters?: ListOrdersFilter,
  ): Promise<Result<{ items: CellOrder[]; total: number; summary?: OrderStatusSummaryCounts }>> {
    const [result, summary] = await Promise.all([
      this.ordersRepo.listOrders(cellId, clientId, filters),
      this.ordersRepo.getOrderStatusSummary
        ? this.ordersRepo.getOrderStatusSummary(cellId, clientId)
        : Promise.resolve(undefined),
    ]);
    return ok({ ...result, ...(summary ? { summary } : {}) });
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
   * Obtiene métricas agregadas de ventas, pedidos y devoluciones en caliente para REP-001.
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
