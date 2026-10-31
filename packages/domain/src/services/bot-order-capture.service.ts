import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { OrdersService, OrderItemInput } from "./orders.service";
import type { OrderWithDetails } from "../repositories/orders.repository.interface";

/** Payload de la herramienta `registrar_pedido` que invoca el modelo (BOT-002 RF-05.2). */
export interface RegistrarPedidoToolInput {
  cellId: string;
  clientId: string;
  chatwootConversationId: number;
  prospectId?: string;
  paymentMethod: string;
  customer: { name: string; phone: string; document?: string };
  shipping: {
    method: "home" | "office";
    addressLine?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    carrierId?: string;
    carrierName?: string;
    shippingCents?: number;
  };
  items: OrderItemInput[];
  discountCents?: number;
  currency?: string;
  notes?: string;
}

/** Resultado de la captura; `closingRequired` es verdadero solo la primera vez. */
export interface OrderCaptureOutcome {
  order: OrderWithDetails;
  created: boolean;
  /** El cierre y la etiqueta `compra-realizada` se aplican una sola vez. */
  closingRequired: boolean;
  label: "compra-realizada" | null;
}

/**
 * Orquesta la captura de pedido del bot (BOT-002 T-08): valida el contrato, delega en ORD-001 con
 * idempotencia por conversación y garantiza cierre y etiqueta una sola vez.
 */
export class BotOrderCaptureService {
  constructor(private readonly orders: OrdersService) {}

  async capture(input: RegistrarPedidoToolInput): Promise<Result<OrderCaptureOutcome>> {
    if (!Number.isInteger(input.chatwootConversationId) || input.chatwootConversationId <= 0) {
      return err(
        "registrar_pedido requiere una conversación de Chatwoot válida.",
        "CAPTURE_CONVERSATION_REQUIRED",
      );
    }
    if (input.shipping.method !== "home" && input.shipping.method !== "office") {
      return err("El método de envío debe ser domicilio u oficina.", "CAPTURE_SHIPPING_METHOD_INVALID");
    }

    const result = await this.orders.registerOrderDetailed({
      ...input,
      source: "bot",
      actor: "bot",
    });
    if (!result.ok) {
      appLogger.warn("[BotOrderCapture] Pedido rechazado por validación", {
        clientId: input.clientId,
        code: result.code,
      });
      return result;
    }

    const { details, created } = result.data;
    appLogger.info("[BotOrderCapture] Captura de pedido procesada", {
      clientId: input.clientId,
      orderId: details.order.id,
      created,
    });

    return ok({
      order: details,
      created,
      closingRequired: created,
      label: created ? "compra-realizada" : null,
    });
  }
}

