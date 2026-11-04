import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import type { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { clientPlans } from "./client-plans";
import { clientRouting } from "./client-routing";
import { cells } from "./cells";
import { plans } from "./plans";
import { users } from "./users";
import { leads } from "../public/leads";
import { planLimits, planDimensions } from "./plan-catalogs";
import {
  chatwootCapabilities,
  chatwootCapabilityDefinitions,
  planCapabilityValues,
  CHATWOOT_CAPABILITY_CATALOG_VERSION,
  CHATWOOT_CAPABILITY_CODES,
  PROVIDER_CHATWOOT_CAPABILITY_CODES,
  COMMERCIAL_CHATWOOT_CAPABILITY_CODES,
  NON_COMMERCIAL_CHATWOOT_CAPABILITY_CODES,
  MOCTER_OWNED_CAPABILITY_CODES,
} from "./chatwoot-capabilities";

const dialect = new PgDialect();

/** Returns the rendered SQL of every CHECK constraint declared on a table. */
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

describe("admin schema · plans", () => {
  it("lives in the admin schema and exposes the canonical columns", () => {
    expect(getTableConfig(plans).schema).toBe("admin");
    expect(columnNames(plans)).toEqual(
      expect.arrayContaining([
        "id",
        "code",
        "name",
        "description",
        "status",
        "is_public",
        "is_popular",
        "sort_order",
        "trial_days",
        "grace_days",
        "billing_cycles",
        "price_monthly_cents",
        "price_annual_cents",
        "currency",
        "marketing_features",
      ]),
    );
  });

  it("makes code unique", () => {
    const code = getTableConfig(plans).columns.find((column) => column.name === "code");
    expect(code?.isUnique).toBe(true);
  });

  it("restricts status to draft, active and retired", () => {
    const checks = checkSql(plans);
    expect(checks["plans_status_check"]).toContain("'draft', 'active', 'retired'");
  });

  it("defaults status to draft and currency to COP", () => {
    const byName = Object.fromEntries(
      getTableConfig(plans).columns.map((column) => [column.name, column]),
    );
    expect(byName["status"]?.default).toBe("draft");
    expect(byName["currency"]?.default).toBe("COP");
  });
});

describe("admin schema · users", () => {
  it("enforces lower-case email with a CHECK constraint", () => {
    expect(checkSql(users)["users_email_lowercase_check"]).toBe("email = lower(email)");
  });

  it("creates a unique index on lower(email)", () => {
    const emailIndex = getTableConfig(users).indexes.find(
      (index) => index.config.name === "users_email_lower_key",
    );
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.config.unique).toBe(true);
    const expression = emailIndex?.config.columns[0];
    expect(expression && "queryChunks" in expression).toBe(true);
    const rendered = dialect.sqlToQuery(expression as SQL).sql;
    expect(rendered).toMatch(/^lower\(".*"email"\)$/);
  });

  it("allows identity_location to be 'router' or a UUID", () => {
    const check = checkSql(users)["users_identity_location_check"];
    expect(check).toContain("identity_location = 'router'");
    expect(check).toContain("[0-9a-f]{8}");
  });

  it("declares active_client_id as a nullable column referencing clients(id) ON DELETE SET NULL (ADM-001 D-34, T-06)", () => {
    const column = getTableConfig(users).columns.find(
      (candidate) => candidate.name === "active_client_id",
    );
    expect(column).toBeDefined();
    expect(column?.notNull).toBe(false);

    const activeClientFk = getTableConfig(users).foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((reference) => reference.name === "active_client_id"),
    );
    expect(activeClientFk).toBeDefined();
    expect(activeClientFk?.onDelete).toBe("set null");
    expect(getTableConfig(activeClientFk!.reference().foreignTable).name).toBe("clients");
  });

  it("keeps the canonical base columns", () => {
    expect(columnNames(users)).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "email_verified_at",
        "identity_location",
        "active_client_id",
        "status",
        "display_name",
        "avatar_url",
      ]),
    );
  });
});

describe("admin schema · tenancy tables", () => {
  it("routes each tenant to exactly one cell through a unique client_id", () => {
    const clientId = getTableConfig(clientRouting).columns.find(
      (column) => column.name === "client_id",
    );
    expect(clientId?.isUnique).toBe(true);
    expect(checkSql(clientRouting)["client_routing_status_check"]).toContain("'failed'");
  });

  it("keeps cell capacity within max_clients", () => {
    expect(checkSql(cells)["cells_capacity_check"]).toBe("current_clients <= max_clients");
  });

  it("restricts client_plans.source to manual or self_service", () => {
    expect(checkSql(clientPlans)["client_plans_source_check"]).toContain(
      "'manual', 'self_service'",
    );
  });

  it("defaults clients to locale es, currency COP, timezone America/Bogota and quota_version 1", () => {
    const byName = Object.fromEntries(
      getTableConfig(clients).columns.map((column) => [column.name, column]),
    );
    expect(byName["locale"]?.default).toBe("es");
    expect(byName["currency"]?.default).toBe("COP");
    expect(byName["timezone"]?.default).toBe("America/Bogota");
    expect(byName["quota_version"]?.default).toBe(1);
    expect(byName["owner_user_id"]?.notNull).toBe(true);
    expect(byName["contact_email"]?.notNull).toBe(true);
    expect(byName["phone"]?.notNull).toBe(false);
    expect(byName["tax_id"]?.notNull).toBe(false);
    expect(byName["address_line"]?.notNull).toBe(false);
  });

  it("enforces clients_one_live_owner partial unique index and lowercase contact_email (ADM-001 T-06)", () => {
    const liveOwnerIndex = getTableConfig(clients).indexes.find(
      (index) => index.config.name === "clients_one_live_owner",
    );
    expect(liveOwnerIndex).toBeDefined();
    expect(liveOwnerIndex?.config.unique).toBe(true);
    const whereSql = dialect.sqlToQuery(liveOwnerIndex?.config.where as SQL).sql;
    expect(whereSql).toContain("lifecycle_status <> 'baja'");

    const checks = checkSql(clients);
    expect(checks["clients_contact_email_lowercase_check"]).toBe(
      "contact_email = lower(contact_email)",
    );
    expect(checks["clients_quota_version_check"]).toBe("quota_version > 0");
    expect(checks["clients_social_links_object_check"]).toBe(
      "jsonb_typeof(social_links) = 'object'",
    );
  });
});

describe("admin schema · audit columns", () => {
  it.each([
    ["plans", plans],
    ["clients", clients],
    ["client_plans", clientPlans],
    ["users", users],
    ["cells", cells],
    ["client_routing", clientRouting],
  ])("gives %s the mandatory audit columns (DAT-001 RF-10.9)", (_name, table) => {
    expect(columnNames(table)).toEqual(
      expect.arrayContaining(["created_at", "updated_at", "created_by", "updated_by"]),
    );
  });
});

describe("admin schema · plan limits (T2)", () => {
  it("stores explicit LIMITED/UNLIMITED mode and a nullable finite value", () => {
    const columns = Object.fromEntries(
      getTableConfig(planLimits).columns.map((column) => [column.name, column]),
    );
    expect(columns["mode"]).toBeDefined();
    expect(columns["mode"]?.notNull).toBe(true);
    expect(columns["mode"]?.default).toBe("LIMITED");
    expect(columns["value"]?.notNull).toBe(false);

    const checks = checkSql(planLimits);
    expect(checks["plan_limits_mode_check"]).toContain("'LIMITED', 'UNLIMITED'");
    expect(checks["plan_limits_mode_value_check"]).toMatch(
      /\(.*mode\s*=\s*'LIMITED'.*value IS NOT NULL.*\).*OR.*\(.*mode\s*=\s*'UNLIMITED'.*value IS NULL.*\)/is,
    );
    expect(checks["plan_limits_value_check"]).toBe("value IS NULL OR value >= 0");
  });

  it("keeps the plan-dimension unique index", () => {
    const index = getTableConfig(planLimits).indexes.find(
      (idx) => idx.config.name === "plan_limits_plan_dimension_unique",
    );
    expect(index).toBeDefined();
    expect(index?.config.unique).toBe(true);
  });

  it("exports the canonical SaaS dimension keys", () => {
    expect(planDimensions).toBeDefined();
    expect(getTableConfig(planDimensions).name).toBe("plan_dimensions");
  });
});

describe("admin schema · Chatwoot capability catalog (T2)", () => {
  it("versions the catalog to Chatwoot Community v4.19.1", () => {
    expect(CHATWOOT_CAPABILITY_CATALOG_VERSION).toBe("v4.19.1");
  });

  it("exposes a provider-mapped + Mocter-owned capability table with raw provider metadata", () => {
    expect(getTableConfig(chatwootCapabilities).schema).toBe("admin");
    expect(getTableConfig(chatwootCapabilities).name).toBe("chatwoot_capabilities");
    expect(columnNames(chatwootCapabilities)).toEqual(
      expect.arrayContaining([
        "code",
        "name",
        "description",
        "provider_code",
        "provider_enabled",
        "provider_flag_group",
        "provider_premium",
        "provider_internal",
        "provider_deprecated",
        "provider_hidden",
        "provider_help_url",
        "ownership",
        "commercial_status",
        "requires_runtime_review",
        "catalog_version",
        "notes",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
      ]),
    );

    const indexes = getTableConfig(chatwootCapabilities).indexes;
    const versionProviderIndex = indexes.find(
      (idx) =>
        idx.config.name === "chatwoot_capabilities_version_provider_code_unique",
    );
    expect(versionProviderIndex).toBeDefined();
    expect(versionProviderIndex?.config.unique).toBe(true);
    const whereSql = versionProviderIndex?.config.where
      ? dialect.sqlToQuery(versionProviderIndex.config.where as SQL).sql
      : "";
    expect(whereSql).toContain('"provider_code" IS NOT NULL');

    const checks = checkSql(chatwootCapabilities);
    expect(checks["chatwoot_capabilities_ownership_check"]).toContain(
      "'provider', 'mocter'",
    );
    expect(checks["chatwoot_capabilities_commercial_status_check"]).toContain(
      "'commercial', 'technical', 'premium_internal', 'deprecated', 'unknown'",
    );
  });

  it("keeps per-plan capability selections disabled by default", () => {
    expect(getTableConfig(planCapabilityValues).schema).toBe("admin");
    expect(getTableConfig(planCapabilityValues).name).toBe("plan_capability_values");
    const columns = Object.fromEntries(
      getTableConfig(planCapabilityValues).columns.map((column) => [
        column.name,
        column,
      ]),
    );
    expect(columns["enabled"]?.notNull).toBe(true);
    expect(columns["enabled"]?.default).toBe(false);

    const index = getTableConfig(planCapabilityValues).indexes.find(
      (idx) => idx.config.name === "plan_capability_values_plan_capability_unique",
    );
    expect(index).toBeDefined();
    expect(index?.config.unique).toBe(true);
  });

  it("seeds exactly 42 provider capabilities plus one Mocter-owned WhatsApp channel", () => {
    expect(CHATWOOT_CAPABILITY_CODES.length).toBe(43);
    expect(PROVIDER_CHATWOOT_CAPABILITY_CODES.length).toBe(42);
    expect(MOCTER_OWNED_CAPABILITY_CODES).toEqual(["channel_whatsapp"]);

    const s5ProviderCodes = [
      "channel_email",
      "channel_facebook",
      "channel_instagram",
      "channel_tiktok",
      "channel_website",
      "inbound_emails",
      "email_continuity_on_api_channel",
      "whatsapp_embedded_signup_inbox_creation",
      "whatsapp_manual_transfer",
      "agent_management",
      "inbox_management",
      "team_management",
      "assignment_v2",
      "agent_bots",
      "automations",
      "delayed_automations",
      "auto_resolve_conversations",
      "canned_responses",
      "macros",
      "campaigns",
      "voice_recorder",
      "crm",
      "crm_integration",
      "custom_attributes",
      "data_import",
      "labels",
      "ip_lookup",
      "companies",
      "api_and_webhooks",
      "integrations",
      "linear_integration",
      "notion_integration",
      "stripe_integration",
      "branded_email_templates",
      "custom_reply_domain",
      "custom_reply_email",
      "reports",
      "report_rollup",
      "help_center",
      "captain_classifier",
      "captain_tasks",
      "chatwoot_v4",
    ];
    const seededSet = new Set(CHATWOOT_CAPABILITY_CODES);
    for (const code of s5ProviderCodes) {
      expect(seededSet.has(code)).toBe(true);
    }

    const byCode = Object.fromEntries(
      chatwootCapabilityDefinitions.map((capability) => [capability.code, capability]),
    );

    // Provider metadata is preserved separately from Mocter commercialization.
    // In Chatwoot v4.19.1 neither companies nor captain_classifier carry a
    // premium or internal marker; they are excluded from the commercial catalog
    // pending runtime validation.
    expect(byCode["companies"].providerPremium).toBe(false);
    expect(byCode["companies"].providerInternal).toBe(false);
    expect(byCode["companies"].commercialStatus).toBe("unknown");
    expect(byCode["companies"].requiresRuntimeReview).toBe(true);

    expect(byCode["captain_classifier"].providerPremium).toBe(false);
    expect(byCode["captain_classifier"].providerInternal).toBe(false);
    expect(byCode["captain_classifier"].commercialStatus).toBe("unknown");
    expect(byCode["captain_classifier"].requiresRuntimeReview).toBe(true);

    // stripe_integration exists in v4.19.1 with provider_enabled=false and no
    // upstream premium/internal marker; its raw provider metadata must not be
    // labelled premium, but it remains a selectable commercial capability.
    expect(byCode["stripe_integration"].providerPremium).toBe(false);
    expect(byCode["stripe_integration"].providerInternal).toBe(false);
    expect(byCode["stripe_integration"].commercialStatus).toBe("commercial");

    expect(byCode["captain_tasks"].commercialStatus).toBe("unknown");
    expect(byCode["chatwoot_v4"].commercialStatus).toBe("technical");

    const commercialSet = new Set(COMMERCIAL_CHATWOOT_CAPABILITY_CODES);
    for (const code of NON_COMMERCIAL_CHATWOOT_CAPABILITY_CODES) {
      expect(commercialSet.has(code)).toBe(false);
    }
  });

  it("maps every provider capability and channel_whatsapp to matching SQL seed metadata", () => {
    const migrationSql = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../drizzle/0026_plan_capabilities_and_limits.sql",
      ),
      "utf-8",
    );

    // Extract each seeded row from the chatwoot_capabilities VALUES block.
    // Columns matched: code, name(jsonb), description(jsonb), provider_code,
    // provider_enabled, provider_flag_group, ownership, commercial_status,
    // requires_runtime_review.
    const rowRe =
      /^\s*\('([^']+)',\s*'({[^{}]*})'::jsonb,\s*'({[^{}]*})'::jsonb,\s*(?:'([^']*)'|NULL),\s*(true|false),\s*(?:'([^']*)'|NULL),\s*'([^']*)',\s*'([^']*)',\s*(true|false),\s*'v4\.19\.1'/gm;

    const rows = new Map<
      string,
      {
        providerCode: string | null;
        providerEnabled: boolean;
        providerFlagGroup: string | null;
        ownership: string;
        commercialStatus: string;
        requiresRuntimeReview: boolean;
      }
    >();

    let match: RegExpExecArray | null;
    while ((match = rowRe.exec(migrationSql)) !== null) {
      rows.set(match[1], {
        providerCode: match[4] ?? null,
        providerEnabled: match[5] === "true",
        providerFlagGroup: match[6] ?? null,
        ownership: match[7],
        commercialStatus: match[8],
        requiresRuntimeReview: match[9] === "true",
      });
    }

    expect(rows.size).toBe(chatwootCapabilityDefinitions.length);

    for (const def of chatwootCapabilityDefinitions) {
      const row = rows.get(def.code);
      expect(row, `missing SQL seed row for ${def.code}`).toBeDefined();
      expect(row?.providerCode).toBe(def.providerCode);
      expect(row?.providerEnabled).toBe(def.providerEnabled);
      expect(row?.providerFlagGroup).toBe(def.providerFlagGroup);
      expect(row?.ownership).toBe(def.ownership);
      expect(row?.commercialStatus).toBe(def.commercialStatus);
      expect(row?.requiresRuntimeReview).toBe(def.requiresRuntimeReview);
    }
  });
});

describe("admin schema · migration 0026 (T2)", () => {
  const migrationSql = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../drizzle/0026_plan_capabilities_and_limits.sql",
    ),
    "utf-8",
  );

  it("backfills existing plan_limits as LIMITED and preserves finite values", () => {
    expect(migrationSql).toContain(
      'ADD COLUMN IF NOT EXISTS "mode" text DEFAULT \'LIMITED\' NOT NULL',
    );
    expect(migrationSql).toContain('ALTER COLUMN "value" DROP NOT NULL');
    expect(migrationSql).toContain(
      'UPDATE "admin"."plan_limits" SET "mode" = \'LIMITED\' WHERE "mode" IS NULL',
    );
    expect(migrationSql).toMatch(/"mode"\s*=\s*'LIMITED'.*"value"\s*IS\s*NOT\s*NULL/s);
    expect(migrationSql).toMatch(/"mode"\s*=\s*'UNLIMITED'.*"value"\s*IS\s*NULL/s);
  });

  it("grants mocter_migrator and mocter_admin privileges on the new catalog tables", () => {
    // Least-privilege, table-specific grants (T2, Recovery Unit 2).
    expect(migrationSql).toContain(
      'GRANT ALL ON TABLE "admin"."chatwoot_capabilities", "admin"."plan_capability_values" TO mocter_migrator',
    );
    expect(migrationSql).toContain(
      'GRANT SELECT ON TABLE "admin"."chatwoot_capabilities" TO mocter_admin',
    );
    expect(migrationSql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "admin"."plan_capability_values" TO mocter_admin',
    );
  });

  it("seeds the canonical SaaS dimensions and the Chatwoot v4.19.1 catalog", () => {
    expect(migrationSql).toContain("'products'");
    expect(migrationSql).toContain("'storage_bytes'");
    expect(migrationSql).toContain("'chatwoot_agents'");
    expect(migrationSql).toContain("'chatwoot_inboxes'");
    expect(migrationSql).toContain("'chatwoot_outbound_emails'");
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS \"admin\".\"chatwoot_capabilities\"");
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS \"admin\".\"plan_capability_values\"");
    expect(migrationSql).toContain("'v4.19.1'");
    expect(migrationSql).toContain("'channel_whatsapp'");
    expect(migrationSql).toMatch(/channel_whatsapp[\s\S]*?'mocter'/);
    expect(migrationSql).toMatch(/captain_classifier[\s\S]*?'unknown'/);
    expect(migrationSql).toMatch(/captain_tasks[\s\S]*?'unknown'/);
    expect(migrationSql).toMatch(/chatwoot_v4[\s\S]*?'technical'/);
    expect(migrationSql).toContain("-- DOWN");
  });

  it("preserves raw provider metadata columns and a unique (version, provider_code) index", () => {
    expect(migrationSql).toContain('"provider_premium" boolean DEFAULT false NOT NULL');
    expect(migrationSql).toContain('"provider_internal" boolean DEFAULT false NOT NULL');
    expect(migrationSql).toContain('"provider_deprecated" boolean DEFAULT false NOT NULL');
    expect(migrationSql).toContain('"provider_hidden" boolean DEFAULT false NOT NULL');
    expect(migrationSql).toContain('"provider_help_url" text');
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "chatwoot_capabilities_version_provider_code_unique"',
    );
    expect(migrationSql).toMatch(
      /chatwoot_capabilities_version_provider_code_unique[\s\S]*?"provider_code" IS NOT NULL/,
    );
  });

  it("fails closed on DOWN and preserves finite values / FK-safe dimension cleanup", () => {
    // The rollback must raise before any destructive schema change.
    expect(migrationSql).toContain("RAISE EXCEPTION");
    expect(migrationSql).toContain(
      'SELECT 1 FROM "admin"."plan_limits" WHERE "mode" = \'UNLIMITED\' OR "value" IS NULL',
    );
    expect(migrationSql).not.toContain(
      'UPDATE "admin"."plan_limits" SET "value" = 0 WHERE "value" IS NULL',
    );

    // Seeded dimension cleanup must exclude rows referenced by plan_limits
    // or client_plan_overrides, and must guard against partial deletions.
    expect(migrationSql).toContain(
      'SELECT 1 FROM "admin"."plan_dimensions" d',
    );
    expect(migrationSql).toContain(
      'SELECT 1 FROM "admin"."plan_limits" l WHERE l."dimension" = d."key"',
    );
    expect(migrationSql).toContain(
      'SELECT 1 FROM "admin"."client_plan_overrides" o WHERE o."dimension" = d."key"',
    );
    expect(migrationSql).toContain(
      'DELETE FROM "admin"."plan_dimensions"',
    );
    expect(migrationSql).toContain(
      '"key" NOT IN (',
    );
    expect(migrationSql).toContain(
      'SELECT "dimension" FROM "admin"."plan_limits"',
    );
    expect(migrationSql).toContain(
      'SELECT "dimension" FROM "admin"."client_plan_overrides"',
    );
  });
});

describe("public schema · leads", () => {
  it("keeps the leads table in the default public schema with its columns", () => {
    const config = getTableConfig(leads);
    expect(config.name).toBe("leads");
    expect(config.schema).toBeUndefined();
    expect(columnNames(leads)).toEqual(
      expect.arrayContaining(["id", "name", "email", "phone", "message", "created_at"]),
    );
  });
});
