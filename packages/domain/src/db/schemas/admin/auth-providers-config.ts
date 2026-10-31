import { boolean, check, jsonb, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Configuración dinámica de proveedores OAuth/OIDC en el Router Global (`admin.auth_providers_config`).
 * Propiedad de AUTH-001 (AUTH-D-08, design §4.1 y CA-AUTH-02).
 *
 * No tiene `client_id` de inquilino (la columna `client_id` corresponde al OAuth Client ID público del proveedor)
 * y no usa RLS. Se protege con permisos del rol `mocter_auth` (lectura) y `mocter_admin` (escritura).
 * El `client_secret_encrypted` se cifra en reposo mediante AES-256-GCM con clave en `/run/secrets/`.
 */
export const authProvidersConfig = adminSchema.table(
  "auth_providers_config",
  {
    /** Identificador canónico del proveedor en minúsculas (`google`, `facebook`, `microsoft`, etc.). */
    id: text("id").primaryKey(),
    /** Nombre legible del proveedor para la interfaz administrativa y botones OAuth. */
    displayName: text("display_name").notNull(),
    /** Indica si el proveedor está activo para iniciar sesión o vincular cuentas en runtime. */
    isEnabled: boolean("is_enabled").notNull().default(false),
    /** Identificador público OAuth (`client_id` / `app_id`) emitido por el proveedor. */
    clientId: text("client_id"),
    /** Secreto OAuth cifrado con AES-256-GCM (nonce + ciphertext + tag de autenticación). */
    clientSecretEncrypted: bytea("client_secret_encrypted"),
    /** Identificador de la clave maestra usada para cifrar `client_secret_encrypted`. */
    secretKeyId: text("secret_key_id"),
    /** Lista JSON de scopes OAuth solicitados al proveedor (ej. `["openid", "email", "profile"]`). */
    scopes: jsonb("scopes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Endpoint de autorización OAuth2 del proveedor. */
    authUrl: text("auth_url"),
    /** Endpoint de intercambio de código por token OAuth2 del proveedor. */
    tokenUrl: text("token_url"),
    /** Endpoint de consulta de perfil/identidad del usuario en el proveedor. */
    userInfoUrl: text("user_info_url"),
    ...auditColumns(),
  },
  (table) => [
    check(
      "auth_providers_config_id_format_check",
      sql.raw("id = lower(id) AND length(trim(id)) > 0"),
    ),
    check(
      "auth_providers_config_secret_key_pair_check",
      sql.raw("(client_secret_encrypted IS NULL) = (secret_key_id IS NULL)"),
    ),
    check(
      "auth_providers_config_scopes_array_check",
      sql`jsonb_typeof(${table.scopes}) = 'array'`,
    ),
  ],
);

export type AuthProviderConfigRow = typeof authProvidersConfig.$inferSelect;
export type NewAuthProviderConfigRow = typeof authProvidersConfig.$inferInsert;

