import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { cellProducts } from "./tenancy-catalog";

/**
 * Alcances soportados para una promoción comercial automática (`SPEC-18 §7.1`).
 */
export const PROMOTION_SCOPE_TYPE_LIST = ["all_catalog", "category", "product"] as const;
export type PromotionScopeType = (typeof PROMOTION_SCOPE_TYPE_LIST)[number];

/**
 * Tipos de beneficio soportados para una promoción comercial automática (`SPEC-18 §7.1`).
 */
export const PROMOTION_DISCOUNT_TYPE_LIST = [
  "percentage",
  "fixed_amount",
  "fixed_price",
] as const;
export type PromotionDiscountType = (typeof PROMOTION_DISCOUNT_TYPE_LIST)[number];

/**
 * Tipos de objetivo admitidos en la tabla de vinculación `admin.promotion_targets` (`SPEC-18 §7.2`).
 */
export const PROMOTION_TARGET_TYPE_LIST = ["product", "category"] as const;
export type PromotionTargetType = (typeof PROMOTION_TARGET_TYPE_LIST)[number];

/**
 * Estados operativos derivados en tiempo real para una campaña comercial (`SPEC-18 RN-SPEC-18-01`).
 */
export const PROMOTION_LIFECYCLE_STATUS_LIST = [
  "active",
  "scheduled",
  "paused",
  "expired",
  "depleted",
] as const;
export type PromotionLifecycleStatus = (typeof PROMOTION_LIFECYCLE_STATUS_LIST)[number];

/**
 * Cabecera de campañas y promociones comerciales automáticas del inquilino (`admin.promotions`, `SPEC-18 §7.1`).
 *
 * Tabla compartida en celda (`pg-cell-XX`) con llave primaria compuesta `(client_id, id)`,
 * aislamiento estricto por `FORCE ROW LEVEL SECURITY` (`app.current_client_id`),
 * auditoría obligatoria (`AGENTS.md §4.5`) y eliminación lógica (`deleted_at`, `deleted_by`, `D-08`).
 */
export const cellPromotions = cellAdminSchema.table(
  "promotions",
  {
    /** Identificador UUIDv7 de la promoción comercial. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino propietario en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Nombre comercial de la campaña o promoción. */
    name: varchar("name", { length: 140 }).notNull(),
    /** Argumento comercial o condiciones visibles para el asistente AI y el equipo. */
    description: text("description"),
    /** Alcance de selección: todo el catálogo, por categorías o por productos/combos exactos. */
    scopeType: varchar("scope_type", { length: 24 }).notNull(),
    /** Tipo de beneficio: porcentaje, descuento fijo en moneda o precio final fijo. */
    discountType: varchar("discount_type", { length: 24 }).notNull(),
    /** Valor del beneficio: porcentaje entero (1-95) o monto en centavos (> 0, paridad BIGINT con price_cents). */
    discountValue: bigint("discount_value", { mode: "number" }).notNull(),
    /** Fecha y hora exacta de inicio de vigencia de la promoción. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** Fecha y hora exacta de finalización; NULL indica vigencia abierta hasta pausa manual. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Tope opcional de unidades totales vendibles bajo esta promoción antes de agotarse. */
    maxDiscountedUnits: integer("max_discounted_units"),
    /** Acumulado de unidades vendidas bajo esta promoción en pedidos confirmados (con restitución en anulaciones). */
    discountedUnitsSold: integer("discounted_units_sold").notNull().default(0),
    /** Indicador administrativo para activar o pausar manualmente la promoción. */
    isActive: boolean("is_active").notNull().default(true),
    /** Marca temporal de eliminación lógica (soft delete, `SPEC-18 D-08`). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Actor que ejecutó la eliminación lógica de la promoción (`SPEC-18 D-08`). */
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_promotions_pkey", columns: [table.clientId, table.id] }),
    index("idx_promotions_client_active_window")
      .on(table.clientId, table.isActive, table.startsAt, table.endsAt)
      .where(sql`deleted_at IS NULL`),
    check(
      "promotions_scope_type_check",
      sql.raw("scope_type IN ('all_catalog', 'category', 'product')"),
    ),
    check(
      "promotions_discount_type_check",
      sql.raw("discount_type IN ('percentage', 'fixed_amount', 'fixed_price')"),
    ),
    check("promotions_discount_value_check", sql.raw("discount_value > 0")),
    check(
      "promotions_percentage_range_check",
      sql.raw("discount_type <> 'percentage' OR (discount_value >= 1 AND discount_value <= 95)"),
    ),
    check(
      "promotions_fixed_price_scope_check",
      sql.raw("discount_type <> 'fixed_price' OR scope_type = 'product'"),
    ),
    check(
      "promotions_ends_after_starts_check",
      sql.raw("ends_at IS NULL OR ends_at > starts_at"),
    ),
    check(
      "promotions_max_discounted_units_check",
      sql.raw("max_discounted_units IS NULL OR max_discounted_units > 0"),
    ),
    check(
      "promotions_discounted_units_sold_check",
      sql.raw("discounted_units_sold >= 0"),
    ),
  ],
);

/**
 * Objetivos vinculados a una promoción comercial (`admin.promotion_targets`, `SPEC-18 §7.2`).
 *
 * Relaciona una promoción de alcance `product` o `category` con sus productos/combos específicos
 * o nombres de categoría mediante llaves foráneas compuestas `(client_id, *)`.
 */
export const cellPromotionTargets = cellAdminSchema.table(
  "promotion_targets",
  {
    /** Identificador UUIDv7 del objetivo vinculado a la promoción. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino propietario en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Promoción a la que pertenece este objetivo. */
    promotionId: uuid("promotion_id").notNull(),
    /** Tipo de objetivo: producto/combo puntual o categoría de catálogo. */
    targetType: varchar("target_type", { length: 24 }).notNull(),
    /** Producto o combo objetivo cuando `target_type = 'product'`. */
    productId: uuid("product_id"),
    /** Nombre de la categoría objetivo cuando `target_type = 'category'`. */
    categoryName: varchar("category_name", { length: 120 }),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_promotion_targets_pkey", columns: [table.clientId, table.id] }),
    foreignKey({
      name: "promotion_targets_promotion_fk",
      columns: [table.clientId, table.promotionId],
      foreignColumns: [cellPromotions.clientId, cellPromotions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "promotion_targets_product_fk",
      columns: [table.clientId, table.productId],
      foreignColumns: [cellProducts.clientId, cellProducts.id],
    }).onDelete("cascade"),
    index("idx_promotion_targets_promotion").on(table.clientId, table.promotionId),
    index("idx_promotion_targets_product")
      .on(table.clientId, table.productId)
      .where(sql`product_id IS NOT NULL`),
    index("idx_promotion_targets_category")
      .on(table.clientId, sql`lower(${table.categoryName})`)
      .where(sql`category_name IS NOT NULL`),
    check(
      "promotion_targets_type_check",
      sql.raw("target_type IN ('product', 'category')"),
    ),
    check(
      "promotion_targets_payload_consistency_check",
      sql.raw(
        "(target_type = 'product' AND product_id IS NOT NULL AND category_name IS NULL) OR (target_type = 'category' AND category_name IS NOT NULL AND product_id IS NULL)",
      ),
    ),
  ],
);

export type CellPromotion = typeof cellPromotions.$inferSelect;
export type NewCellPromotion = typeof cellPromotions.$inferInsert;
export type CellPromotionTarget = typeof cellPromotionTargets.$inferSelect;
export type NewCellPromotionTarget = typeof cellPromotionTargets.$inferInsert;
