import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import {
  cellContacts,
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
    expect(cols).toContain("chatwoot_contact_id");
    expect(cols).toContain("deleted_at");
    expect(cols).toContain("deleted_by");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("contacts_client_cw_contact_unique");
    expect(indexNames).toContain("contacts_client_email_unique");
    expect(indexNames).toContain("contacts_client_document_unique");

    const checks = checkSql(cellContacts);
    expect(checks["contacts_source_check"]).toContain(
      "source IN ('whatsapp', 'web', 'email', 'manual', 'referral', 'other')",
    );
    expect(checks["contacts_stage_check"]).toContain(
      "stage IN ('new', 'in_conversation', 'qualified', 'customer', 'discarded')",
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
});
