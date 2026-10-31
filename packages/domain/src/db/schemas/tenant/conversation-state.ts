import { check, index, integer, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /** Ciudad informada por el cliente. */
    city: text("city"),
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
  ],
);

export type CellConversationState = typeof cellConversationState.$inferSelect;
export type NewCellConversationState = typeof cellConversationState.$inferInsert;

