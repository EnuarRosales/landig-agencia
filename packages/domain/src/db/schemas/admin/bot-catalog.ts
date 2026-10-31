import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Catálogo maestro de proveedores de IA gobernado por la plataforma (`admin.ai_providers`, BOT-001 §4.1).
 */
export const aiProviders = adminSchema.table(
  "ai_providers",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    docsUrl: text("docs_url"),
    supportedModes: jsonb("supported_modes")
      .$type<{ byok: boolean; mocter: boolean }>()
      .notNull()
      .default(sql`'{"byok": true, "mocter": true}'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    check(
      "ai_providers_code_check",
      sql.raw(
        "code IN ('openai', 'anthropic', 'google', 'deepseek', 'openrouter', 'together_ai')",
      ),
    ),
  ],
);

/**
 * Catálogo de modelos de LLM soportados con límites, capacidades y precios (`admin.ai_models`, BOT-001 §4.1).
 */
export const aiModels = adminSchema.table(
  "ai_models",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull(),
    contextWindow: integer("context_window").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    capabilities: jsonb("capabilities")
      .$type<{ tools: boolean; vision: boolean; json: boolean }>()
      .notNull()
      .default(sql`'{"tools": true, "vision": false, "json": true}'::jsonb`),
    recommendedUse: jsonb("recommended_use")
      .$type<{ es: string; en: string }>()
      .notNull(),
    defaultTemperature: text("default_temperature").notNull().default("0.7"),
    defaultMaxTokens: integer("default_max_tokens").notNull().default(1000),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    spreadPercent: integer("spread_percent").notNull().default(30),
    costInputMtokUsdCents: bigint("cost_input_mtok_usd_cents", { mode: "number" }),
    costOutputMtokUsdCents: bigint("cost_output_mtok_usd_cents", { mode: "number" }),
    retailInputMtokUsdCents: bigint("retail_input_mtok_usd_cents", { mode: "number" }),
    retailOutputMtokUsdCents: bigint("retail_output_mtok_usd_cents", { mode: "number" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("ai_models_provider_model_unique").on(table.providerId, table.modelId),
    check("ai_models_spread_percent_check", sql.raw("spread_percent >= 0")),
  ],
);

/**
 * Catálogo de tonos comunicacionales estandarizados para bots (`admin.bot_tones`, BOT-001 §4.1).
 */
export const botTones = adminSchema.table("bot_tones", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  code: text("code").notNull().unique(),
  labels: jsonb("labels").$type<{ es: string; en: string }>().notNull(),
  description: jsonb("description").$type<{ es: string; en: string }>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...auditColumns(),
});

/**
 * Presets preconfigurados de bot con combinaciones optimizadas de modelo y temperatura (`admin.bot_presets`, BOT-001 §4.1).
 */
export const botPresets = adminSchema.table("bot_presets", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  code: text("code").notNull().unique(),
  labels: jsonb("labels").$type<{ es: string; en: string }>().notNull(),
  modelId: uuid("model_id")
    .notNull()
    .references(() => aiModels.id),
  temperature: text("temperature").notNull().default("0.7"),
  maxTokens: integer("max_tokens").notNull().default(1000),
  recommendedFor: jsonb("recommended_for").$type<{ es: string; en: string }>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...auditColumns(),
});

/**
 * Singleton de configuración global por defecto para bots (`admin.bot_defaults`, BOT-001 §4.1, RF-03.3).
 */
export const botDefaults = adminSchema.table("bot_defaults", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  defaultMaxTurns: integer("default_max_turns").notNull().default(10),
  defaultAnswerPolicy: text("default_answer_policy").notNull().default("solo_conocimiento"),
  defaultHandoffTriggers: jsonb("default_handoff_triggers")
    .$type<string[]>()
    .notNull()
    .default(sql`'["asesor", "humano", "reclamo", "queja"]'::jsonb`),
  defaultResponseLanguageBehavior: text("default_response_language_behavior")
    .notNull()
    .default("match_contact"),
  greetingMessageKey: text("greeting_message_key")
    .notNull()
    .default("bot.default_greeting"),
  fallbackMessageKey: text("fallback_message_key")
    .notNull()
    .default("bot.default_fallback"),
  defaultMaxMessagesPerContact: integer("default_max_messages_per_contact")
    .notNull()
    .default(50),
  version: integer("version").notNull().default(1),
  ...auditColumns(),
});

/**
 * Catálogo gobernado de tipos de canales admisibles de Chatwoot (`admin.chatwoot_channel_types`, BOT-001 §4.1).
 */
export const chatwootChannelTypes = adminSchema.table(
  "chatwoot_channel_types",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    code: text("code").notNull().unique(),
    labels: jsonb("labels").$type<{ es: string; en: string }>().notNull(),
    provisioning: text("provisioning").notNull(),
    notes: jsonb("notes").$type<{ es: string; en: string }>(),
    isAdmissible: boolean("is_admissible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    check(
      "chatwoot_channel_types_code_check",
      sql.raw(
        "code IN ('website', 'facebook', 'instagram', 'whatsapp_cloud', 'whatsapp_twilio', 'telegram', 'email', 'sms', 'api', 'line')",
      ),
    ),
    check(
      "chatwoot_channel_types_provisioning_check",
      sql.raw("provisioning IN ('api', 'oauth')"),
    ),
  ],
);

export type AiProvider = typeof aiProviders.$inferSelect;
export type NewAiProvider = typeof aiProviders.$inferInsert;
export type AiModel = typeof aiModels.$inferSelect;
export type NewAiModel = typeof aiModels.$inferInsert;
export type BotTone = typeof botTones.$inferSelect;
export type NewBotTone = typeof botTones.$inferInsert;
export type BotPreset = typeof botPresets.$inferSelect;
export type NewBotPreset = typeof botPresets.$inferInsert;
export type BotDefault = typeof botDefaults.$inferSelect;
export type NewBotDefault = typeof botDefaults.$inferInsert;
export type ChatwootChannelType = typeof chatwootChannelTypes.$inferSelect;
export type NewChatwootChannelType = typeof chatwootChannelTypes.$inferInsert;

