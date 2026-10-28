import { check, index, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Token de verificación de correo de un solo uso (AUTH-001 design §4.1 y §5.7).
 * Solo se guarda `token_hash = SHA-256(token)`; el token en claro existe únicamente en el enlace enviado por correo.
 * `consumed_at` es la baja lógica y se marca en la misma transacción que la verificación.
 */
export const emailVerificationTokens = adminSchema.table(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** SHA-256 of the 32-byte token. Unique; never the raw token. */
    tokenHash: bytea("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** HMAC of the requesting IP with the rate-limit pepper. */
    requestedIpHash: bytea("requested_ip_hash"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("email_verification_token_hash_unique").on(table.tokenHash),
    // Acceso: invalidar tokens anteriores de un usuario al reenviar.
    index("email_verification_tokens_user_idx").on(table.userId),
    check("email_verification_tokens_hash_length_check", sql.raw("octet_length(token_hash) = 32")),
  ],
);

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
