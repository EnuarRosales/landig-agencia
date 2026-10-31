import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Maestro de pedidos comerciales del inquilino en la celda (`admin.orders`, ORD-001 §3.1, DAT-001 §6.3).
 *
 * Características:
 * - El pedido es un snapshot inmutable de precios, datos de cliente y dirección.
 * - Idempotencia estricta por conversación en estados activos ('registered', 'confirmed').
 * - Número legible consecutivo único por inquilino (`ORD-AAAAAM-####`).
 * - Separación de estados de ciclo de vida del pedido frente a estados de pago y despacho.
 */
export const cellOrders = cellAdminSchema.table(
  "orders",
  {
    /** Identificador UUIDv7 del pedido. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino propietario en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Número consecutivo legible único por inquilino (p. ej. ORD-202610-0001). */
    number: text("number").notNull(),
    /** Identificador del prospecto o cliente en CRM (opcional para pedidos manuales sin prospecto previo). */
    prospectId: uuid("prospect_id"),
    /** Identificador de la conversación de Chatwoot correlacionada para garantizar idempotencia. */
    chatwootConversationId: integer("chatwoot_conversation_id"),
    /** Origen de creación del pedido ('bot' mediante tool o 'manual' desde panel). */
    source: text("source").notNull().default("manual"),
    /** Estado determinista del pedido en la máquina de estados. */
    status: text("status").notNull().default("registered"),
    /** Método de pago acordado (snapshot del contexto comercial). */
    paymentMethod: text("payment_method").notNull(),
    /** Estado del cobro del pedido. */
    paymentStatus: text("payment_status").notNull().default("pending"),
    /** Método de entrega o despacho ('home' para domicilio u 'office' para reclamo en agencia). */
    shippingMethod: text("shipping_method").notNull().default("home"),
    /** Identificador de la transportadora asignada (opcional en registro). */
    carrierId: uuid("carrier_id"),
    /** Snapshot del nombre de la transportadora de envío. */
    carrierName: text("carrier_name"),
    /** Código de guía o seguimiento suministrado por la transportadora. */
    trackingCode: text("tracking_code"),
    /** Nombre del destinatario registrado en el momento de la compra. */
    customerName: text("customer_name").notNull(),
    /** Teléfono móvil del destinatario para coordinación de entrega. */
    customerPhone: text("customer_phone").notNull(),
    /** Documento de identidad del cliente (obligatorio si el método es 'office'). */
    customerDocument: text("customer_document"),
    /** Dirección física de entrega. */
    addressLine: text("address_line"),
    /** Ciudad o municipio de entrega. */
    city: text("city"),
    /** Departamento o provincia de entrega. */
    state: text("state"),
    /** Código postal de entrega. */
    postalCode: text("postal_code"),
    /** Subtotal acumulado de las líneas de producto en centavos (sin decimales flotantes). */
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
    /** Costo de envío aplicado en centavos. */
    shippingCents: bigint("shipping_cents", { mode: "number" }).notNull().default(0),
    /** Monto total de descuentos comerciales aplicados en centavos. */
    discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
    /** Total general a pagar en centavos (subtotal + envío - descuento >= 0). */
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    /** Código ISO de 3 caracteres de la moneda congelada del pedido. */
    currency: char("currency", { length: 3 }).notNull().default("COP"),
    /** Notas u observaciones comerciales del pedido. */
    notes: text("notes"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_orders_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("orders_number_client_unique").on(table.clientId, table.number),
    uniqueIndex("orders_cw_conversation_active_unique")
      .on(table.clientId, table.chatwootConversationId)
      .where(sql`chatwoot_conversation_id IS NOT NULL AND status IN ('registered', 'confirmed')`),
    index("orders_client_prospect_idx").on(table.clientId, table.prospectId),
    index("orders_client_status_idx").on(table.clientId, table.status),
    check(
      "orders_source_check",
      sql.raw("source IN ('bot', 'manual')"),
    ),
    check(
      "orders_status_check",
      sql.raw(
        "status IN ('registered', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned')",
      ),
    ),
    check(
      "orders_payment_status_check",
      sql.raw("payment_status IN ('pending', 'paid', 'refunded', 'failed')"),
    ),
    check(
      "orders_shipping_method_check",
      sql.raw("shipping_method IN ('home', 'office')"),
    ),
    check("orders_subtotal_cents_check", sql.raw("subtotal_cents >= 0")),
    check("orders_shipping_cents_check", sql.raw("shipping_cents >= 0")),
    check("orders_discount_cents_check", sql.raw("discount_cents >= 0")),
    check("orders_total_cents_check", sql.raw("total_cents >= 0")),
  ],
);

/**
 * Líneas de producto y snapshot inmutable de ítems del pedido (`admin.order_items`, ORD-001 §3.2).
 */
export const cellOrderItems = cellAdminSchema.table(
  "order_items",
  {
    /** Identificador UUIDv7 del ítem de pedido. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del pedido contenedor. */
    orderId: uuid("order_id").notNull(),
    /** Identificador del producto referenciado (nullable si el producto es archivado o eliminado). */
    productId: uuid("product_id"),
    /** Snapshot del nombre del producto al momento de comprar. */
    productName: text("product_name").notNull(),
    /** Snapshot del SKU del producto. */
    productSku: text("product_sku"),
    /** Unidades adquiridas (estrictamente > 0). */
    quantity: integer("quantity").notNull(),
    /** Precio unitario final congelado en centavos. */
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    /** Escalón de precio por cantidad aplicado (si aplica). */
    tierMinQty: integer("tier_min_qty"),
    /** Total de la línea en centavos (quantity * unitPriceCents). */
    lineTotalCents: bigint("line_total_cents", { mode: "number" }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_order_items_pkey", columns: [table.clientId, table.id] }),
    index("order_items_client_order_idx").on(table.clientId, table.orderId),
    check("order_items_quantity_check", sql.raw("quantity > 0")),
    check("order_items_unit_price_cents_check", sql.raw("unit_price_cents >= 0")),
    check("order_items_line_total_cents_check", sql.raw("line_total_cents >= 0")),
  ],
);

/**
 * Trazabilidad inmutable append-only de transiciones de estado (`admin.order_events`, ORD-001 §3.3).
 */
export const cellOrderEvents = cellAdminSchema.table(
  "order_events",
  {
    /** Identificador UUIDv7 del evento de auditoría. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del pedido involucrado. */
    orderId: uuid("order_id").notNull(),
    /** Estado previo a la transición (nulo para el evento inicial de registro). */
    fromStatus: text("from_status"),
    /** Estado resultante de la transición. */
    toStatus: text("to_status").notNull(),
    /** Actor responsable de la transición ('bot', 'system', o UUID de usuario). */
    actor: text("actor").notNull(),
    /** Motivo justificado del cambio de estado (obligatorio en cancelaciones). */
    reason: text("reason"),
    /** Marca de tiempo exacta del cambio de estado. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "cell_order_events_pkey", columns: [table.clientId, table.id] }),
    index("order_events_client_order_idx").on(table.clientId, table.orderId),
  ],
);

/**
 * Registro de solicitudes y recepciones de devoluciones (`admin.order_returns`, ORD-001 §3.4).
 */
export const cellOrderReturns = cellAdminSchema.table(
  "order_returns",
  {
    /** Identificador UUIDv7 de la devolución. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del pedido devuelto. */
    orderId: uuid("order_id").notNull(),
    /** Motivo técnico o comercial de la devolución. */
    reason: text("reason").notNull(),
    /** Monto involucrado en la devolución en centavos. */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Estado del flujo de devolución. */
    status: text("status").notNull().default("requested"),
    /** Actor que procesó o registró la devolución. */
    actor: text("actor").notNull(),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_order_returns_pkey", columns: [table.clientId, table.id] }),
    index("order_returns_client_order_idx").on(table.clientId, table.orderId),
    check("order_returns_amount_cents_check", sql.raw("amount_cents >= 0")),
    check(
      "order_returns_status_check",
      sql.raw("status IN ('requested', 'approved', 'received', 'refunded')"),
    ),
  ],
);

/**
 * Tabla atómica de secuencias mensuales de pedidos por inquilino (`admin.order_sequences`, ORD-001 §3.1).
 */
export const cellOrderSequences = cellAdminSchema.table(
  "order_sequences",
  {
    /** Identificador del inquilino propietario de la secuencia. */
    clientId: uuid("client_id").notNull(),
    /** Periodo anual y mensual en formato 'YYYYMM' (p. ej. '202610'). */
    period: text("period").notNull(),
    /** Valor actual correlativo del periodo. */
    currentVal: integer("current_val").notNull().default(0),
    /** Instante de la última actualización. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "cell_order_sequences_pkey",
      columns: [table.clientId, table.period],
    }),
  ],
);

/**
 * Catálogo de transportadoras de despacho admitidas por el inquilino (`admin.shipping_carriers`, ORD-001 §5.2).
 */
export const cellShippingCarriers = cellAdminSchema.table(
  "shipping_carriers",
  {
    /** Identificador UUIDv7 de la transportadora. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Nombre comercial de la empresa transportadora (p. ej. Servientrega). */
    name: text("name").notNull(),
    /** Plantilla de URL pública de rastreo con comodín {tracking_code}. */
    trackingUrlTemplate: text("tracking_url_template"),
    /** Indicador de si la transportadora se encuentra activa para selección. */
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_shipping_carriers_pkey",
      columns: [table.clientId, table.id],
    }),
    uniqueIndex("shipping_carriers_client_name_unique").on(table.clientId, table.name),
  ],
);

export type CellOrder = typeof cellOrders.$inferSelect;
export type NewCellOrder = typeof cellOrders.$inferInsert;
export type CellOrderItem = typeof cellOrderItems.$inferSelect;
export type NewCellOrderItem = typeof cellOrderItems.$inferInsert;
export type CellOrderEvent = typeof cellOrderEvents.$inferSelect;
export type NewCellOrderEvent = typeof cellOrderEvents.$inferInsert;
export type CellOrderReturn = typeof cellOrderReturns.$inferSelect;
export type NewCellOrderReturn = typeof cellOrderReturns.$inferInsert;
export type CellOrderSequence = typeof cellOrderSequences.$inferSelect;
export type NewCellOrderSequence = typeof cellOrderSequences.$inferInsert;
export type CellShippingCarrier = typeof cellShippingCarriers.$inferSelect;
export type NewCellShippingCarrier = typeof cellShippingCarriers.$inferInsert;
