import { text, timestamp } from "drizzle-orm/pg-core";

/**
 * Standard audit columns required on every Mocter-owned table (DAT-001 RF-10.9).
 *
 * `created_by` and `updated_by` have no database default: the application must
 * supply the actor in the same write. `updated_at` is refreshed by Drizzle on every
 * UPDATE issued through the ORM (no trigger), so the actor is never hidden.
 *
 * @returns Column builders to spread into a `table(...)` definition.
 */
export function auditColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  };
}
