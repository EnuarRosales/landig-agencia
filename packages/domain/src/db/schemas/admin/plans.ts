import { bigint, boolean, char, check, integer, jsonb, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import type { LocalizedList, LocalizedText } from "../shared/i18n";

/**
 * Canonical plan catalog (DAT-001 §3.2, ADM-001 §5). `code` is the stable public slug
 * used by `/register?plan_code=...`; `id` is the UUID referenced by foreign keys.
 */
export const plans = adminSchema.table(
  "plans",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    code: text("code").notNull().unique(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    description: jsonb("description").$type<LocalizedText>(),
    status: text("status").notNull().default("draft"),
    isPublic: boolean("is_public").notNull().default(false),
    isPopular: boolean("is_popular").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    trialDays: integer("trial_days").notNull().default(14),
    graceDays: integer("grace_days").notNull().default(7),
    billingCycles: jsonb("billing_cycles")
      .$type<("monthly" | "annual")[]>()
      .notNull()
      .default(sql`'["monthly","annual"]'::jsonb`),
    priceMonthlyCents: bigint("price_monthly_cents", { mode: "number" }).notNull().default(0),
    priceAnnualCents: bigint("price_annual_cents", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("COP"),
    marketingFeatures: jsonb("marketing_features")
      .$type<LocalizedList>()
      .notNull()
      .default(sql`'{"es":[],"en":[]}'::jsonb`),
    ...auditColumns(),
  },
  (table) => [
    check("plans_status_check", sql.raw("status IN ('draft', 'active', 'retired')")),
  ],
);

/**
 * Representa un registro de plan canónico recuperado de la base de datos.
 */
export type Plan = typeof plans.$inferSelect;

/**
 * Representa la estructura requerida para insertar un nuevo plan canónico.
 */
export type NewPlan = typeof plans.$inferInsert;
