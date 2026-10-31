import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import {
  aiProviders,
  aiModels,
  botTones,
  botPresets,
  botDefaults,
  chatwootChannelTypes,
} from "./bot-catalog";
import {
  tenantBots,
  tenantAiProviders,
  tenantModelSettings,
  tenantBotChannels,
  wallets,
  walletTransactions,
  aiUsageEvents,
  aiPlatformKeys,
} from "./bot-tenancy";

const dialect = new PgDialect();

const botCatalogSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle/0010_phase4_bot_catalog_and_tenancy.sql", import.meta.url),
  ),
  "utf8",
);

const botGrantsSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle/0011_phase4_bot_grants_comments.sql", import.meta.url),
  ),
  "utf8",
);

function checkSql(table: PgTable): Record<string, string> {
  const result: Record<string, string> = {};
  for (const check of getTableConfig(table).checks) {
    result[check.name] = dialect.sqlToQuery(check.value).sql;
  }
  return result;
}

function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("BOT-001 T-02 & T-07 · Persistencia del Catálogo de IA, Bots y Billetera", () => {
  it("define ai_providers con validación de códigos autorizados", () => {
    const config = getTableConfig(aiProviders);
    expect(config.name).toBe("ai_providers");
    expect(config.schema).toBe("admin");

    const cols = columnNames(aiProviders);
    expect(cols).toContain("code");
    expect(cols).toContain("name");
    expect(cols).toContain("is_active");
    expect(cols).toContain("supported_modes");

    const checks = checkSql(aiProviders);
    expect(checks["ai_providers_code_check"]).toContain(
      "code IN ('openai', 'anthropic', 'google', 'deepseek', 'openrouter', 'together_ai')",
    );
  });

  it("define ai_models con índice único por proveedor y modelo, y spread >= 0", () => {
    const config = getTableConfig(aiModels);
    expect(config.name).toBe("ai_models");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("ai_models_provider_model_unique");

    const checks = checkSql(aiModels);
    expect(checks["ai_models_spread_percent_check"]).toContain("spread_percent >= 0");
  });

  it("define bot_tones y bot_presets con claves únicas", () => {
    const tonesConfig = getTableConfig(botTones);
    expect(tonesConfig.name).toBe("bot_tones");

    const presetsConfig = getTableConfig(botPresets);
    expect(presetsConfig.name).toBe("bot_presets");
  });

  it("define chatwoot_channel_types con validación de tipos y modos de aprovisionamiento", () => {
    const config = getTableConfig(chatwootChannelTypes);
    expect(config.name).toBe("chatwoot_channel_types");

    const checks = checkSql(chatwootChannelTypes);
    expect(checks["chatwoot_channel_types_code_check"]).toContain(
      "code IN ('website', 'facebook', 'instagram', 'whatsapp_cloud', 'whatsapp_twilio', 'telegram', 'email', 'sms', 'api', 'line')",
    );
    expect(checks["chatwoot_channel_types_provisioning_check"]).toContain(
      "provisioning IN ('api', 'oauth')",
    );
  });

  it("define tenant_bots con check de exclusividad entre preset o proveedor+modelo", () => {
    const config = getTableConfig(tenantBots);
    expect(config.name).toBe("tenant_bots");

    const checks = checkSql(tenantBots);
    expect(checks["tenant_bots_status_check"]).toContain(
      "status IN ('draft', 'active', 'paused')",
    );
    expect(checks["tenant_bots_answer_policy_check"]).toContain(
      "answer_policy IN ('solo_conocimiento', 'libre')",
    );
    expect(checks["tenant_bots_exclusive_model_choice_check"]).toContain("preset_id IS NOT NULL");
  });

  it("define tenant_ai_providers con índice único parcial por cliente y proveedor activo", () => {
    const config = getTableConfig(tenantAiProviders);
    expect(config.name).toBe("tenant_ai_providers");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("tenant_ai_providers_client_provider_active_unique");
  });

  it("define wallets y wallet_transactions con saldos no negativos", () => {
    const walletChecks = checkSql(wallets);
    expect(walletChecks["wallets_balance_usd_cents_check"]).toContain("balance_usd_cents >= 0");

    const txChecks = checkSql(walletTransactions);
    expect(txChecks["wallet_transactions_type_check"]).toContain(
      "type IN ('recharge', 'consumption', 'refund', 'adjustment')",
    );
    expect(txChecks["wallet_transactions_balance_after_check"]).toContain(
      "balance_after_usd_cents >= 0",
    );
  });

  it("garantiza que las migraciones SQL crean todas las tablas y asignan privilegios", () => {
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."ai_providers"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."ai_models"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."bot_tones"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."bot_presets"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."bot_defaults"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."chatwoot_channel_types"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."tenant_bots"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."tenant_ai_providers"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."tenant_model_settings"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."tenant_bot_channels"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."wallets"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."wallet_transactions"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."ai_usage_events"');
    expect(botCatalogSql).toContain('CREATE TABLE "admin"."ai_platform_keys"');

    expect(botGrantsSql).toContain("GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;");
    expect(botGrantsSql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;",
    );
  });
});

