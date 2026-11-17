import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { clients } from "./clients";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Configuración de proveedores de envío de correo (`admin.email_provider_configs`, NTF-001 T-02, RF-02).
 *
 * Las credenciales SMTP se cifran con AES-256-GCM y `key_id` de AUTH-D-04.
 */
export const emailProviderConfigs = adminSchema.table(
  "email_provider_configs",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull().unique(),
    driver: text("driver").notNull().default("smtp"),
    host: text("host").notNull(),
    port: integer("port").notNull().default(587),
    secure: boolean("secure").notNull().default(false),
    username: text("username"),
    passwordCiphertext: bytea("password_ciphertext"),
    keyId: text("key_id"),
    status: text("status").notNull().default("active"),
    ...auditColumns(),
  },
  () => [
    check("email_provider_configs_driver_check", sql.raw("driver IN ('smtp')")),
    check(
      "email_provider_configs_status_check",
      sql.raw("status IN ('active', 'disabled')"),
    ),
    check(
      "email_provider_configs_secret_key_check",
      sql.raw("(password_ciphertext IS NULL) = (key_id IS NULL)"),
    ),
  ],
);

/**
 * Remitentes transaccionales administrables (`admin.email_senders`, NTF-001 T-02, RF-01).
 */
export const emailSenders = adminSchema.table(
  "email_senders",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    key: text("key").notNull().unique(),
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to"),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => emailProviderConfigs.id, { onDelete: "restrict" }),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("active"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("email_senders_one_default")
      .on(table.isDefault)
      .where(sql`is_default = true AND status = 'active'`),
    check("email_senders_key_check", sql.raw("key = lower(key)")),
    check("email_senders_from_email_check", sql.raw("from_email = lower(from_email)")),
    check("email_senders_status_check", sql.raw("status IN ('active', 'disabled')")),
  ],
);

/**
 * Catálogo de eventos transaccionales de correo (`admin.email_events`, NTF-001 T-02, RF-03).
 */
export const emailEvents = adminSchema.table(
  "email_events",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    key: text("key").notNull().unique(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    variablesSchema: jsonb("variables_schema").$type<string[]>().notNull(),
    defaultSenderKey: text("default_sender_key").references(() => emailSenders.key, {
      onDelete: "set null",
    }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    tenantConfigurable: boolean("tenant_configurable").notNull().default(true),
    ...auditColumns(),
  },
  () => [
    check("email_events_key_check", sql.raw("key = lower(key)")),
    check(
      "email_events_category_check",
      sql.raw(
        "category IN ('auth', 'billing', 'community', 'referral', 'tenant', 'landing')",
      ),
    ),
  ],
);

/**
 * Plantillas de correo versionadas por evento e idioma (`admin.email_templates`, NTF-001 T-02, RF-04).
 *
 * Solo puede existir una versión `published` por `(event_key, locale)`.
 */
export const emailTemplates = adminSchema.table(
  "email_templates",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    eventKey: text("event_key")
      .notNull()
      .references(() => emailEvents.key, { onDelete: "restrict" }),
    locale: text("locale").notNull().default("es"),
    senderId: uuid("sender_id").references(() => emailSenders.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    bodyJson: jsonb("body_json").$type<Record<string, unknown>>().notNull(),
    bodyHtml: text("body_html").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    isLocked: boolean("is_locked").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("email_templates_event_locale_version_unique").on(
      table.eventKey,
      table.locale,
      table.version,
    ),
    uniqueIndex("email_templates_one_published_per_event_locale")
      .on(table.eventKey, table.locale)
      .where(sql`status = 'published'`),
    check("email_templates_locale_check", sql.raw("locale IN ('es', 'en')")),
    check(
      "email_templates_status_check",
      sql.raw("status IN ('draft', 'published', 'retired')"),
    ),
    check("email_templates_version_check", sql.raw("version > 0")),
  ],
);

/**
 * Outbox transaccional y registro de entregas de correo (`admin.email_deliveries`, NTF-001 T-02, RF-05).
 */
export const emailDeliveries = adminSchema.table(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    eventKey: text("event_key")
      .notNull()
      .references(() => emailEvents.key, { onDelete: "restrict" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "restrict" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => emailSenders.id, { onDelete: "restrict" }),
    recipient: text("recipient").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    locale: text("locale").notNull().default("es"),
    renderedSubject: text("rendered_subject").notNull(),
    renderedHtml: text("rendered_html").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, string | number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    rabbitmqMessageId: text("rabbitmq_message_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...auditColumns(),
  },
  () => [
    check(
      "email_deliveries_status_check",
      sql.raw("status IN ('queued', 'published', 'sending', 'sent', 'failed', 'dead')"),
    ),
    check("email_deliveries_attempts_check", sql.raw("attempts >= 0")),
  ],
);

/**
 * Historial append-only de intentos de entrega (`admin.email_delivery_events`, NTF-001 T-02).
 */
export const emailDeliveryEvents = adminSchema.table("email_delivery_events", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => emailDeliveries.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Preferencias de notificación por comercio y evento (`admin.tenant_notification_preferences`, SPEC-14).
 *
 * Permite activar/desactivar alertas en plataforma o por correo y definir destinatarios específicos
 * por tipo de evento cuando `email_events.tenant_configurable = true`.
 */
export const tenantNotificationPreferences = adminSchema.table(
  "tenant_notification_preferences",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    eventKey: text("event_key")
      .notNull()
      .references(() => emailEvents.key, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    customRecipientEmail: text("custom_recipient_email"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tenant_notification_preferences_client_event_unique").on(
      table.clientId,
      table.eventKey,
    ),
    index("tenant_notification_preferences_client_idx").on(table.clientId),
  ],
);

/**
 * Bandeja de notificaciones operativas dentro del espacio de trabajo del comercio
 * (`admin.tenant_in_app_notifications`, SPEC-14).
 */
export const tenantInAppNotifications = adminSchema.table(
  "tenant_in_app_notifications",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: text("severity").notNull().default("info"),
    actionUrl: text("action_url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tenant_in_app_notifications_client_read_created_idx").on(
      table.clientId,
      table.readAt,
      table.createdAt,
    ),
    check(
      "tenant_in_app_notifications_severity_check",
      sql.raw("severity IN ('info', 'warning', 'success', 'critical')"),
    ),
  ],
);

/**
 * Configuración global bilingüe de encabezado (`body.header`) y pie de página (`body.footer`)
 * institucional heredado automáticamente por todas las plantillas de correo (`admin.email_layout_configs`, SPEC-14).
 */
export const emailLayoutConfigs = adminSchema.table(
  "email_layout_configs",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    locale: text("locale").notNull().unique(),
    headerHtml: text("header_html").notNull(),
    footerHtml: text("footer_html").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    ...auditColumns(),
  },
  () => [check("email_layout_configs_locale_check", sql.raw("locale IN ('es', 'en')"))],
);

export type EmailProviderConfig = typeof emailProviderConfigs.$inferSelect;
export type NewEmailProviderConfig = typeof emailProviderConfigs.$inferInsert;
export type EmailSender = typeof emailSenders.$inferSelect;
export type NewEmailSender = typeof emailSenders.$inferInsert;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type NewEmailDelivery = typeof emailDeliveries.$inferInsert;
export type EmailDeliveryEvent = typeof emailDeliveryEvents.$inferSelect;
export type NewEmailDeliveryEvent = typeof emailDeliveryEvents.$inferInsert;
export type TenantNotificationPreference = typeof tenantNotificationPreferences.$inferSelect;
export type NewTenantNotificationPreference = typeof tenantNotificationPreferences.$inferInsert;
export type TenantInAppNotification = typeof tenantInAppNotifications.$inferSelect;
export type NewTenantInAppNotification = typeof tenantInAppNotifications.$inferInsert;
export type EmailLayoutConfig = typeof emailLayoutConfigs.$inferSelect;
export type NewEmailLayoutConfig = typeof emailLayoutConfigs.$inferInsert;

