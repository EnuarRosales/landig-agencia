import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { plans } from "./plans";
import { clients } from "./clients";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Catálogo de dimensiones numéricas de plan (`admin.plan_dimensions`, ADM-001 T-10, RF-04.8).
 *
 * Incluye dimensiones como `max_products`, `max_tenant_agents`, `max_images_per_product`,
 * `max_audios`, `max_videos`, `max_pdfs`, `chat_retention_days`, `storage_bytes`,
 * `max_bots`, `max_channels`, `max_followup_sequences`.
 */
export const planDimensions = adminSchema.table(
  "plan_dimensions",
  {
    key: text("key").primaryKey(),
    label: jsonb("label").$type<{ es: string; en: string }>().notNull(),
    unit: text("unit").notNull().default("count"),
    valueType: text("value_type").notNull().default("integer"),
    minValue: bigint("min_value", { mode: "number" }).notNull().default(0),
    maxValue: bigint("max_value", { mode: "number" }),
    defaultValue: bigint("default_value", { mode: "number" }).notNull().default(0),
    legalFloorValue: bigint("legal_floor_value", { mode: "number" }),
    ...auditColumns(),
  },
  () => [
    check("plan_dimensions_key_check", sql.raw("key = lower(key)")),
    check("plan_dimensions_min_check", sql.raw("min_value >= 0")),
    check(
      "plan_dimensions_max_check",
      sql.raw("max_value IS NULL OR max_value >= min_value"),
    ),
  ],
);

/**
 * Topes numéricos por plan y dimensión (`admin.plan_limits`, ADM-001 T-10, DAT-001 §3.3).
 */
export const planLimits = adminSchema.table(
  "plan_limits",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    dimension: text("dimension")
      .notNull()
      .references(() => planDimensions.key, { onDelete: "restrict" }),
    value: bigint("value", { mode: "number" }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("plan_limits_plan_dimension_unique").on(table.planId, table.dimension),
    check("plan_limits_value_check", sql.raw("value >= 0")),
  ],
);

/**
 * Overrides numéricos negociados por inquilino (`admin.client_plan_overrides`, ADM-001 T-10, DAT-001 §3.3).
 */
export const clientPlanOverrides = adminSchema.table(
  "client_plan_overrides",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    dimension: text("dimension")
      .notNull()
      .references(() => planDimensions.key, { onDelete: "restrict" }),
    value: bigint("value", { mode: "number" }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    negotiatedBy: uuid("negotiated_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns(),
  },
  () => [
    check("client_plan_overrides_value_check", sql.raw("value >= 0")),
    check(
      "client_plan_overrides_validity_check",
      sql.raw("valid_to IS NULL OR valid_to > valid_from"),
    ),
  ],
);

/**
 * Catálogo de capacidades (features) de plan (`admin.plan_features`, ADM-001 T-10, RF-04.8).
 *
 * Ejemplos: `white_label` (`enum`: `'none'`, `'paleta'`, `'completa'`), `custom_domain`,
 * `legal_archive`, `community_feed`, `data_export`, `api_access`.
 */
export const planFeatures = adminSchema.table(
  "plan_features",
  {
    key: text("key").primaryKey(),
    label: jsonb("label").$type<{ es: string; en: string }>().notNull(),
    description: jsonb("description").$type<{ es: string; en: string }>(),
    featureType: text("feature_type").notNull().default("boolean"),
    allowedOptions: jsonb("allowed_options").$type<string[]>(),
    ...auditColumns(),
  },
  () => [
    check("plan_features_key_check", sql.raw("key = lower(key)")),
    check("plan_features_type_check", sql.raw("feature_type IN ('boolean', 'enum')")),
  ],
);

/**
 * Valores de capacidades declarados por cada plan (`admin.plan_feature_values`, ADM-001 T-10).
 */
export const planFeatureValues = adminSchema.table(
  "plan_feature_values",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureKey: text("feature_key")
      .notNull()
      .references(() => planFeatures.key, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(false),
    value: jsonb("value").$type<unknown>(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("plan_feature_values_plan_feature_unique").on(
      table.planId,
      table.featureKey,
    ),
  ],
);

/**
 * Overrides de capacidad negociados por inquilino (`admin.client_feature_overrides`, ADM-001 T-10).
 */
export const clientFeatureOverrides = adminSchema.table(
  "client_feature_overrides",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    featureKey: text("feature_key")
      .notNull()
      .references(() => planFeatures.key, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(true),
    value: jsonb("value").$type<unknown>(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    negotiatedBy: uuid("negotiated_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns(),
  },
  () => [
    check(
      "client_feature_overrides_validity_check",
      sql.raw("valid_to IS NULL OR valid_to > valid_from"),
    ),
  ],
);

/**
 * Configuración de qué atributos del producto componen el texto que se vectoriza (`admin.vectorization_config`, ADM-001 T-13, RF-05.7).
 */
export const vectorizationConfig = adminSchema.table(
  "vectorization_config",
  {
    attributeKey: text("attribute_key").primaryKey(),
    enabled: boolean("enabled").notNull().default(true),
    position: integer("position").notNull().default(0),
    ...auditColumns(),
  },
  () => [
    check(
      "vectorization_config_no_prompt_check",
      sql.raw("attribute_key <> 'prompt'"),
    ),
  ],
);

export type PlanDimension = typeof planDimensions.$inferSelect;
export type NewPlanDimension = typeof planDimensions.$inferInsert;
export type PlanLimit = typeof planLimits.$inferSelect;
export type NewPlanLimit = typeof planLimits.$inferInsert;
export type ClientPlanOverride = typeof clientPlanOverrides.$inferSelect;
export type NewClientPlanOverride = typeof clientPlanOverrides.$inferInsert;
export type PlanFeature = typeof planFeatures.$inferSelect;
export type NewPlanFeature = typeof planFeatures.$inferInsert;
export type PlanFeatureValue = typeof planFeatureValues.$inferSelect;
export type NewPlanFeatureValue = typeof planFeatureValues.$inferInsert;
export type ClientFeatureOverride = typeof clientFeatureOverrides.$inferSelect;
export type NewClientFeatureOverride = typeof clientFeatureOverrides.$inferInsert;
export type VectorizationConfigRow = typeof vectorizationConfig.$inferSelect;
export type NewVectorizationConfigRow = typeof vectorizationConfig.$inferInsert;

