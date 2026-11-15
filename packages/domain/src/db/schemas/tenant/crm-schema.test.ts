import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import {
  cellContacts,
  cellContactRatings,
  cellContactAddresses,
  cellProspectConsents,
  cellPrivacyNotices,
  cellContactMemories,
} from "./crm";

const dialect = new PgDialect();

const cellCrmProspectsSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle-cell/0004_cell_phase3_crm_prospects.sql", import.meta.url),
  ),
  "utf8",
);

const cellCrmRlsGrantsSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../drizzle-cell/0005_cell_phase3_crm_rls_grants_comments.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const cellCrmSpec09Sql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle-cell/0015_cell_phase7_crm_spec09.sql", import.meta.url),
  ),
  "utf8",
);

const cellCrmSpec09RlsSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../drizzle-cell/0016_cell_phase7_crm_spec09_rls_grants_comments.sql",
      import.meta.url,
    ),
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

describe("CRM-001 T-02 · Persistencia del CRM en celdas (Cell Data Plane)", () => {
  it("define contacts con llave primaria compuesta (client_id, id) e índices únicos parciales", () => {
    const config = getTableConfig(cellContacts);
    expect(config.name).toBe("contacts");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const cols = columnNames(cellContacts);
    expect(cols).toContain("full_name");
    expect(cols).toContain("phone_mobile");
    expect(cols).toContain("phone_secondary");
    expect(cols).toContain("company_name");
    expect(cols).toContain("birth_date");
    expect(cols).toContain("preferred_channel");
    expect(cols).toContain("last_channel");
    expect(cols).toContain("last_inbound_message_at");
    expect(cols).toContain("last_whatsapp_inbound_at");
    expect(cols).toContain("current_rating_stars");
    expect(cols).toContain("current_rating_comment");
    expect(cols).toContain("converted_to_customer_at");
    expect(cols).toContain("chatwoot_contact_id");
    expect(cols).toContain("deleted_at");
    expect(cols).toContain("deleted_by");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("contacts_client_cw_contact_unique");
    expect(indexNames).toContain("contacts_client_email_unique");
    expect(indexNames).toContain("contacts_client_document_unique");
    expect(indexNames).toContain("contacts_client_last_wa_inbound_idx");
    expect(indexNames).toContain("contacts_client_last_inbound_idx");

    const checks = checkSql(cellContacts);
    expect(checks["contacts_source_check"]).toContain(
      "source IN ('whatsapp', 'instagram', 'facebook', 'web', 'telegram', 'email', 'sms', 'manual', 'referral', 'import', 'api', 'other')",
    );
    expect(checks["contacts_stage_check"]).toContain(
      "stage IN ('new', 'in_conversation', 'qualified', 'customer', 'discarded')",
    );
    expect(checks["contacts_current_rating_stars_check"]).toContain(
      "current_rating_stars >= 1 AND current_rating_stars <= 5",
    );
  });

  it("define prospect_consents con propósito dual (data_treatment, commercial_comms)", () => {
    const config = getTableConfig(cellProspectConsents);
    expect(config.name).toBe("prospect_consents");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const checks = checkSql(cellProspectConsents);
    expect(checks["prospect_consents_purpose_check"]).toContain(
      "purpose IN ('data_treatment', 'commercial_comms')",
    );
    expect(checks["prospect_consents_status_check"]).toContain(
      "status IN ('granted', 'revoked')",
    );
  });

  it("define privacy_notices con client_id obligatorio y versionado por locale", () => {
    const config = getTableConfig(cellPrivacyNotices);
    expect(config.name).toBe("privacy_notices");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("privacy_notices_version_unique");

    const checks = checkSql(cellPrivacyNotices);
    expect(checks["privacy_notices_status_check"]).toContain(
      "status IN ('draft', 'in_review', 'published', 'retired')",
    );
  });

  it("define contact_memories desacoplada con índice único para perfil vivo 1:1", () => {
    const config = getTableConfig(cellContactMemories);
    expect(config.name).toBe("contact_memories");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("contact_memories_profile_unique");

    const checks = checkSql(cellContactMemories);
    expect(checks["contact_memories_kind_check"]).toContain(
      "kind IN ('profile', 'episode')",
    );
  });

  it("aplica aislamiento RLS estricto y comentarios en la migración 0005", () => {
    expect(cellCrmRlsGrantsSql).toContain("ALTER TABLE admin.contacts ENABLE ROW LEVEL SECURITY;");
    expect(cellCrmRlsGrantsSql).toContain("ALTER TABLE admin.contacts FORCE ROW LEVEL SECURITY;");
    expect(cellCrmRlsGrantsSql).toContain(
      "CREATE POLICY cell_contacts_isolation ON admin.contacts",
    );
    expect(cellCrmRlsGrantsSql).toContain(
      "CREATE POLICY cell_prospect_consents_isolation ON admin.prospect_consents",
    );
    expect(cellCrmRlsGrantsSql).toContain(
      "CREATE POLICY cell_privacy_notices_isolation ON admin.privacy_notices",
    );
    expect(cellCrmRlsGrantsSql).toContain(
      "CREATE POLICY cell_contact_memories_isolation ON admin.contact_memories",
    );
    expect(cellCrmRlsGrantsSql).toContain(
      "app.current_client_id",
    );
    expect(cellCrmRlsGrantsSql).toContain(
      "COMMENT ON TABLE admin.contacts IS",
    );
  });

  it("SPEC-09 · define contact_ratings y contact_addresses con RLS y migraciones 0015/0016", () => {
    const ratingsConfig = getTableConfig(cellContactRatings);
    expect(ratingsConfig.name).toBe("contact_ratings");
    expect(ratingsConfig.schema).toBe("admin");
    expect(ratingsConfig.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      "client_id",
      "id",
    ]);
    expect(checkSql(cellContactRatings)["contact_ratings_stars_check"]).toContain(
      "stars >= 1 AND stars <= 5",
    );

    const addressesConfig = getTableConfig(cellContactAddresses);
    expect(addressesConfig.name).toBe("contact_addresses");
    expect(addressesConfig.schema).toBe("admin");
    expect(addressesConfig.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      "client_id",
      "id",
    ]);
    expect(
      addressesConfig.indexes.map((idx) => idx.config.name),
    ).toContain("contact_addresses_one_default_per_contact");

    expect(cellCrmSpec09Sql).toContain('CREATE TABLE "admin"."contact_ratings"');
    expect(cellCrmSpec09Sql).toContain('CREATE TABLE "admin"."contact_addresses"');
    expect(cellCrmSpec09RlsSql).toContain(
      "CREATE POLICY cell_contact_ratings_isolation ON admin.contact_ratings",
    );
    expect(cellCrmSpec09RlsSql).toContain(
      "CREATE POLICY cell_contact_addresses_isolation ON admin.contact_addresses",
    );
  });
});
