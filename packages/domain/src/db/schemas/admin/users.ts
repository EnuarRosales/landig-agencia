import { bigint, check, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Canonical platform identity row (`users`). Owned by ADM-001 (D-34); AUTH-001 adds
 * credential and TOTP columns and its own tables on top of this definition.
 *
 * The row is global: it has no `client_id` and no RLS. `active_client_id` is the
 * single-membership pointer (ADM-001 D-15).
 *
 * Los secretos TOTP viven cifrados con AES-256-GCM; la clave no está en la base (AUTH-001 §7.5).
 */
export const users = adminSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Argon2id hash with its parameters and salt embedded. Null means federated-only account. */
    passwordHash: text("password_hash"),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
    /** AES-256-GCM ciphertext (nonce and tag included) of the active TOTP secret. */
    totpSecretCiphertext: bytea("totp_secret_ciphertext"),
    totpKeyId: text("totp_key_id"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    /** Enrollment secret not yet confirmed; expires 10 minutes after `totp_pending_created_at`. */
    totpPendingSecretCiphertext: bytea("totp_pending_secret_ciphertext"),
    totpPendingKeyId: text("totp_pending_key_id"),
    totpPendingCreatedAt: timestamp("totp_pending_created_at", { withTimezone: true }),
    /** Last accepted TOTP `time_step`; a code with a step less than or equal to it is rejected. */
    totpLastUsedStep: bigint("totp_last_used_step", { mode: "number" }),
    /** `router` or the UUID of the cell that holds the credentials (AUTH-001). */
    identityLocation: text("identity_location").notNull().default("router"),
    /**
     * Membership pointer. Intentionally has NO foreign key: `clients` does not exist
     * until ADM-001 T-06, which adds `users.active_client_id -> clients(id)` (ADM-001 D-34).
     */
    activeClientId: uuid("active_client_id"),
    status: text("status").notNull().default("active"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("users_email_lower_key").on(sql`lower(${table.email})`),
    check("users_email_lowercase_check", sql.raw("email = lower(email)")),
    check(
      "users_identity_location_check",
      sql.raw(
        "identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
      ),
    ),
    check("users_status_check", sql.raw("status IN ('active', 'disabled')")),
    check(
      "users_password_hash_check",
      sql.raw("password_hash IS NULL OR password_hash LIKE '$argon2id$%'"),
    ),
    check(
      "users_password_updated_check",
      sql.raw("(password_hash IS NULL) = (password_updated_at IS NULL)"),
    ),
    check(
      "users_totp_secret_key_check",
      sql.raw("(totp_secret_ciphertext IS NULL) = (totp_key_id IS NULL)"),
    ),
    check(
      "users_totp_enabled_check",
      sql.raw("totp_enabled_at IS NULL OR totp_secret_ciphertext IS NOT NULL"),
    ),
    check(
      "users_totp_pending_check",
      sql.raw(
        "(totp_pending_secret_ciphertext IS NULL) = (totp_pending_key_id IS NULL) AND (totp_pending_secret_ciphertext IS NULL) = (totp_pending_created_at IS NULL)",
      ),
    ),
  ],
);
