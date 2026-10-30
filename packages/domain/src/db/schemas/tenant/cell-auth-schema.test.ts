import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../index";
import { cellUsers } from "./users";
import { cellIdentities } from "./identities";
import { DrizzleCellAuthRepository } from "../../../repositories/drizzle-cell-auth.repository";
import { CellUnavailableError } from "../../../repositories/cell-auth.repository.interface";

const dialect = new PgDialect();

const cellFoundationSql = readFileSync(
  fileURLToPath(new URL("../../../../drizzle-cell/0000_cell_foundation.sql", import.meta.url)),
  "utf8",
);

const cellRlsGrantsSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle-cell/0001_cell_rls_grants_comments.sql", import.meta.url),
  ),
  "utf8",
);

const controlPlaneJournal = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../drizzle/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as { entries: Array<{ tag: string }> };

const cellJournal = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../drizzle-cell/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as { entries: Array<{ tag: string }> };

function checkSql(table: PgTable): Record<string, string> {
  const result: Record<string, string> = {};
  for (const check of getTableConfig(table).checks) {
    result[check.name] = dialect.sqlToQuery(check.value).sql;
  }
  return result;
}

function columnByName(table: PgTable, name: string): PgColumn {
  const column = getTableConfig(table).columns.find((candidate) => candidate.name === name);
  if (!column) throw new Error(`column ${name} not found`);
  return column;
}

function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("ADM-001 T-04 · Separación de las dos líneas de migración Drizzle", () => {
  it("mantiene diarios (_journal.json) independientes entre Control Plane y Cell Data Plane", () => {
    const controlTags = controlPlaneJournal.entries.map((entry) => entry.tag);
    const cellTags = cellJournal.entries.map((entry) => entry.tag);

    expect(controlTags).toContain("0000_foundation");
    expect(cellTags).toEqual(["0000_cell_foundation", "0001_cell_rls_grants_comments"]);
    for (const tag of cellTags) {
      expect(controlTags).not.toContain(tag);
    }
  });

  it("no incluye tablas globales de Control Plane dentro de la línea de celdas", () => {
    expect(cellFoundationSql).not.toContain('"admin"."plans"');
    expect(cellFoundationSql).not.toContain('"admin"."clients"');
    expect(cellFoundationSql).not.toContain('"admin"."cells"');
    expect(cellFoundationSql).not.toContain('"admin"."sessions"');
    expect(cellFoundationSql).not.toContain('"leads"');
  });
});

describe("AUTH-001 T-04 · Esquema de identidad en celda (admin.users y admin.identities)", () => {
  it("declara admin.users en celda con client_id NOT NULL y PK compuesta (client_id, id)", () => {
    const config = getTableConfig(cellUsers);
    expect(config.schema).toBe("admin");
    expect(config.name).toBe("users");

    const clientIdCol = columnByName(cellUsers, "client_id");
    expect(clientIdCol.notNull).toBe(true);
    expect(clientIdCol.getSQLType()).toBe("uuid");

    expect(config.primaryKeys).toHaveLength(1);
    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);
  });

  it("incluye en admin.users de celda todas las columnas de credenciales, TOTP y auditoría", () => {
    expect(columnNames(cellUsers)).toEqual(
      expect.arrayContaining([
        "id",
        "client_id",
        "email",
        "email_verified_at",
        "password_hash",
        "password_updated_at",
        "totp_secret_ciphertext",
        "totp_key_id",
        "totp_enabled_at",
        "totp_pending_secret_ciphertext",
        "totp_pending_key_id",
        "totp_pending_created_at",
        "totp_last_used_step",
        "status",
        "display_name",
        "avatar_url",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
      ]),
    );
    expect(columnNames(cellUsers)).not.toContain("active_client_id");
    expect(columnNames(cellUsers)).not.toContain("identity_location");
  });

  it("crea el índice único cell_users_email_unique sobre (client_id, lower(email))", () => {
    const emailIndex = getTableConfig(cellUsers).indexes.find(
      (index) => index.config.name === "cell_users_email_unique",
    );
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.config.unique).toBe(true);
    const firstCol = emailIndex?.config.columns[0] as PgColumn;
    const secondExpr = emailIndex?.config.columns[1] as SQL;
    expect(firstCol.name).toBe("client_id");
    expect(dialect.sqlToQuery(secondExpr).sql).toMatch(/^lower\(".*"email"\)$/);
  });

  it("aplica restricciones CHECK de correo en minúsculas, Argon2id y consistencia TOTP en celda", () => {
    const checks = checkSql(cellUsers);
    expect(checks["cell_users_email_lowercase_check"]).toBe("email = lower(email)");
    expect(checks["cell_users_status_check"]).toBe("status IN ('active', 'disabled')");
    expect(checks["cell_users_password_hash_check"]).toContain("'$argon2id$%'");
    expect(checks["cell_users_password_updated_check"]).toBe(
      "(password_hash IS NULL) = (password_updated_at IS NULL)",
    );
    expect(checks["cell_users_totp_secret_key_check"]).toBe(
      "(totp_secret_ciphertext IS NULL) = (totp_key_id IS NULL)",
    );
  });

  it("declara admin.identities en celda con PK compuesta (client_id, id), FK intra-inquilino y unicidad por client_id", () => {
    const config = getTableConfig(cellIdentities);
    expect(config.schema).toBe("admin");
    expect(config.name).toBe("identities");
    expect(columnByName(cellIdentities, "client_id").notNull).toBe(true);

    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]?.columns.map((col) => col.name)).toEqual(["client_id", "id"]);

    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0]!;
    expect(fk.onDelete).toBe("restrict");
    expect(fk.reference().columns.map((col) => col.name)).toEqual(["client_id", "user_id"]);
    expect(fk.reference().foreignColumns.map((col) => col.name)).toEqual(["client_id", "id"]);

    const indexByName = Object.fromEntries(
      config.indexes.map((idx) => [
        idx.config.name,
        idx.config.columns.map((col) => (col as PgColumn).name),
      ]),
    );
    expect(indexByName["cell_identities_provider_subject_unique"]).toEqual([
      "client_id",
      "provider",
      "provider_user_id",
    ]);
    expect(indexByName["cell_identities_user_provider_unique"]).toEqual([
      "client_id",
      "user_id",
      "provider",
    ]);
    expect(checkSql(cellIdentities)["cell_identities_provider_check"]).toBe(
      "provider IN ('google', 'facebook')",
    );
  });
});

describe("AUTH-001 T-04 · RLS forzado, privilegios mínimos de mocter_auth y comentarios SQL en celda", () => {
  it("habilita y fuerza Row-Level Security sobre admin.users y admin.identities", () => {
    expect(cellRlsGrantsSql).toContain("ALTER TABLE admin.users ENABLE ROW LEVEL SECURITY;");
    expect(cellRlsGrantsSql).toContain("ALTER TABLE admin.users FORCE ROW LEVEL SECURITY;");
    expect(cellRlsGrantsSql).toContain("ALTER TABLE admin.identities ENABLE ROW LEVEL SECURITY;");
    expect(cellRlsGrantsSql).toContain("ALTER TABLE admin.identities FORCE ROW LEVEL SECURITY;");
    expect(cellRlsGrantsSql).toContain("CREATE POLICY cell_users_client_isolation ON admin.users");
    expect(cellRlsGrantsSql).toContain(
      "CREATE POLICY cell_identities_client_isolation ON admin.identities",
    );
    expect(cellRlsGrantsSql).toContain("current_setting('app.current_client_id', true)");
  });

  it("otorga privilegios estrictos a mocter_auth (SELECT/UPDATE en users; SELECT/INSERT/UPDATE en identities; sin DELETE ni BYPASSRLS)", () => {
    expect(cellRlsGrantsSql).toContain("GRANT USAGE ON SCHEMA admin TO mocter_auth;");
    expect(cellRlsGrantsSql).toContain("GRANT SELECT, UPDATE ON TABLE admin.users TO mocter_auth;");
    expect(cellRlsGrantsSql).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE admin.identities TO mocter_auth;",
    );
    expect(cellRlsGrantsSql).not.toMatch(/GRANT[^;]*INSERT[^;]*admin\.users[^;]*TO mocter_auth/);
    expect(cellRlsGrantsSql).not.toMatch(/GRANT[^;]*DELETE[^;]*TO mocter_auth/);
    expect(cellRlsGrantsSql).not.toContain("mocter_landing");
  });

  it("incluye comentarios SQL obligatorios de esquema, tablas y columnas", () => {
    expect(cellRlsGrantsSql).toContain("COMMENT ON SCHEMA admin IS");
    expect(cellRlsGrantsSql).toContain("COMMENT ON TABLE admin.users IS");
    expect(cellRlsGrantsSql).toContain("COMMENT ON TABLE admin.identities IS");
    expect(cellRlsGrantsSql).toContain("COMMENT ON COLUMN admin.users.client_id IS");
    expect(cellRlsGrantsSql).toContain("COMMENT ON COLUMN admin.identities.client_id IS");
  });
});

describe("AUTH-001 T-04 · DrizzleCellAuthRepository con tablas de celda y Fail-Closed", () => {
  it("rechaza con CellUnavailableError si el evaluador de salud reporta la celda caída", async () => {
    const dbProvider = vi.fn();
    const repo = new DrizzleCellAuthRepository(
      dbProvider as unknown as () => PostgresJsDatabase<typeof schema>,
      async () => false,
    );

    await expect(
      repo.findUserCredentialsInCell("cell-01", "client-01", "user-01"),
    ).rejects.toThrow(CellUnavailableError);
    expect(dbProvider).not.toHaveBeenCalled();
  });

  it("enruta la conexión por cellId y fija app.current_client_id en transacción", async () => {
    const executeMock = vi.fn().mockResolvedValue(undefined);
    const limitMock = vi.fn().mockResolvedValue([
      {
        id: "user-01",
        clientId: "client-01",
        email: "owner@negocio.co",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=1$salt$hash",
        passwordUpdatedAt: new Date("2026-10-30T00:00:00Z"),
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        status: "active",
        displayName: "Dueña Negocio",
        avatarUrl: null,
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });

    const txMock = {
      execute: executeMock,
      select: selectMock,
    };

    const mockDb = {
      transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    } as unknown as PostgresJsDatabase<typeof schema>;

    const dbProvider = vi.fn((_cellId?: string) => mockDb);
    const repo = new DrizzleCellAuthRepository(dbProvider, async () => true);

    const creds = await repo.findUserCredentialsInCell("cell-07", "client-01", "user-01");

    expect(dbProvider).toHaveBeenCalledWith("cell-07");
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith(cellUsers);
    expect(creds?.clientId).toBe("client-01");
    expect(creds?.email).toBe("owner@negocio.co");
  });
});

