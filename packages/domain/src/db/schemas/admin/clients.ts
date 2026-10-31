import {
  type AnyPgColumn,
  char,
  check,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { plans } from "./plans";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Inquilinos (`admin.clients`) en el Router Global. `id` es la llave del inquilino (`client_id`)
 * que se replica en todas las tablas hijas del plano de control y de las celdas (ADM-001 T-06, DAT-001 §3.2).
 *
 * Reglas de negocio sostenidas por esquema:
 * - `owner_user_id` es obligatorio y único entre clientes con `lifecycle_status <> 'baja'` (`clients_one_live_owner`).
 * - `contact_email` es obligatorio y en minúsculas (`clients_contact_email_lowercase_check`).
 * - Los datos comerciales y de contacto (`phone`, `website_url`, `tax_id`, dirección, `industry`, `logo_media_id`)
 *   son opcionales para no generar fricción en el alta (ADM-001 RF-01.11).
 */
export const clients = adminSchema.table(
  "clients",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    phone: text("phone"),
    websiteUrl: text("website_url"),
    lifecycleStatus: text("lifecycle_status").notNull().default("alta"),
    locale: text("locale").notNull().default("es"),
    currency: char("currency", { length: 3 }).notNull().default("COP"),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    quotaVersion: integer("quota_version").notNull().default(1),
    taxId: text("tax_id"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    addressLine: text("address_line"),
    postalCode: text("postal_code"),
    industry: text("industry"),
    timezone: text("timezone").notNull().default("America/Bogota"),
    logoMediaId: uuid("logo_media_id"),
    socialLinks: jsonb("social_links")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("clients_one_live_owner")
      .on(table.ownerUserId)
      .where(sql`lifecycle_status <> 'baja'`),
    check(
      "clients_lifecycle_check",
      sql.raw("lifecycle_status IN ('alta', 'activo', 'suspendido', 'baja')"),
    ),
    check("clients_locale_check", sql.raw("locale IN ('es', 'en')")),
    check("clients_contact_email_lowercase_check", sql.raw("contact_email = lower(contact_email)")),
    check("clients_quota_version_check", sql.raw("quota_version > 0")),
    check("clients_social_links_object_check", sql.raw("jsonb_typeof(social_links) = 'object'")),
  ],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
