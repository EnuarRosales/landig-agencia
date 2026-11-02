import { boolean, check, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Configuración dinámica de pasarelas de pago globales en el Router Global (`admin.payment_gateways_config`).
 * Propiedad de BILL-001 (BILL-D-11, design §3.8 y CA-BILL-01, CA-BILL-02).
 *
 * Administra las credenciales operativas de Wompi (Colombia / COP) y Stripe (Internacional / USD).
 * Las llaves secretas y secretos de webhook se almacenan cifrados en reposo con AES-256-GCM.
 */
export const paymentGatewaysConfig = adminSchema.table(
  "payment_gateways_config",
  {
    /** Identificador canónico de la pasarela (`wompi`, `stripe`). */
    id: text("id").primaryKey(),
    /** Nombre legible de la pasarela para el backoffice. */
    displayName: text("display_name").notNull(),
    /** Indica si la pasarela está habilitada en la plataforma para recibir cobros. */
    isEnabled: boolean("is_enabled").notNull().default(false),
    /** Entorno de ejecución (`sandbox` | `production`). */
    environment: text("environment").notNull().default("sandbox"),
    /** Llave pública de la pasarela para frontend / checkout widget. */
    publicKey: text("public_key"),
    /** Llave secreta / API Secret cifrada en reposo con AES-256-GCM. */
    secretKeyEncrypted: bytea("secret_key_encrypted"),
    /** Secreto de webhook / checksum secret cifrado en reposo con AES-256-GCM. */
    webhookSecretEncrypted: bytea("webhook_secret_encrypted"),
    /** Identificador de la clave maestra usada para el cifrado en reposo. */
    secretKeyId: text("secret_key_id"),
    /** URL canónica generada para la recepción de eventos webhook. */
    webhookUrl: text("webhook_url"),
    ...auditColumns(),
  },
  (table) => [
    check(
      "payment_gateways_config_id_check",
      sql.raw("id IN ('wompi', 'stripe')"),
    ),
    check(
      "payment_gateways_config_env_check",
      sql.raw("environment IN ('sandbox', 'production')"),
    ),
  ],
);

export type PaymentGatewayConfigRow = typeof paymentGatewaysConfig.$inferSelect;
export type NewPaymentGatewayConfigRow = typeof paymentGatewaysConfig.$inferInsert;

