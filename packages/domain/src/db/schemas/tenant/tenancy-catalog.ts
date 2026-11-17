import {
  bigint,
  boolean,
  char,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

const halfvec1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "halfvec(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .filter((v) => v.length > 0)
      .map(Number);
  },
});

/**
 * Vínculo de usuarios con un inquilino dentro de su celda (`admin.tenant_users`, ADM-001 §5.2, D-15, D-31).
 *
 * Un solo `tenant_owner` activo por inquilino (`tenant_users_one_owner`) y un solo vínculo activo
 * por `user_id` (`tenant_users_one_active_membership`). Salir marca `status = 'left'` y `left_at`
 * conservando el historial (RF-08.5).
 */
export const cellTenantUsers = cellAdminSchema.table(
  "tenant_users",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("tenant_agent"),
    status: text("status").notNull().default("active"),
    grantChatwootAccess: boolean("grant_chatwoot_access").notNull().default(true),
    chatwootAgentId: integer("chatwoot_agent_id"),
    invitedBy: uuid("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_tenant_users_pkey", columns: [table.clientId, table.id] }),
    index("tenant_users_by_client_user").on(table.clientId, table.userId),
    uniqueIndex("tenant_users_one_owner")
      .on(table.clientId)
      .where(sql`role = 'tenant_owner' AND status = 'active'`),
    uniqueIndex("tenant_users_one_active_membership")
      .on(table.userId)
      .where(sql`status = 'active'`),
    check(
      "tenant_users_role_check",
      sql.raw("role IN ('tenant_owner', 'tenant_agent')"),
    ),
    check(
      "tenant_users_status_check",
      sql.raw("status IN ('active', 'left', 'suspended')"),
    ),
  ],
);

/**
 * Espejo de las etiquetas de Chatwoot con propiedad del inquilino (`admin.tenant_labels`, ADM-001 T-12, RF-03.6, RF-03.7).
 */
export const cellTenantLabels = cellAdminSchema.table(
  "tenant_labels",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    chatwootLabelId: integer("chatwoot_label_id"),
    title: text("title").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#1F93FF"),
    showOnSidebar: boolean("show_on_sidebar").notNull().default(true),
    origin: text("origin").notNull().default("mocter_custom"),
    state: text("state").notNull().default("active"),
    /** Categoría de clasificación automática (`operational` o `functional` según SPEC-10 / SPEC-19). */
    category: text("category").notNull().default("operational"),
    /** Regla declarativa para activar la etiqueta durante clasificación de conversaciones (SPEC-19). */
    activationRule: text("activation_rule"),
    /** Efectos colaterales esperados al asignar la etiqueta (SPEC-19). */
    sideEffects: text("side_effects"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_tenant_labels_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("tenant_labels_client_title_unique").on(table.clientId, table.title),
    uniqueIndex("tenant_labels_client_cw_id_unique")
      .on(table.clientId, table.chatwootLabelId)
      .where(sql`chatwoot_label_id IS NOT NULL`),
    check(
      "tenant_labels_origin_check",
      sql.raw(
        "origin IN ('chatwoot_default', 'chatwoot_custom', 'mocter_custom', 'mocter_default')",
      ),
    ),
    check("tenant_labels_state_check", sql.raw("state IN ('active', 'archived')")),
    check(
      "tenant_labels_category_check",
      sql.raw("category IN ('operational', 'functional')"),
    ),
  ],
);

/**
 * Contador autoritativo de consumo por dimensión en la celda (`admin.client_usage`, ADM-001 T-10, T-14, §5.2).
 */
export const cellClientUsage = cellAdminSchema.table(
  "client_usage",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    dimension: text("dimension").notNull(),
    usedValue: bigint("used_value", { mode: "number" }).notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_client_usage_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("client_usage_one_per_dimension").on(table.clientId, table.dimension),
    check("client_usage_used_value_check", sql.raw("used_value >= 0")),
  ],
);

/**
 * Referencias distintas del inquilino al catálogo global de archivos (`admin.client_media`, ADM-001 T-14, §5.2).
 */
export const cellClientMedia = cellAdminSchema.table(
  "client_media",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    mediaId: uuid("media_id").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_client_media_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("client_media_one_per_client").on(table.clientId, table.mediaId),
    check("client_media_size_check", sql.raw("size_bytes >= 0")),
  ],
);

/**
 * Atributo dinámico configurable de un producto para variantes del catálogo y bot (SPEC-08 §7.1).
 */
export interface ProductDynamicAttribute {
  name: string;
  values: string[];
  requiredForOrder?: boolean;
}

/**
 * Catálogo transaccional de productos y servicios del inquilino (`admin.products`, ADM-001 T-13, §9.0, DAT-001 §6.3, SPEC-08 §7.1).
 *
 * Tabla compartida no particionada con llave primaria compuesta `(client_id, id)` y `FORCE ROW LEVEL SECURITY`.
 */
export const cellProducts = cellAdminSchema.table(
  "products",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    sku: text("sku"),
    gtin: text("gtin"),
    mpn: text("mpn"),
    itemGroupId: text("item_group_id"),
    sourceSystem: text("source_system").notNull().default("manual"),
    sourceExternalId: text("source_external_id"),
    sourceUrl: text("source_url"),
    name: text("name").notNull(),
    description: text("description").notNull(),
    brand: text("brand"),
    kind: text("kind").notNull().default("physical"),
    compositionType: text("composition_type").notNull().default("simple"),
    condition: text("condition").notNull().default("new"),
    availability: text("availability").notNull().default("in_stock"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    costPriceCents: bigint("cost_price_cents", { mode: "number" }).notNull().default(0),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    salePriceCents: bigint("sale_price_cents", { mode: "number" }),
    currency: char("currency", { length: 3 }),
    priceNote: text("price_note"),
    category: text("category"),
    googleProductCategory: text("google_product_category"),
    color: text("color"),
    size: text("size"),
    material: text("material"),
    gender: text("gender"),
    ageGroup: text("age_group"),
    pattern: text("pattern"),
    attributes: jsonb("attributes")
      .$type<ProductDynamicAttribute[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    prompt: text("prompt"),
    botMasterPrompt: text("bot_master_prompt").notNull().default(""),
    stockQuantity: integer("stock_quantity"),
    minStockThreshold: integer("min_stock_threshold"),
    lowStockAlertSentAt: timestamp("low_stock_alert_sent_at", { withTimezone: true }),
    keywords: jsonb("keywords")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    mediaTerm: text("media_term"),
    benefits: jsonb("benefits")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    deliveryGroupId: uuid("delivery_group_id"),
    freeShipping: boolean("free_shipping").notNull().default(false),
    shippingCostCents: bigint("shipping_cost_cents", { mode: "number" }),
    sourceShareId: uuid("source_share_id"),
    sourceVersion: integer("source_version"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_products_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("products_external_source_unique")
      .on(table.clientId, table.sourceSystem, table.sourceExternalId)
      .where(sql`source_system <> 'manual' AND source_external_id IS NOT NULL`),
    check(
      "products_kind_check",
      sql.raw("kind IN ('physical', 'digital', 'service')"),
    ),
    check(
      "products_composition_type_check",
      sql.raw("composition_type IN ('simple', 'combo')"),
    ),
    check(
      "products_condition_check",
      sql.raw("condition IN ('new', 'refurbished', 'used')"),
    ),
    check(
      "products_availability_check",
      sql.raw("availability IN ('in_stock', 'out_of_stock', 'preorder', 'backorder')"),
    ),
    check(
      "products_status_check",
      sql.raw("status IN ('active', 'inactive', 'draft')"),
    ),
    check("products_price_check", sql.raw("price_cents >= 0")),
    check(
      "products_cost_price_non_negative_check",
      sql.raw("cost_price_cents >= 0"),
    ),
    check(
      "products_stock_quantity_check",
      sql.raw("stock_quantity IS NULL OR stock_quantity >= 0"),
    ),
    check(
      "products_min_stock_threshold_check",
      sql.raw("min_stock_threshold IS NULL OR min_stock_threshold >= 0"),
    ),
  ],
);

/**
 * Componentes que integran un producto compuesto/combo (`admin.product_bundle_items`, SPEC-08 §7.2).
 *
 * Impide borrado de productos simples vinculados como componentes (`ON DELETE RESTRICT`) y prohíbe auto-referencias.
 */
export const cellProductBundleItems = cellAdminSchema.table(
  "product_bundle_items",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    bundleProductId: uuid("bundle_product_id").notNull(),
    componentProductId: uuid("component_product_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_product_bundle_items_pkey",
      columns: [table.clientId, table.id],
    }),
    foreignKey({
      name: "product_bundle_items_bundle_fk",
      columns: [table.clientId, table.bundleProductId],
      foreignColumns: [cellProducts.clientId, cellProducts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "product_bundle_items_component_fk",
      columns: [table.clientId, table.componentProductId],
      foreignColumns: [cellProducts.clientId, cellProducts.id],
    }).onDelete("restrict"),
    uniqueIndex("product_bundle_items_unique_pair").on(
      table.clientId,
      table.bundleProductId,
      table.componentProductId,
    ),
    index("product_bundle_items_by_component_idx").on(
      table.clientId,
      table.componentProductId,
    ),
    check("product_bundle_items_quantity_check", sql.raw("quantity > 0")),
    check(
      "product_bundle_items_no_self_ref_check",
      sql.raw("bundle_product_id <> component_product_id"),
    ),
  ],
);

/**
 * Fragmentos vectoriales de productos (`admin.product_embeddings`, ADM-001 T-13, DAT-001 §6.2).
 *
 * Utiliza `halfvec(1536)` para búsqueda semántica sin degradar la tabla transaccional `products`.
 */
export const cellProductEmbeddings = cellAdminSchema.table(
  "product_embeddings",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    productId: uuid("product_id").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    composedText: text("composed_text").notNull(),
    embedding: halfvec1536("embedding"),
    modelCode: text("model_code").notNull().default("text-embedding-3-small"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_product_embeddings_pkey",
      columns: [table.clientId, table.id],
    }),
    uniqueIndex("product_embeddings_chunk_unique").on(
      table.clientId,
      table.productId,
      table.chunkIndex,
    ),
  ],
);

/**
 * Vínculo producto-archivo con tipo, portada única y texto alternativo (`admin.product_media`, ADM-001 T-13/T-14, SPEC-08 §7.3).
 */
export const cellProductMedia = cellAdminSchema.table(
  "product_media",
  {
    id: uuid("id").notNull().default(sql`uuidv7()`),
    clientId: uuid("client_id").notNull(),
    productId: uuid("product_id").notNull(),
    mediaId: uuid("media_id").notNull(),
    mediaKind: text("media_kind").notNull().default("image"),
    isCover: boolean("is_cover").notNull().default(false),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_product_media_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("product_media_one_per_product").on(
      table.clientId,
      table.productId,
      table.mediaId,
    ),
    uniqueIndex("product_media_one_cover_per_product")
      .on(table.clientId, table.productId)
      .where(sql`is_cover = true`),
    check(
      "product_media_kind_check",
      sql.raw("media_kind IN ('image', 'video', 'audio', 'pdf')"),
    ),
    check(
      "product_media_cover_image_check",
      sql.raw("NOT is_cover OR media_kind = 'image'"),
    ),
  ],
);

/**
 * Contexto de atención comercial del negocio en su celda (`admin.client_business_info`, ADM-001 §5.2, RF-03.8).
 */
/**
 * Contrato estructurado de política de envíos (`cell_client_business_info.shipping_policy`).
 * Mantiene retrocompatibilidad con Onboarding Paso 4 (`freeShipping`, `defaultCostCents`) y añade
 * `policyText` asistido por AI (`SPEC-10`) junto con reglas regionales (`SPEC-20`).
 */
export type TenantShippingPolicy = Record<string, unknown> & {
  freeShipping?: boolean;
  defaultCostCents?: number;
  policyText?: string;
  deliveryRules?: Array<{
    regionCode: string | null;
    city: string | null;
    days: string;
  }>;
};

export const cellClientBusinessInfo = cellAdminSchema.table(
  "client_business_info",
  {
    clientId: uuid("client_id").primaryKey(),
    paymentMethods: jsonb("payment_methods")
      .$type<string[]>()
      .notNull()
      .default(sql`'["transferencia","contraentrega"]'::jsonb`),
    returnsPolicy: text("returns_policy"),
    warrantyPolicy: text("warranty_policy"),
    shippingPolicy: jsonb("shipping_policy")
      .$type<TenantShippingPolicy>()
      .notNull()
      .default(sql`'{"freeShipping":false,"defaultCostCents":0}'::jsonb`),
    orderMessage: text("order_message"),
    faqs: jsonb("faqs")
      .$type<Array<{ question: string; answer: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    botPreset: text("bot_preset").notNull().default("natural_rhythm"),
    remindersEnabled: boolean("reminders_enabled").notNull().default(false),
    ...auditColumns(),
  },
);

export type CellTenantUser = typeof cellTenantUsers.$inferSelect;
export type NewCellTenantUser = typeof cellTenantUsers.$inferInsert;
export type CellTenantLabel = typeof cellTenantLabels.$inferSelect;
export type NewCellTenantLabel = typeof cellTenantLabels.$inferInsert;
export type CellClientUsage = typeof cellClientUsage.$inferSelect;
export type NewCellClientUsage = typeof cellClientUsage.$inferInsert;
export type CellClientMedia = typeof cellClientMedia.$inferSelect;
export type NewCellClientMedia = typeof cellClientMedia.$inferInsert;
export type CellProduct = typeof cellProducts.$inferSelect;
export type NewCellProduct = typeof cellProducts.$inferInsert;
export type CellProductBundleItem = typeof cellProductBundleItems.$inferSelect;
export type NewCellProductBundleItem = typeof cellProductBundleItems.$inferInsert;
export type CellProductEmbedding = typeof cellProductEmbeddings.$inferSelect;
export type NewCellProductEmbedding = typeof cellProductEmbeddings.$inferInsert;
export type CellProductMedia = typeof cellProductMedia.$inferSelect;
export type NewCellProductMedia = typeof cellProductMedia.$inferInsert;
export type CellClientBusinessInfo = typeof cellClientBusinessInfo.$inferSelect;
export type NewCellClientBusinessInfo = typeof cellClientBusinessInfo.$inferInsert;

