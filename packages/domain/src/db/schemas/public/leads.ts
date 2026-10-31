import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Tabla `leads`: Almacena las solicitudes públicas recibidas mediante el formulario de demostración y la API REST,
 * y soporta la gestión comercial en `/admin/leads` por `platform_sales` / `platform_admin` (ADM-001 T-37, RF-16).
 *
 * Diseñada para PostgreSQL 18 con pgvector. Los identificadores de columnas en la base de datos
 * utilizan `snake_case`, mientras que las propiedades TypeScript mapeadas utilizan `camelCase`.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    message: text("message"),
    status: text("status").notNull().default("new"),
    assignedToUserId: uuid("assigned_to_user_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").notNull().default("landing"),
  },
  () => [
    check(
      "leads_status_check",
      sql.raw("status IN ('new', 'contacted', 'qualified', 'discarded')"),
    ),
  ],
);

/**
 * Representa un registro de lead completo tal como se recupera o inserta en la tabla {@link leads}.
 */
export type Lead = typeof leads.$inferSelect;

/**
 * Representa los datos requeridos para realizar una nueva inserción en la tabla {@link leads}.
 */
export type NewLead = typeof leads.$inferInsert;
