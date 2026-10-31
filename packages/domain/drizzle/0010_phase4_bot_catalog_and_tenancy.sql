CREATE TABLE "admin"."ai_models" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"context_window" integer NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"capabilities" jsonb DEFAULT '{"tools": true, "vision": false, "json": true}'::jsonb NOT NULL,
	"recommended_use" jsonb NOT NULL,
	"default_temperature" text DEFAULT '0.7' NOT NULL,
	"default_max_tokens" integer DEFAULT 1000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"spread_percent" integer DEFAULT 30 NOT NULL,
	"cost_input_mtok_usd_cents" bigint,
	"cost_output_mtok_usd_cents" bigint,
	"retail_input_mtok_usd_cents" bigint,
	"retail_output_mtok_usd_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "ai_models_spread_percent_check" CHECK (spread_percent >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"docs_url" text,
	"supported_modes" jsonb DEFAULT '{"byok": true, "mocter": true}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "ai_providers_code_unique" UNIQUE("code"),
	CONSTRAINT "ai_providers_code_check" CHECK (code IN ('openai', 'anthropic', 'google', 'deepseek', 'openrouter', 'together_ai'))
);
--> statement-breakpoint
CREATE TABLE "admin"."bot_defaults" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"default_max_turns" integer DEFAULT 10 NOT NULL,
	"default_answer_policy" text DEFAULT 'solo_conocimiento' NOT NULL,
	"default_handoff_triggers" jsonb DEFAULT '["asesor", "humano", "reclamo", "queja"]'::jsonb NOT NULL,
	"default_response_language_behavior" text DEFAULT 'match_contact' NOT NULL,
	"greeting_message_key" text DEFAULT 'bot.default_greeting' NOT NULL,
	"fallback_message_key" text DEFAULT 'bot.default_fallback' NOT NULL,
	"default_max_messages_per_contact" integer DEFAULT 50 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bot_presets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"model_id" uuid NOT NULL,
	"temperature" text DEFAULT '0.7' NOT NULL,
	"max_tokens" integer DEFAULT 1000 NOT NULL,
	"recommended_for" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bot_presets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin"."bot_tones" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bot_tones_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin"."chatwoot_channel_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"labels" jsonb NOT NULL,
	"provisioning" text NOT NULL,
	"notes" jsonb,
	"is_admissible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "chatwoot_channel_types_code_unique" UNIQUE("code"),
	CONSTRAINT "chatwoot_channel_types_code_check" CHECK (code IN ('website', 'facebook', 'instagram', 'whatsapp_cloud', 'whatsapp_twilio', 'telegram', 'email', 'sms', 'api', 'line')),
	CONSTRAINT "chatwoot_channel_types_provisioning_check" CHECK (provisioning IN ('api', 'oauth'))
);
--> statement-breakpoint
CREATE TABLE "admin"."ai_platform_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider_id" uuid NOT NULL,
	"key_id" text NOT NULL,
	"api_key_ciphertext" text NOT NULL,
	"api_key_key_id" text NOT NULL,
	"api_key_last4" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"purpose" text DEFAULT 'inference' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "ai_platform_keys_status_check" CHECK (status IN ('active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "admin"."ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"bot_id" uuid,
	"provider_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"purpose" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_cents" bigint DEFAULT 0 NOT NULL,
	"wallet_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_mode_check" CHECK (mode IN ('byok', 'mocter')),
	CONSTRAINT "ai_usage_events_purpose_check" CHECK (purpose IN ('bot', 'assist', 'trial')),
	CONSTRAINT "ai_usage_events_cost_cents_check" CHECK (cost_usd_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"api_key_ciphertext" text NOT NULL,
	"api_key_key_id" text NOT NULL,
	"api_key_last4" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "tenant_ai_providers_status_check" CHECK (status IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_bot_channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"bot_id" uuid NOT NULL,
	"channel_type_id" uuid NOT NULL,
	"inbox_id" integer,
	"inbox_name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"greeting_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_bots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"tone_id" uuid NOT NULL,
	"preset_id" uuid,
	"provider_id" uuid,
	"model_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"persona" text,
	"instructions" text,
	"allowed_topics" text,
	"excluded_topics" text,
	"handoff_triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_turns" integer DEFAULT 10 NOT NULL,
	"greeting_message" text,
	"fallback_message" text,
	"response_language" text DEFAULT 'es' NOT NULL,
	"answer_policy" text DEFAULT 'solo_conocimiento' NOT NULL,
	"max_messages_per_contact" integer DEFAULT 50 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "tenant_bots_status_check" CHECK (status IN ('draft', 'active', 'paused')),
	CONSTRAINT "tenant_bots_answer_policy_check" CHECK (answer_policy IN ('solo_conocimiento', 'libre')),
	CONSTRAINT "tenant_bots_exclusive_model_choice_check" CHECK ((preset_id IS NOT NULL AND provider_id IS NULL AND model_id IS NULL) OR (preset_id IS NULL AND provider_id IS NOT NULL AND model_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_model_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"temperature" text DEFAULT '0.7' NOT NULL,
	"max_tokens" integer DEFAULT 1000 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_usd_cents" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount_local_cents" bigint,
	"fx_rate" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"balance_after_usd_cents" bigint NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "wallet_transactions_type_check" CHECK (type IN ('recharge', 'consumption', 'refund', 'adjustment')),
	CONSTRAINT "wallet_transactions_currency_check" CHECK (currency IN ('COP', 'USD')),
	CONSTRAINT "wallet_transactions_balance_after_check" CHECK (balance_after_usd_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."wallets" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"balance_usd_cents" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "wallets_balance_usd_cents_check" CHECK (balance_usd_cents >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin"."ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bot_presets" ADD CONSTRAINT "bot_presets_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "admin"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD CONSTRAINT "ai_platform_keys_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_bot_id_tenant_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "admin"."tenant_bots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "admin"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_wallet_transaction_id_wallet_transactions_id_fk" FOREIGN KEY ("wallet_transaction_id") REFERENCES "admin"."wallet_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD CONSTRAINT "tenant_ai_providers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD CONSTRAINT "tenant_ai_providers_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bot_channels" ADD CONSTRAINT "tenant_bot_channels_bot_id_tenant_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "admin"."tenant_bots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bot_channels" ADD CONSTRAINT "tenant_bot_channels_channel_type_id_chatwoot_channel_types_id_fk" FOREIGN KEY ("channel_type_id") REFERENCES "admin"."chatwoot_channel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD CONSTRAINT "tenant_bots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD CONSTRAINT "tenant_bots_tone_id_bot_tones_id_fk" FOREIGN KEY ("tone_id") REFERENCES "admin"."bot_tones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD CONSTRAINT "tenant_bots_preset_id_bot_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "admin"."bot_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD CONSTRAINT "tenant_bots_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD CONSTRAINT "tenant_bots_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "admin"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_model_settings" ADD CONSTRAINT "tenant_model_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_model_settings" ADD CONSTRAINT "tenant_model_settings_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_model_settings" ADD CONSTRAINT "tenant_model_settings_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "admin"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."wallets" ADD CONSTRAINT "wallets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_model_unique" ON "admin"."ai_models" USING btree ("provider_id","model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_ai_providers_client_provider_active_unique" ON "admin"."tenant_ai_providers" USING btree ("client_id","provider_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_bot_channels_unique" ON "admin"."tenant_bot_channels" USING btree ("bot_id","channel_type_id","inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_model_settings_client_model_unique" ON "admin"."tenant_model_settings" USING btree ("client_id","provider_id","model_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_transactions_client_ref_unique" ON "admin"."wallet_transactions" USING btree ("client_id","reference");