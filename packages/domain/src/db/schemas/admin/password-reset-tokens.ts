import { check, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Token de recuperación o establecimiento de contraseña de un solo uso (AUTH-001 design §4.1 y §5.8).
 * `purpose = 'reset'` para cuentas con contraseña y `'setup'` para la primera contraseña de una cuenta federada.
 * Solo se guarda `token_hash = SHA-256(token)`; `consumed_at` es la baja lógica.
 */
export const passwordResetTokens = adminSchema.table(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** SHA-256 of the 32-byte token. Unique; never the raw token. */
    tokenHash: bytea("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** HMAC of the requesting IP with the rate-limit pepper. */
    requestedIpHash: bytea("requested_ip_hash"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("password_reset_token_hash_unique").on(table.tokenHash),
    // Acceso: invalidar tokens anteriores de un usuario al emitir uno nuevo.
    index("password_reset_tokens_user_idx").on(table.userId),
    check("password_reset_tokens_purpose_check", sql.raw("purpose IN ('reset', 'setup')")),
    check("password_reset_tokens_hash_length_check", sql.raw("octet_length(token_hash) = 32")),
  ],
);
