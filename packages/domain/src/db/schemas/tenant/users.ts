import {
  bigint,
  check,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Proyección local y almacén de credenciales de usuario en una celda de datos (`admin.users` en `pg-cell-XX`).
 *
 * Propiedad compartida de ADM-001 (T-03, proyección base `id`, `client_id`, `email`, `status`) y
 * AUTH-001 (T-04, `design.md` §4.2 y §4.3, credenciales Argon2id y secretos TOTP cifrados con AES-256-GCM).
 *
 * Reglas arquitectónicas en la celda (DAT-001 §6.3, ADM-001 §5.2, AUTH-001 §4.2):
 * - No se particiona (tabla compartida de bajo volumen por inquilino).
 * - Llave primaria compuesta `(client_id, id)` liderada por `client_id`, preservando el `id` UUID del Router Global.
 * - Índice único compuesto por inquilino `cell_users_email_unique` sobre `(client_id, lower(email))`.
 * - Aislamiento estricto con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` mediante `app.current_client_id`.
 */
export const cellUsers = cellAdminSchema.table(
  "users",
  {
    /** Identificador UUID preservado desde `admin.users` del Router Global. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador UUID del inquilino propietario del registro (sin FK inter-bases hacia Router Global). */
    clientId: uuid("client_id").notNull(),
    /** Correo electrónico de acceso normalizado en minúsculas. */
    email: text("email").notNull(),
    /** Instante de verificación del correo electrónico; nulo mientras esté pendiente. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Hash Argon2id con parámetros y salt embebidos; nulo si la cuenta es exclusivamente federada. */
    passwordHash: text("password_hash"),
    /** Instante de la última actualización de contraseña; nulo si no tiene contraseña nativa. */
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
    /** Secreto TOTP activo cifrado con AES-256-GCM (incluye nonce y tag de autenticación). */
    totpSecretCiphertext: bytea("totp_secret_ciphertext"),
    /** Identificador de la clave simétrica con la que se cifró `totp_secret_ciphertext`. */
    totpKeyId: text("totp_key_id"),
    /** Instante de confirmación del segundo factor 2FA; nulo cuando 2FA está desactivado. */
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    /** Secreto TOTP pendiente de confirmación durante el enrolamiento (vence a los 10 minutos). */
    totpPendingSecretCiphertext: bytea("totp_pending_secret_ciphertext"),
    /** Identificador de la clave simétrica usada para `totp_pending_secret_ciphertext`. */
    totpPendingKeyId: text("totp_pending_key_id"),
    /** Instante de creación del secreto TOTP pendiente. */
    totpPendingCreatedAt: timestamp("totp_pending_created_at", { withTimezone: true }),
    /** Último paso temporal TOTP aceptado para protección contra ataques de repetición (anti-replay). */
    totpLastUsedStep: bigint("totp_last_used_step", { mode: "number" }),
    /** Estado operativo de la cuenta en la celda: `active` o `disabled`. */
    status: text("status").notNull().default("active"),
    /** Nombre visible del usuario. */
    displayName: text("display_name"),
    /** URL de avatar del usuario. */
    avatarUrl: text("avatar_url"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_users_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("cell_users_email_unique").on(table.clientId, sql`lower(${table.email})`),
    check("cell_users_email_lowercase_check", sql.raw("email = lower(email)")),
    check("cell_users_status_check", sql.raw("status IN ('active', 'disabled')")),
    check(
      "cell_users_password_hash_check",
      sql.raw("password_hash IS NULL OR password_hash LIKE '$argon2id$%'"),
    ),
    check(
      "cell_users_password_updated_check",
      sql.raw("(password_hash IS NULL) = (password_updated_at IS NULL)"),
    ),
    check(
      "cell_users_totp_secret_key_check",
      sql.raw("(totp_secret_ciphertext IS NULL) = (totp_key_id IS NULL)"),
    ),
    check(
      "cell_users_totp_enabled_check",
      sql.raw("totp_enabled_at IS NULL OR totp_secret_ciphertext IS NOT NULL"),
    ),
    check(
      "cell_users_totp_pending_check",
      sql.raw(
        "(totp_pending_secret_ciphertext IS NULL) = (totp_pending_key_id IS NULL) AND (totp_pending_secret_ciphertext IS NULL) = (totp_pending_created_at IS NULL)",
      ),
    ),
  ],
);

/** Tipo inferido de lectura para un registro de `admin.users` en una celda de datos. */
export type CellUser = typeof cellUsers.$inferSelect;

/** Tipo inferido de inserción para un registro de `admin.users` en una celda de datos. */
export type NewCellUser = typeof cellUsers.$inferInsert;

