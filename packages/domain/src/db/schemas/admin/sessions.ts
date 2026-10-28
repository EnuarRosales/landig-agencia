import { check, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Sesión opaca del panel (AUTH-001 design §5.6). Vive en el Router aunque la verificación
 * haya ocurrido en una celda. Solo se guarda `sid_hash = SHA-256(sid)`; el `sid` nunca se persiste en claro.
 *
 * `client_id` es una copia informativa de `users.active_client_id` y no tiene clave foránea:
 * el Router no referencia `clients` desde sesiones (AUTH-001 §4.1). `revoked_at` es la baja lógica.
 */
export const sessions = adminSchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /** SHA-256 of the session identifier (32 bytes). Unique; never the raw `sid`. */
    sidHash: bytea("sid_hash").notNull().unique(),
    /** SHA-256 of the CSRF token (32 bytes). Compared in constant time on mutations. */
    csrfHash: bytea("csrf_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Tenant copied from `users.active_client_id` at session time. Plain UUID, no foreign key. */
    clientId: uuid("client_id"),
    /** Routing version in force for `client_id`; null when the user has no membership. */
    routingVersion: integer("routing_version"),
    authMethod: text("auth_method").notNull(),
    /** Set only when the session passed TOTP; null otherwise. */
    mfaAt: timestamp("mfa_at", { withTimezone: true }),
    /** Last explicit password or TOTP proof; sensitive actions require it within 5 minutes. */
    reauthAt: timestamp("reauth_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Inactivity expiry (30 minutes), extended on activity but never past `absolute_expires_at`. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Absolute maximum lifetime (12 hours). Never extended. */
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    /** HMAC of the client IP with the rate-limit pepper; the IP is never stored in clear. */
    ipHash: bytea("ip_hash"),
    /** HMAC of the user agent; never stored in clear. */
    userAgentHash: bytea("user_agent_hash"),
    ...auditColumns(),
  },
  (table) => [
    // Acceso: listado y revocación masiva de sesiones activas por usuario.
    index("sessions_user_active_idx").on(table.userId).where(sql`revoked_at IS NULL`),
    // Acceso: revocación masiva por inquilino al suspenderlo o darlo de baja.
    index("sessions_client_active_idx").on(table.clientId).where(sql`revoked_at IS NULL`),
    // Acceso: purga diaria de sesiones vencidas.
    index("sessions_expires_idx").on(table.expiresAt),
    check("sessions_absolute_expiry_check", sql.raw("absolute_expires_at > created_at")),
    check("sessions_expiry_check", sql.raw("expires_at <= absolute_expires_at")),
    check(
      "sessions_auth_method_check",
      sql.raw("auth_method IN ('password', 'google', 'facebook')"),
    ),
    check("sessions_sid_hash_length_check", sql.raw("octet_length(sid_hash) = 32")),
    check("sessions_csrf_hash_length_check", sql.raw("octet_length(csrf_hash) = 32")),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
