import { check, index, integer, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { clients } from "./clients";
import { cells } from "./cells";
import { auditColumns } from "../shared/audit-columns";

/**
 * Current routing of each tenant to its cell (`client_id -> cell_id`).
 * `client_id` is unique: one tenant has exactly one routing row.
 */
export const clientRouting = adminSchema.table(
  "client_routing",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .unique()
      .references(() => clients.id, { onDelete: "restrict" }),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => cells.id, { onDelete: "restrict" }),
    routingStatus: text("routing_status").notNull().default("pending"),
    routingVersion: integer("routing_version").notNull().default(1),
    ...auditColumns(),
  },
  (table) => [
    index("client_routing_cell_id_idx").on(table.cellId),
    check(
      "client_routing_status_check",
      sql.raw(
        "routing_status IN ('pending', 'active', 'draining', 'readonly', 'maintenance', 'migrating', 'failed')",
      ),
    ),
  ],
);
