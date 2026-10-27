import { check, integer, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Catalog of tenant data cells (DAT-001 §3.3). Each cell is a separate PostgreSQL
 * instance reached through its own PgBouncer; there are no foreign keys across databases.
 */
export const cells = adminSchema.table(
  "cells",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    code: text("code").notNull().unique(),
    tier: text("tier").notNull().default("standard"),
    status: text("status").notNull().default("active"),
    pgbouncerHost: text("pgbouncer_host").notNull(),
    pgbouncerPort: integer("pgbouncer_port").notNull().default(6432),
    databaseName: text("database_name").notNull(),
    maxClients: integer("max_clients").notNull().default(100),
    currentClients: integer("current_clients").notNull().default(0),
    region: text("region").notNull().default("us-east-1"),
    ...auditColumns(),
  },
  (table) => [
    check(
      "cells_status_check",
      sql.raw("status IN ('active', 'draining', 'readonly', 'maintenance')"),
    ),
    check("cells_max_clients_check", sql.raw("max_clients > 0")),
    check("cells_capacity_check", sql.raw("current_clients <= max_clients")),
  ],
);
