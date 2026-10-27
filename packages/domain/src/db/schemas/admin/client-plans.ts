import { check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { clients } from "./clients";
import { plans } from "./plans";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Plan assignment history per tenant. `clients.plan_id` holds the current plan.
 * `source` records whether the change came from platform sales or self-service (RF-04.7).
 */
export const clientPlans = adminSchema.table(
  "client_plans",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...auditColumns(),
  },
  (table) => [
    index("client_plans_client_id_idx").on(table.clientId),
    check("client_plans_source_check", sql.raw("source IN ('manual', 'self_service')")),
    check(
      "client_plans_validity_check",
      sql.raw("valid_to IS NULL OR valid_to > valid_from"),
    ),
  ],
);
