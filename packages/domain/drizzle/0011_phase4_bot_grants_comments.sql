-- Hand-written migration (drizzle-kit --custom). Applies after 0010_phase4_bot_catalog_and_tenancy.sql.
--
-- Grants privileges on all Phase 4 Bot & AI Control Plane tables to mocter_migrator and mocter_admin,
-- and documents tables and columns (BOT-001 T-02, T-07, T-12, AGENTS.md §4.5).

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
COMMENT ON TABLE admin.ai_providers IS 'Master platform catalog of approved LLM providers with supported operating modes (BOT-001 §4.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.ai_models IS 'Catalog of supported LLM models with capabilities, pricing per Mtok and platform spread (BOT-001 §4.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.bot_tones IS 'Standardized communication tones for conversational bots with i18n labels (BOT-001 §4.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.bot_presets IS 'Pre-configured bot personality and reasoning presets combining model and temperature (BOT-001 §4.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.bot_defaults IS 'Platform singleton configuration of default bot policies, handoff triggers and limits (BOT-001 §4.1, RF-03.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.chatwoot_channel_types IS 'Governed catalog of admissible Chatwoot communication channel types and provisioning modes (BOT-001 §4.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_bots IS 'Authoritative tenant bot configurations, goals, personality and communication policies (BOT-001 §4.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_ai_providers IS 'Tenant LLM credentials and BYOK API keys encrypted with AES-256-GCM (BOT-001 §4.2, T-11).';
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_model_settings IS 'Tenant specific overrides for model temperature and token limits (BOT-001 §4.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_bot_channels IS 'Tenant bot enabled communication channels mapped to Chatwoot inboxes (BOT-001 §4.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.wallets IS 'Prepaid inference balance ledger per tenant in integer USD cents (BOT-001 §4.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.wallet_transactions IS 'Immutable append-only ledger of financial movements, token consumptions and gateway recharges (BOT-001 §4.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.ai_usage_events IS 'Immutable append-only audit trail of LLM token consumptions and operational costs (BOT-001 §4.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.ai_platform_keys IS 'Encrypted platform master keys for Mocter aggregated inference mode (BOT-001 §4.3).';

