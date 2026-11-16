import {
  char,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Estado de conversación del motor de atención (`admin.conversation_state`, BOT-002 §5, T-06).
 *
 * Guarda variables (ciudad, nombre, producto activo, cantidad, etapa) para que el prompt
 * no crezca con el historial; una fila por conversación de Chatwoot e inquilino.
 */
export const cellConversationState = cellAdminSchema.table(
  "conversation_state",
  {
    /** Identificador UUIDv7 del estado. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Inquilino propietario (RLS). */
    clientId: uuid("client_id").notNull(),
    /** Conversación de Chatwoot correlacionada. */
    chatwootConversationId: integer("chatwoot_conversation_id").notNull(),
    /** Prospecto local asociado (nullable hasta resolverlo). */
    prospectId: uuid("prospect_id"),
    /** Producto activo en foco de la conversación. */
    productId: uuid("product_id"),
    /** Cantidad solicitada del producto activo. */
    quantity: integer("quantity"),
    /** Código ISO 3166-1 alpha-2 del país inferido o informado (SPEC-20). */
    countryCode: char("country_code", { length: 2 }),
    /** Código ISO 3166-2 de la subdivisión territorial informada o resuelta (SPEC-20). */
    subdivisionCode: varchar("subdivision_code", { length: 16 }),
    /** Nombre textual del departamento, estado o provincia capturado en conversación. */
    stateName: text("state_name"),
    /** Ciudad informada por el cliente. */
    city: text("city"),
    /** Barrio, colonia o sector urbano capturado en conversación (SPEC-20). */
    neighborhood: text("neighborhood"),
    /** Dirección física principal capturada en conversación (SPEC-20). */
    addressLine: text("address_line"),
    /** Complemento estructural del inmueble: apartamento, torre, conjunto, piso (SPEC-20). */
    addressComplement: text("address_complement"),
    /** Código postal informado o inferido (SPEC-20). */
    postalCode: varchar("postal_code", { length: 20 }),
    /** Notas o puntos de referencia operativos para el mensajero (SPEC-20). */
    referenceNotes: text("reference_notes"),
    /** Estado de resolución determinística geográfica en la conversación (SPEC-20). */
    geoResolutionStatus: text("geo_resolution_status").notNull().default("unresolved"),
    /** Cadena cruda de ubicación informada por el usuario antes de homologación. */
    rawLocationInput: text("raw_location_input"),
    /** Referencias homologadas de operadores logísticos externos (`dropi`, `effi`, `mercadolibre`). */
    providerGeoRefs: jsonb("provider_geo_refs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Nombre informado por el cliente. */
    customerName: text("customer_name"),
    /** Método de envío elegido (`home` u `office`). */
    shippingMethod: text("shipping_method"),
    /** Etapa del flujo conversacional. */
    stage: text("stage").notNull().default("greeting"),
    /** Última etiqueta de lead aplicada. */
    lastLabel: text("last_label"),
    /** Instante del último turno procesado. */
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }),
    /** Versión de configuración usada en el último turno. */
    configVersion: integer("config_version"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_conversation_state_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("conversation_state_client_conversation_unique").on(
      table.clientId,
      table.chatwootConversationId,
    ),
    index("conversation_state_client_prospect_idx").on(table.clientId, table.prospectId),
    check(
      "conversation_state_stage_check",
      sql.raw(
        "stage IN ('greeting', 'discovery', 'offer', 'order_capture', 'closed', 'handoff')",
      ),
    ),
    check(
      "conversation_state_shipping_method_check",
      sql.raw("shipping_method IS NULL OR shipping_method IN ('home', 'office')"),
    ),
    check(
      "conversation_state_last_label_check",
      sql.raw(
        "last_label IS NULL OR last_label IN ('lead-frio', 'lead-tibio', 'lead-caliente', 'compra-realizada')",
      ),
    ),
    check("conversation_state_quantity_check", sql.raw("quantity IS NULL OR quantity > 0")),
    check(
      "conversation_state_geo_status_check",
      sql.raw(
        "geo_resolution_status IN ('resolved', 'soft_normalized', 'ambiguous', 'unresolved')",
      ),
    ),
  ],
);

export type CellConversationState = typeof cellConversationState.$inferSelect;
export type NewCellConversationState = typeof cellConversationState.$inferInsert;

