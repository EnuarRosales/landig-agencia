import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { clients } from "./clients";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";
import { bytea } from "../shared/bytea";

/**
 * Correlación de inquilinos con cuentas de Chatwoot (`admin.chatwoot_accounts`, ADM-001 T-11, T-12, RF-03.2, RF-03.3).
 *
 * Incluye usuario de servicio, token cifrado AES-256-GCM, inbox webchat inicial,
 * clave de idempotencia, último error y marca de sincronización.
 */
export const chatwootAccounts = adminSchema.table(
  "chatwoot_accounts",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .unique()
      .references(() => clients.id, { onDelete: "cascade" }),
    chatwootAccountId: integer("chatwoot_account_id").unique(),
    serviceUserId: integer("service_user_id"),
    serviceTokenCiphertext: bytea("service_token_ciphertext"),
    serviceTokenKeyId: text("service_token_key_id"),
    webchatInboxId: integer("webchat_inbox_id"),
    webchatWebsiteToken: text("webchat_website_token"),
    state: text("state").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    lastError: text("last_error"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    ...auditColumns(),
  },
  () => [
    check(
      "chatwoot_accounts_state_check",
      sql.raw("state IN ('pending', 'provisioning', 'active', 'failed', 'suspended')"),
    ),
    check(
      "chatwoot_accounts_token_key_check",
      sql.raw("(service_token_ciphertext IS NULL) = (service_token_key_id IS NULL)"),
    ),
  ],
);

/**
 * Invitaciones para unirse a un inquilino existente como `tenant_agent` (`admin.tenant_invitations`, ADM-001 T-08, RF-14.7).
 */
export const tenantInvitations = adminSchema.table(
  "tenant_invitations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("tenant_agent"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: bytea("token_hash").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tenant_invitations_token_hash_unique").on(table.tokenHash),
    check("tenant_invitations_email_lowercase_check", sql.raw("email = lower(email)")),
    check("tenant_invitations_role_check", sql.raw("role = 'tenant_agent'")),
    check(
      "tenant_invitations_status_check",
      sql.raw("status IN ('pending', 'accepted', 'revoked', 'expired')"),
    ),
  ],
);

/**
 * Estado del asistente de onboarding guiado por usuario (`admin.onboarding_sessions`, ADM-001 T-07, RF-14.1 a RF-14.11).
 *
 * Permite interrumpir y retomar el onboarding conservando el `plan_code` durante la ventana de 60 días
 * sin crear un inquilino vacío antes de completar el paso de datos del negocio.
 */
export const onboardingSessions = adminSchema.table(
  "onboarding_sessions",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    planCode: text("plan_code").notNull().default("free"),
    currentStep: text("current_step").notNull().default("business"),
    status: text("status").notNull().default("in_progress"),
    draftPayload: jsonb("draft_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    optionalChecklist: jsonb("optional_checklist")
      .$type<string[]>()
      .notNull()
      .default(sql`'["connect_whatsapp","complete_policies","load_more_products"]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...auditColumns(),
  },
  () => [
    check(
      "onboarding_sessions_step_check",
      sql.raw("current_step IN ('business', 'product', 'bot_channel', 'completed')"),
    ),
    check(
      "onboarding_sessions_status_check",
      sql.raw("status IN ('in_progress', 'completed')"),
    ),
  ],
);

/**
 * Catálogo de plataformas admisibles para enlaces multimedia externos (`admin.external_media_providers`, ADM-001 T-14, §11.5).
 */
export const externalMediaProviders = adminSchema.table(
  "external_media_providers",
  {
    code: text("code").primaryKey(),
    labels: jsonb("labels").$type<{ es: string; en: string }>().notNull(),
    urlPattern: text("url_pattern").notNull(),
    embeddable: boolean("embeddable").notNull().default(true),
    isAdmissible: boolean("is_admissible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  () => [check("external_media_providers_code_check", sql.raw("code = lower(code)"))],
);

/**
 * Catálogo global de archivos multimedia deduplicados por hash (`admin.media_catalog`, ADM-001 T-14, §11.2).
 *
 * No contiene `client_id`. El vínculo con el inquilino y el producto vive en la celda (`client_media`, `product_media`).
 */
export const mediaCatalog = adminSchema.table(
  "media_catalog",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    contentHash: text("content_hash").notNull(),
    storagePoolId: text("storage_pool_id").notNull().default("seaweedfs-main"),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    mediaKind: text("media_kind").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceFormat: text("source_format").notNull(),
    originalFilename: text("original_filename").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    processingStatus: text("processing_status").notNull().default("uploaded"),
    processingError: text("processing_error"),
    storageType: text("storage_type").notNull().default("internal"),
    sourceUrl: text("source_url"),
    provider: text("provider").references(() => externalMediaProviders.code, {
      onDelete: "restrict",
    }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("media_catalog_hash_pool_unique").on(
      table.contentHash,
      table.storagePoolId,
    ),
    check(
      "media_catalog_kind_check",
      sql.raw("media_kind IN ('image', 'audio', 'video', 'pdf')"),
    ),
    check(
      "media_catalog_status_check",
      sql.raw(
        "processing_status IN ('uploaded', 'processing', 'ready', 'failed', 'external')",
      ),
    ),
    check(
      "media_catalog_storage_type_check",
      sql.raw("storage_type IN ('internal', 'external')"),
    ),
  ],
);

/**
 * Variantes transcodificadas en el Router Global (`admin.media_variants`, ADM-001 T-14, §11.3).
 */
export const mediaVariants = adminSchema.table(
  "media_variants",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaCatalog.id, { onDelete: "cascade" }),
    variantCode: text("variant_code").notNull(),
    storagePoolId: text("storage_pool_id").notNull().default("seaweedfs-main"),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    mimeType: text("mime_type").notNull(),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "media_variants_pkey",
      columns: [table.mediaId, table.variantCode],
    }),
  ],
);

/**
 * Roles de plataforma asignados a usuarios globales (`admin.platform_user_roles`, ADM-001 D-31).
 */
export const platformUserRoles = adminSchema.table(
  "platform_user_roles",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("platform_user_roles_active_unique")
      .on(table.userId, table.role)
      .where(sql`revoked_at IS NULL`),
    check(
      "platform_user_roles_role_check",
      sql.raw("role IN ('platform_owner', 'platform_admin', 'platform_sales')"),
    ),
  ],
);

/**
 * Bitácora global de auditoría del plano de control (`admin.audit_log`, ADM-001 §5.1, §14.2).
 */
export const auditLog = adminSchema.table("audit_log", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  justification: text("justification"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatwootAccount = typeof chatwootAccounts.$inferSelect;
export type NewChatwootAccount = typeof chatwootAccounts.$inferInsert;
export type TenantInvitation = typeof tenantInvitations.$inferSelect;
export type NewTenantInvitation = typeof tenantInvitations.$inferInsert;
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type NewOnboardingSession = typeof onboardingSessions.$inferInsert;
export type ExternalMediaProvider = typeof externalMediaProviders.$inferSelect;
export type NewExternalMediaProvider = typeof externalMediaProviders.$inferInsert;
export type MediaCatalogItem = typeof mediaCatalog.$inferSelect;
export type NewMediaCatalogItem = typeof mediaCatalog.$inferInsert;
export type MediaVariant = typeof mediaVariants.$inferSelect;
export type NewMediaVariant = typeof mediaVariants.$inferInsert;
export type PlatformUserRole = typeof platformUserRoles.$inferSelect;
export type NewPlatformUserRole = typeof platformUserRoles.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
