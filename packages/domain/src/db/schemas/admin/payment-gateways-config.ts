import { boolean, check, jsonb, text, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Configuración dinámica de pasarelas y canales de cobro globales en el Router Global (`admin.payment_gateways_config`).
 * Propiedad de BILL-001 (BILL-D-11) y extendida por SPEC-04 para soporte de Bre-B (Colombia / COP).
 *
 * Administra Wompi (Colombia / COP), Stripe (Internacional / USD) y Bre-B (Colombia / COP, verificación manual).
 * Las llaves secretas y secretos de webhook se almacenan cifrados en reposo con AES-256-GCM.
 */
export const paymentGatewaysConfig = adminSchema.table(
  "payment_gateways_config",
  {
    /** Identificador canónico del canal o pasarela (`wompi`, `stripe`, `bre_b`). */
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
    /** Lista ISO-3166 alpha-2 de países cubiertos por el canal (`["CO"]` o `["*"]`). */
    supportedCountries: jsonb("supported_countries")
      .$type<string[]>()
      .notNull()
      .default(sql`'["*"]'::jsonb`),
    /** Tipo de llave Bre-B configurada (`phone`, `email`, `document`, `alphanumeric`, `merchant_code`). */
    breBKeyType: varchar("bre_b_key_type", { length: 32 }),
    /** Valor público de la llave Bre-B mostrada al comercio para transferencias inmediatas. */
    breBKeyValue: varchar("bre_b_key_value", { length: 160 }),
    /** Nombre del titular o comercio receptor registrado para pagos Bre-B. */
    breBRecipientName: varchar("bre_b_recipient_name", { length: 160 }),
    /** Plantilla parametrizada para renderizado determinístico del Código QR dinámico EMVCo/Bre-B. */
    breBQrPayloadTemplate: text("bre_b_qr_payload_template"),
    ...auditColumns(),
  },
  () => [
    check(
      "payment_gateways_config_id_check",
      sql.raw("id IN ('wompi', 'stripe', 'bre_b')"),
    ),
    check(
      "payment_gateways_config_env_check",
      sql.raw("environment IN ('sandbox', 'production')"),
    ),
    check(
      "payment_gateways_config_bre_b_key_type_check",
      sql.raw(
        "bre_b_key_type IS NULL OR bre_b_key_type IN ('phone', 'email', 'document', 'alphanumeric', 'merchant_code')",
      ),
    ),
  ],
);

export type PaymentGatewayConfigRow = typeof paymentGatewaysConfig.$inferSelect;
export type NewPaymentGatewayConfigRow = typeof paymentGatewaysConfig.$inferInsert;

