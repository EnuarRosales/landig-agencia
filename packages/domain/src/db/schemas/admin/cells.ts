import { check, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea } from "../shared/bytea";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { cellHosts } from "./cell-hosts";

/**
 * Catalog of tenant data cells (DAT-001 §3.3 / §3.6). Each cell is a separate PostgreSQL
 * instance reached through its own PgBouncer; there are no foreign keys across databases.
 * New cells always start in `draft` and only become eligible for tenant assignment after
 * a successful dual 360° handshake (`verifying → active`).
 */
export const cells = adminSchema.table(
  "cells",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    code: text("code").notNull().unique(),
    hostId: uuid("host_id").references(() => cellHosts.id, { onDelete: "restrict" }),
    tier: text("tier").notNull().default("standard"),
    status: text("status").notNull().default("draft"),
    topologyType: text("topology_type").notNull().default("remote_vps"),
    pgbouncerHost: text("pgbouncer_host").notNull(),
    pgbouncerPort: integer("pgbouncer_port").notNull().default(6432),
    databaseName: text("database_name").notNull(),
    appUrl: text("app_url").notNull().default(""),
    privateIp: text("private_ip"),
    publicIp: text("public_ip"),
    workingDir: text("working_dir").notNull().default(""),
    deployUser: text("deploy_user").notNull().default("deploy:1000"),
    cellSecretsCiphertext: bytea("cell_secrets_ciphertext").notNull(),
    cellSecretsKeyId: text("cell_secrets_key_id").notNull(),
    maxClients: integer("max_clients").notNull().default(100),
    currentClients: integer("current_clients").notNull().default(0),
    region: text("region").notNull().default("us-east-1"),
    healthStatus: jsonb("health_status").$type<Record<string, unknown>>(),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    check(
      "cells_status_check",
      sql.raw(
        "status IN ('draft', 'provisioning', 'verifying', 'active', 'draining', 'readonly', 'maintenance', 'error_connection')",
      ),
    ),
    check(
      "cells_topology_check",
      sql.raw("topology_type IN ('local_compose', 'remote_vps')"),
    ),
    check(
      "cells_secrets_payload_check",
      sql.raw("octet_length(cell_secrets_ciphertext) > 0 AND length(cell_secrets_key_id) > 0"),
    ),
    check("cells_max_clients_check", sql.raw("max_clients > 0 AND max_clients <= 100")),
    check("cells_capacity_check", sql.raw("current_clients <= max_clients")),
  ],
);

export type Cell = typeof cells.$inferSelect;
export type NewCell = typeof cells.$inferInsert;
