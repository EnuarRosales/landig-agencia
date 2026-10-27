import { char, check, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { plans } from "./plans";
import { auditColumns } from "../shared/audit-columns";

/**
 * Tenants (`clients`). `id` is the tenant key (`client_id`) copied into child tables.
 *
 * Phase 1 keeps only the columns needed for identity, plan and routing. Phase 2 fields
 * (owner, quota_version, branding, media and social settings) are added by their owning specs.
 */
export const clients = adminSchema.table(
  "clients",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull().default("alta"),
    locale: text("locale").notNull().default("es"),
    currency: char("currency", { length: 3 }).notNull().default("COP"),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    ...auditColumns(),
  },
  (table) => [
    check(
      "clients_lifecycle_check",
      sql.raw("lifecycle_status IN ('alta', 'activo', 'suspendido', 'baja')"),
    ),
    check("clients_locale_check", sql.raw("locale IN ('es', 'en')")),
  ],
);
