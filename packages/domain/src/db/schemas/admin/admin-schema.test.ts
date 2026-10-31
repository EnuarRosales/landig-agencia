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
