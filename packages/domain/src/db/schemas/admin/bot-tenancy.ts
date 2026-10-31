import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { clients } from "./clients";
import {
  aiProviders,
  aiModels,
  botTones,
  botPresets,
  chatwootChannelTypes,
} from "./bot-catalog";

/**
 * Configuración autoritativa del bot de atención por inquilino (`admin.tenant_bots`, BOT-001 §4.2).
 */
export const tenantBots = adminSchema.table(
  "tenant_bots",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    toneId: uuid("tone_id")
      .notNull()
      .references(() => botTones.id),
    presetId: uuid("preset_id").references(() => botPresets.id),
    providerId: uuid("provider_id").references(() => aiProviders.id),
    modelId: uuid("model_id").references(() => aiModels.id),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    persona: text("persona"),
    instructions: text("instructions"),
    allowedTopics: text("allowed_topics"),
    excludedTopics: text("excluded_topics"),
    handoffTriggers: jsonb("handoff_triggers")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    maxTurns: integer("max_turns").notNull().default(10),
    greetingMessage: text("greeting_message"),
    fallbackMessage: text("fallback_message"),
    responseLanguage: text("response_language").notNull().default("es"),
    answerPolicy: text("answer_policy").notNull().default("solo_conocimiento"),
    maxMessagesPerContact: integer("max_messages_per_contact")
      .notNull()
      .default(50),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    check(
      "tenant_bots_status_check",
      sql.raw("status IN ('draft', 'active', 'paused')"),
    ),
    check(
      "tenant_bots_answer_policy_check",
      sql.raw("answer_policy IN ('solo_conocimiento', 'libre')"),
    ),
    check(
      "tenant_bots_exclusive_model_choice_check",
      sql.raw(
        "(preset_id IS NOT NULL AND provider_id IS NULL AND model_id IS NULL) OR " +
          "(preset_id IS NULL AND provider_id IS NOT NULL AND model_id IS NOT NULL)",
      ),
    ),
  ],
);

/**
 * Proveedores de IA y llaves BYOK cifradas por inquilino (`admin.tenant_ai_providers`, BOT-001 §4.2, T-11).
 */
export const tenantAiProviders = adminSchema.table(
  "tenant_ai_providers",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    apiKeyKeyId: text("api_key_key_id").notNull(),
    apiKeyLast4: text("api_key_last4").notNull(),
    status: text("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tenant_ai_providers_client_provider_active_unique")
      .on(table.clientId, table.providerId)
      .where(sql`deleted_at IS NULL`),
    check("tenant_ai_providers_status_check", sql.raw("status IN ('active', 'disabled')")),
  ],
);

/**
 * Ajustes específicos de temperatura y tokens por modelo e inquilino (`admin.tenant_model_settings`, BOT-001 §4.2).
 */
export const tenantModelSettings = adminSchema.table(
  "tenant_model_settings",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => aiModels.id),
    temperature: text("temperature").notNull().default("0.7"),
    maxTokens: integer("max_tokens").notNull().default(1000),
    isEnabled: boolean("is_enabled").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tenant_model_settings_client_model_unique")
      .on(table.clientId, table.providerId, table.modelId)
      .where(sql`deleted_at IS NULL`),
  ],
);

/**
 * Canales de atención habilitados para el bot (`admin.tenant_bot_channels`, BOT-001 §4.2).
 */
export const tenantBotChannels = adminSchema.table(
  "tenant_bot_channels",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    botId: uuid("bot_id")
      .notNull()
      .references(() => tenantBots.id),
    channelTypeId: uuid("channel_type_id")
      .notNull()
      .references(() => chatwootChannelTypes.id),
    inboxId: integer("inbox_id"),
    inboxName: text("inbox_name"),
    enabled: boolean("enabled").notNull().default(true),
    greetingOverride: text("greeting_override"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tenant_bot_channels_unique").on(
      table.botId,
      table.channelTypeId,
      table.inboxId,
    ),
  ],
);

/**
 * Billetera de saldo de inferencia Mocter (`admin.wallets`, BOT-001 §4.3).
 */
export const wallets = adminSchema.table(
  "wallets",
  {
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => clients.id),
    balanceUsdCents: bigint("balance_usd_cents", { mode: "number" })
      .notNull()
      .default(0),
    version: integer("version").notNull().default(1),
    ...auditColumns(),
  },
  (table) => [check("wallets_balance_usd_cents_check", sql.raw("balance_usd_cents >= 0"))],
);

/**
 * Movimientos financieros inmutables del saldo de inferencia (`admin.wallet_transactions`, BOT-001 §4.3).
 */
export const walletTransactions = adminSchema.table(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    type: text("type").notNull(),
    amountUsdCents: bigint("amount_usd_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    amountLocalCents: bigint("amount_local_cents", { mode: "number" }),
    fxRate: text("fx_rate"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    balanceAfterUsdCents: bigint("balance_after_usd_cents", { mode: "number" }).notNull(),
    reference: text("reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("wallet_transactions_client_ref_unique").on(
      table.clientId,
      table.reference,
    ),
    check(
      "wallet_transactions_type_check",
      sql.raw("type IN ('recharge', 'consumption', 'refund', 'adjustment')"),
    ),
    check("wallet_transactions_currency_check", sql.raw("currency IN ('COP', 'USD')")),
    check(
      "wallet_transactions_balance_after_check",
      sql.raw("balance_after_usd_cents >= 0"),
    ),
  ],
);

/**
 * Registro append-only de consumo de inferencia y tokens (`admin.ai_usage_events`, BOT-001 §4.3).
 */
export const aiUsageEvents = adminSchema.table(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    botId: uuid("bot_id").references(() => tenantBots.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => aiModels.id),
    mode: text("mode").notNull(),
    purpose: text("purpose").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsdCents: bigint("cost_usd_cents", { mode: "number" }).notNull().default(0),
    walletTransactionId: uuid("wallet_transaction_id").references(
      () => walletTransactions.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("ai_usage_events_mode_check", sql.raw("mode IN ('byok', 'mocter')")),
    check(
      "ai_usage_events_purpose_check",
      sql.raw("purpose IN ('bot', 'assist', 'trial')"),
    ),
    check("ai_usage_events_cost_cents_check", sql.raw("cost_usd_cents >= 0")),
  ],
);

/**
 * Claves de API de plataforma para el modo de inferencia Mocter (`admin.ai_platform_keys`, BOT-001 §4.3).
 */
export const aiPlatformKeys = adminSchema.table(
  "ai_platform_keys",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    keyId: text("key_id").notNull(),
    apiKeyCiphertext: text("api_key_ciphertext").notNull(),
    apiKeyKeyId: text("api_key_key_id").notNull(),
    apiKeyLast4: text("api_key_last4").notNull(),
    status: text("status").notNull().default("active"),
    purpose: text("purpose").notNull().default("inference"),
    ...auditColumns(),
  },
  (table) => [
    check("ai_platform_keys_status_check", sql.raw("status IN ('active', 'retired')")),
  ],
);

export type TenantBot = typeof tenantBots.$inferSelect;
export type NewTenantBot = typeof tenantBots.$inferInsert;
export type TenantAiProvider = typeof tenantAiProviders.$inferSelect;
export type NewTenantAiProvider = typeof tenantAiProviders.$inferInsert;
export type TenantModelSetting = typeof tenantModelSettings.$inferSelect;
export type NewTenantModelSetting = typeof tenantModelSettings.$inferInsert;
export type TenantBotChannel = typeof tenantBotChannels.$inferSelect;
export type NewTenantBotChannel = typeof tenantBotChannels.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type NewAiUsageEvent = typeof aiUsageEvents.$inferInsert;
export type AiPlatformKey = typeof aiPlatformKeys.$inferSelect;
export type NewAiPlatformKey = typeof aiPlatformKeys.$inferInsert;

