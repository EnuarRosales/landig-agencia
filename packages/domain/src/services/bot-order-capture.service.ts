import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { normalizeAndValidatePhoneE164, resolveCountryAlpha2FromInput } from "../geo/index";
import type { OrdersService, OrderItemInput } from "./orders.service";
import type { OrderWithDetails } from "../repositories/orders.repository.interface";
import type { LocationResolverService } from "./location-resolver.service";

/** Payload de la herramienta `registrar_pedido` que invoca el modelo (`BOT-002 RF-05.2`, `SPEC-20`). */
export interface RegistrarPedidoToolInput {
  cellId: string;
  clientId: string;
  chatwootConversationId: number;
  prospectId?: string;
  paymentMethod: string;
  customer: { name: string; phone: string; document?: string };
  shipping: {
    method: "home" | "office";
    countryCode?: string;
    subdivisionCode?: string;
    addressLine?: string;
    addressComplement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    referenceNotes?: string;
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
 * Orquesta la captura de pedido del bot (`BOT-002 T-08`, `SPEC-20`): valida el contrato,
 * normaliza teléfono E.164 (modo híbrido), homologa ubicación geográfica si existe resolvedor,
 * delega en ORD-001 con idempotencia por conversación y garantiza cierre y etiqueta una sola vez.
 */
export class BotOrderCaptureService {
  constructor(
    private readonly orders: OrdersService,
    private readonly locationResolver?: LocationResolverService,
    private readonly defaultCountryResolver?: (clientId: string) => Promise<string | null>,
  ) {}

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

    let fallbackCountryCode = resolveCountryAlpha2FromInput(input.shipping.countryCode) ?? undefined;
    if (!fallbackCountryCode && this.defaultCountryResolver) {
      const tenantCountry = await this.defaultCountryResolver(input.clientId);
      fallbackCountryCode = resolveCountryAlpha2FromInput(tenantCountry) ?? undefined;
    }

    const phoneRes = normalizeAndValidatePhoneE164({
      rawPhone: input.customer.phone,
      defaultCountryCode: fallbackCountryCode ?? "CO",
      allowLocalWithDefaultCountry: true,
    });
    if (!phoneRes.ok) {
      return err(phoneRes.error, "CAPTURE_INVALID_PHONE");
    }

    let resolvedShipping: NonNullable<Parameters<OrdersService["registerOrderDetailed"]>[0]["shipping"]> = {
      ...input.shipping,
      countryCode: fallbackCountryCode ?? "CO",
    };

    if (this.locationResolver && input.shipping.city?.trim()) {
      const locRes = await this.locationResolver.resolve({
        countryInput: input.shipping.countryCode ?? fallbackCountryCode ?? "CO",
        stateInput: input.shipping.subdivisionCode ?? input.shipping.state,
        cityInput: input.shipping.city,
        tenantCountryCode: fallbackCountryCode ?? "CO",
      });
      if (locRes.status === "ambiguous") {
        return err(
          `Ubicación ambigua para '${input.shipping.state ?? input.shipping.city}'. Solicita aclaración al cliente.`,
          "CAPTURE_LOCATION_AMBIGUOUS",
          locRes.disambiguationCandidates,
        );
      }
      const mappedStatus: NonNullable<
        Parameters<OrdersService["registerOrderDetailed"]>[0]["shipping"]
      >["geoResolutionStatus"] =
        locRes.status === "resolved"
          ? "provider_resolved"
          : locRes.status === "soft_normalized"
            ? "iso_resolved"
            : "unresolved";
      const serializedProviderRefs = Object.fromEntries(
        Object.entries(locRes.providerGeoRefs).map(([k, v]) => [k, v.externalId]),
      );
      resolvedShipping = {
        ...resolvedShipping,
        countryCode: locRes.countryCode ?? resolvedShipping.countryCode,
        subdivisionCode: locRes.subdivisionCode ?? resolvedShipping.subdivisionCode,
        state: locRes.stateName ?? resolvedShipping.state,
        city: locRes.cityName ?? resolvedShipping.city,
        geoResolutionStatus: mappedStatus,
        rawLocationInput: locRes.rawLocationInput,
        providerGeoRefs: serializedProviderRefs,
      };
    }

    const result = await this.orders.registerOrderDetailed({
      ...input,
      customer: {
        ...input.customer,
        phone: phoneRes.data.e164,
      },
      shipping: resolvedShipping,
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

