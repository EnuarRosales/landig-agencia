import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * `leads` table: public "Solicitar demo" form submissions.
 *
 * PostgreSQL 18+; identifiers map to snake_case columns while keeping
 * camelCase properties for typed selects/inserts.
 */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Row shape returned by selects/inserts over `leads`. */
export type Lead = typeof leads.$inferSelect;

/** Row shape accepted by inserts into `leads`. */
export type NewLead = typeof leads.$inferInsert;
