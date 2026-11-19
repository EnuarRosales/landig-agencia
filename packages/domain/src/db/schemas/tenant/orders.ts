import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
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
import { cellPromotions } from "./promotions";

/**
 * Los 12 estados homologados del ciclo de vida de pedidos en Mocter, compatibles con Dropi y Effi ERP (`SPEC-11`).
 */
export const ORDER_STATUS_LIST = [
  "pending_confirmation",
  "confirmed",
  "preparing",
  "guide_generated",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivery_issue",
  "delivered",
  "return_in_progress",
  "returned",
  "cancelled",
] as const;

/**
 * Tipo estricto de los 12 estados homologados de pedido (`SPEC-11`).
 */
export type OrderStatus = (typeof ORDER_STATUS_LIST)[number];

/**
 * Maestro de pedidos comerciales del inquilino en la celda (`admin.orders`, ORD-001 §3.1, DAT-001 §6.3, SPEC-11).
 *
 * Características:
 * - El pedido es un snapshot inmutable de precios, datos de cliente y dirección.
 * - Idempotencia estricta por conversación en estados activos pre-despacho.
 * - Número legible consecutivo único por inquilino (`ORD-YYYYMM-####`).
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
    /** Identificador del contacto en CRM (`admin.contacts.id`, expuesto también como alias `contactId` en API). */
    prospectId: uuid("prospect_id"),
    /** Identificador opcional de la dirección guardada del contacto utilizada al crear/editar el pedido (`SPEC-09`, `SPEC-11`). */
    contactAddressId: uuid("contact_address_id"),
    /** Identificador de la conversación de Chatwoot correlacionada para garantizar idempotencia. */
    chatwootConversationId: integer("chatwoot_conversation_id"),
    /** Origen de creación del pedido ('bot' mediante tool o 'manual' desde panel). */
    source: text("source").notNull().default("manual"),
    /** Estado determinista del pedido en la máquina de 12 estados homologados (`SPEC-11`). */
    status: text("status").notNull().default("pending_confirmation"),
    /** Método de pago acordado (snapshot del contexto comercial). */
    paymentMethod: text("payment_method").notNull(),
    /** Identificador opcional del canal de pago estructurado utilizado (`admin.tenant_payment_channels`). */
    paymentChannelId: uuid("payment_channel_id"),
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
    /** Código ISO 3166-1 alpha-2 del país de entrega congelado en el pedido (SPEC-20). */
    countryCode: char("country_code", { length: 2 }).notNull().default("CO"),
    /** Código ISO 3166-2 de la subdivisión administrativa de entrega (SPEC-20). */
    subdivisionCode: varchar("subdivision_code", { length: 16 }),
    /** Dirección física de entrega. */
    addressLine: text("address_line"),
    /** Complemento estructural del inmueble: apartamento, torre, conjunto, piso (SPEC-20). */
    addressComplement: text("address_complement"),
    /** Barrio, colonia o sector urbano de entrega (SPEC-20). */
    neighborhood: text("neighborhood"),
    /** Ciudad o municipio de entrega. */
    city: text("city"),
    /** Departamento, estado o provincia de entrega. */
    state: text("state"),
    /** Código postal de entrega. */
    postalCode: text("postal_code"),
    /** Indicaciones operativas de entrega para el mensajero (SPEC-20). */
    referenceNotes: text("reference_notes"),
    /** Estado determinístico de homologación geográfica del pedido (SPEC-20). */
    geoResolutionStatus: text("geo_resolution_status").notNull().default("unresolved"),
    /** Texto crudo de ubicación original recibido antes de homologación (SPEC-20). */
    rawLocationInput: text("raw_location_input"),
    /** Snapshot ACL de identificadores logísticos externos para despacho (SPEC-20). */
    providerGeoRefs: jsonb("provider_geo_refs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    /** Bandera idempotente que indica si el inventario físico del pedido ya fue descontado (`SPEC-11`). */
    stockDeducted: boolean("stock_deducted").notNull().default(false),
    /** Bandera idempotente que indica si las unidades promocionales del pedido ya fueron descontadas del cupo de `admin.promotions` (`SPEC-18 D-05`). */
    promotionQuotaDeducted: boolean("promotion_quota_deducted").notNull().default(false),
    /** Marca de tiempo de la primera o última generación de guía imprimible (`SPEC-11`). */
    guideGeneratedAt: timestamp("guide_generated_at", { withTimezone: true }),
    /** Motivo estructurado o textual de cancelación del pedido (`SPEC-11`). */
    cancellationReason: text("cancellation_reason"),
    /** Observaciones logísticas de novedad en entrega (`delivery_issue`, `SPEC-11`). */
    issueNotes: text("issue_notes"),
    /** Identificador del pedido original cuando este pedido se originó mediante «Repetir Pedido» (`SPEC-11`). */
    repeatedFromOrderId: uuid("repeated_from_order_id"),
    /** Nombre del sistema ERP/logístico externo asociado (p. ej. 'dropi', 'effi') para conector futuro (`SPEC-11`). */
    externalErpSystem: text("external_erp_system"),
    /** Identificador externo del pedido en Dropi, Effi u otro ERP logístico (`SPEC-11`). */
    externalErpReference: text("external_erp_reference"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_orders_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("orders_number_client_unique").on(table.clientId, table.number),
    uniqueIndex("orders_cw_conversation_active_unique")
      .on(table.clientId, table.chatwootConversationId)
      .where(
        sql`chatwoot_conversation_id IS NOT NULL AND status IN ('pending_confirmation', 'confirmed', 'preparing', 'guide_generated')`,
      ),
    index("orders_client_prospect_idx").on(table.clientId, table.prospectId),
    index("orders_client_status_idx").on(table.clientId, table.status),
    index("orders_client_created_idx").on(table.clientId, table.createdAt),
    check(
      "orders_source_check",
      sql.raw("source IN ('bot', 'manual')"),
    ),
    check(
      "orders_status_check",
      sql.raw(
        "status IN ('pending_confirmation', 'confirmed', 'preparing', 'guide_generated', 'dispatched', 'in_transit', 'out_for_delivery', 'delivery_issue', 'delivered', 'return_in_progress', 'returned', 'cancelled')",
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
    check(
      "orders_geo_resolution_status_check",
      sql.raw(
        "geo_resolution_status IN ('resolved', 'soft_normalized', 'ambiguous', 'unresolved')",
      ),
    ),
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
    /** Costo unitario de referencia congelado en centavos para cálculo de rentabilidad (`SPEC-11`). */
    unitCostCents: bigint("unit_cost_cents", { mode: "number" }).notNull().default(0),
    /** Mapa JSONB de atributos dinámicos seleccionados (p. ej. `{ "Color": "Negro", "Talla": "M" }`, `SPEC-08`, `SPEC-11`). */
    selectedAttributes: jsonb("selected_attributes").$type<Record<string, string> | null>(),
    /** Escalón de precio por cantidad aplicado (si aplica). */
    tierMinQty: integer("tier_min_qty"),
    /** Identificador de la promoción comercial aplicada a esta línea (`SPEC-18 D-05`, `D-08`). */
    promotionId: uuid("promotion_id"),
    /** Snapshot inmutable del nombre comercial de la campaña aplicada al momento de la compra (`SPEC-18`). */
    promotionName: text("promotion_name"),
    /** Precio unitario regular previo al descuento promocional en centavos (`SPEC-18`). */
    originalUnitPriceCents: bigint("original_unit_price_cents", { mode: "number" }),
    /** Total de la línea en centavos (quantity * unitPriceCents). */
    lineTotalCents: bigint("line_total_cents", { mode: "number" }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_order_items_pkey", columns: [table.clientId, table.id] }),
    foreignKey({
      name: "order_items_promotion_fk",
      columns: [table.clientId, table.promotionId],
      foreignColumns: [cellPromotions.clientId, cellPromotions.id],
    }).onDelete("restrict"),
    index("order_items_client_order_idx").on(table.clientId, table.orderId),
    index("idx_order_items_client_promotion")
      .on(table.clientId, table.promotionId)
      .where(sql`promotion_id IS NOT NULL`),
    check("order_items_quantity_check", sql.raw("quantity > 0")),
    check("order_items_unit_price_cents_check", sql.raw("unit_price_cents >= 0")),
    check("order_items_unit_cost_cents_check", sql.raw("unit_cost_cents >= 0")),
    check(
      "order_items_original_unit_price_cents_check",
      sql.raw("original_unit_price_cents IS NULL OR original_unit_price_cents >= 0"),
    ),
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

export const cellTenantPaymentChannels = cellAdminSchema.table(
  "tenant_payment_channels",
  {
    /** Identificador UUIDv7 del canal de pago del comercio. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino propietario en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Código normalizado del canal (`nequi`, `daviplata`, `bancolombia`, `bre_b`, `pse`, `card_link`, `cash_on_delivery`, `efecty`, `bank_transfer`, `other`). */
    channelCode: text("channel_code").notNull(),
    /** Nombre visible del canal para clientes finales y bot (p. ej. Transferencia Nequi). */
    displayName: text("display_name").notNull(),
    /** Número de cuenta, teléfono, llave Bre-B o enlace informativo del comercio. */
    accountIdentifier: text("account_identifier"),
    /** Nombre del titular o razón social receptora del pago. */
    accountHolderName: text("account_holder_name"),
    /** Instrucciones de pago comunicadas al comprador (máx. 1,000 caracteres). */
    instructions: text("instructions"),
    /** Indica si el canal está activo para pedidos y respuestas del asistente AI. */
    isActive: boolean("is_active").notNull().default(true),
    /** Orden ascendente de presentación. */
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_tenant_payment_channels_pkey",
      columns: [table.clientId, table.id],
    }),
    index("tenant_payment_channels_client_active_sort_idx").on(
      table.clientId,
      table.isActive,
      table.sortOrder,
    ),
    check("tenant_payment_channels_code_lowercase_check", sql.raw("channel_code = lower(channel_code)")),
    check("tenant_payment_channels_sort_order_check", sql.raw("sort_order >= 0")),
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
export type CellTenantPaymentChannel = typeof cellTenantPaymentChannels.$inferSelect;
export type NewCellTenantPaymentChannel = typeof cellTenantPaymentChannels.$inferInsert;
