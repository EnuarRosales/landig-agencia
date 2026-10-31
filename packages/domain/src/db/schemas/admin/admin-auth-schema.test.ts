import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { getTableConfig, PgDialect, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { users } from "./users";
import { identities } from "./identities";
import { sessions } from "./sessions";
import { emailVerificationTokens } from "./email-verification-tokens";
import { passwordResetTokens } from "./password-reset-tokens";
import { userConsents } from "./user-consents";
import { authProvidersConfig } from "./auth-providers-config";

const dialect = new PgDialect();

const grantsMigration = readFileSync(
  fileURLToPath(new URL("../../../../drizzle/0003_auth_grants_comments.sql", import.meta.url)),
  "utf8",
);

const providersGrantsMigration = readFileSync(
  fileURLToPath(new URL("../../../../drizzle/0005_auth_providers_grants_comments.sql", import.meta.url)),
  "utf8",
);

/** Returns the rendered SQL of every CHECK constraint declared on a table. */
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

/** Column sets of every unique index declared on a table (plain column names only). */
function uniqueIndexColumns(table: PgTable): string[][] {
  return getTableConfig(table)
    .indexes.filter((index) => index.config.unique)
    .map((index) =>
      index.config.columns.map((column) => (column as PgColumn).name),
    );
}

describe("admin auth schema · users credential and TOTP columns", () => {
  it("adds the credential and TOTP columns as nullable", () => {
    const names = [
      "password_hash",
      "password_updated_at",
      "totp_secret_ciphertext",
      "totp_key_id",
      "totp_enabled_at",
      "totp_pending_secret_ciphertext",
      "totp_pending_key_id",
      "totp_pending_created_at",
      "totp_last_used_step",
    ];
    expect(columnNames(users)).toEqual(expect.arrayContaining(names));
    for (const name of names) {
      expect(columnByName(users, name).notNull, name).toBe(false);
    }
  });

  it("stores TOTP ciphertext as bytea and the step as bigint", () => {
    expect(columnByName(users, "totp_secret_ciphertext").getSQLType()).toBe("bytea");
    expect(columnByName(users, "totp_pending_secret_ciphertext").getSQLType()).toBe("bytea");
    expect(columnByName(users, "totp_last_used_step").getSQLType()).toBe("bigint");
  });

  it("only accepts Argon2id hashes when a password is set", () => {
    const check = checkSql(users)["users_password_hash_check"];
    expect(check).toContain("password_hash IS NULL");
    expect(check).toContain("'$argon2id$%'");
  });

  it("keeps the TOTP key identifier paired with its secret", () => {
    const checks = checkSql(users);
    expect(checks["users_totp_secret_key_check"]).toBe(
      "(totp_secret_ciphertext IS NULL) = (totp_key_id IS NULL)",
    );
    expect(checks["users_totp_enabled_check"]).toBe(
      "totp_enabled_at IS NULL OR totp_secret_ciphertext IS NOT NULL",
    );
  });

  it("keeps users without client_id, as the global anchor", () => {
    expect(columnNames(users)).not.toContain("client_id");
  });
});

describe("admin auth schema · identities", () => {
  it("lives in the admin schema", () => {
    expect(getTableConfig(identities).schema).toBe("admin");
  });

  it("enforces one identity per provider subject and one per user and provider", () => {
    const sets = uniqueIndexColumns(identities);
    expect(sets).toEqual(
      expect.arrayContaining([
        ["provider", "provider_user_id"],
        ["user_id", "provider"],
      ]),
    );
  });

  it("restricts provider to google or facebook", () => {
    expect(checkSql(identities)["identities_provider_check"]).toBe(
      "provider IN ('google', 'facebook')",
    );
  });

  it("references users with an explicit restrict delete", () => {
    const foreignKeys = getTableConfig(identities).foreignKeys;
    expect(foreignKeys).toHaveLength(1);
    const target = foreignKeys[0]?.reference().foreignTable;
    expect(target && getTableConfig(target).name).toBe("users");
  });
});

describe("admin auth schema · sessions", () => {
  it("stores only hashes of the session identifier and CSRF token", () => {
    expect(columnNames(sessions)).toEqual(expect.arrayContaining(["sid_hash", "csrf_hash"]));
    expect(columnNames(sessions)).not.toContain("sid");
    expect(columnByName(sessions, "sid_hash").isUnique).toBe(true);
    expect(columnByName(sessions, "sid_hash").getSQLType()).toBe("bytea");
    expect(columnByName(sessions, "csrf_hash").getSQLType()).toBe("bytea");
    expect(columnByName(sessions, "csrf_hash").notNull).toBe(true);
  });

  it("requires 32-byte hashes", () => {
    const checks = checkSql(sessions);
    expect(checks["sessions_sid_hash_length_check"]).toBe("octet_length(sid_hash) = 32");
    expect(checks["sessions_csrf_hash_length_check"]).toBe("octet_length(csrf_hash) = 32");
  });

  it("requires the absolute lifetime to start after creation", () => {
    expect(checkSql(sessions)["sessions_absolute_expiry_check"]).toBe(
      "absolute_expires_at > created_at",
    );
  });

  it("keeps inactivity expiry within the absolute expiry", () => {
    expect(checkSql(sessions)["sessions_expiry_check"]).toBe(
      "expires_at <= absolute_expires_at",
    );
  });

  it("restricts auth_method to password, google or facebook", () => {
    expect(checkSql(sessions)["sessions_auth_method_check"]).toBe(
      "auth_method IN ('password', 'google', 'facebook')",
    );
  });

  it("keeps client_id as a plain nullable uuid without a foreign key", () => {
    const clientId = columnByName(sessions, "client_id");
    expect(clientId.notNull).toBe(false);
    expect(clientId.getSQLType()).toBe("uuid");

    const foreignKeyColumns = getTableConfig(sessions).foreignKeys.flatMap((foreignKey) =>
      foreignKey.reference().columns.map((reference) => reference.name),
    );
    expect(foreignKeyColumns).not.toContain("client_id");
  });

  it("indexes active sessions by user and by client with partial indexes", () => {
    const indexes = Object.fromEntries(
      getTableConfig(sessions).indexes.map((index) => [index.config.name, index.config]),
    );
    expect(indexes["sessions_user_active_idx"]?.where).toBeDefined();
    expect(indexes["sessions_client_active_idx"]?.where).toBeDefined();
    expect(indexes["sessions_expires_idx"]?.where).toBeUndefined();
  });
});

describe("admin auth schema · verification and reset tokens", () => {
  it.each([
    ["email_verification_tokens", emailVerificationTokens, "email_verification_token_hash_unique"],
    ["password_reset_tokens", passwordResetTokens, "password_reset_token_hash_unique"],
  ])("%s stores only a unique 32-byte token hash", (name, table, indexName) => {
    expect(columnNames(table)).toContain("token_hash");
    expect(columnNames(table)).not.toContain("token");
    expect(columnByName(table, "token_hash").getSQLType()).toBe("bytea");
    expect(uniqueIndexColumns(table)).toContainEqual(["token_hash"]);
    const index = getTableConfig(table).indexes.find(
      (candidate) => candidate.config.name === indexName,
    );
    expect(index?.config.unique).toBe(true);
    expect(checkSql(table)[`${name}_hash_length_check`]).toBe(
      "octet_length(token_hash) = 32",
    );
  });

  it("restricts password reset tokens to reset or setup", () => {
    expect(checkSql(passwordResetTokens)["password_reset_tokens_purpose_check"]).toBe(
      "purpose IN ('reset', 'setup')",
    );
  });

  it("records consumption instead of deleting the token", () => {
    expect(columnByName(emailVerificationTokens, "consumed_at").notNull).toBe(false);
    expect(columnByName(passwordResetTokens, "consumed_at").notNull).toBe(false);
  });
});

describe("admin auth schema · user_consents", () => {
  it("restricts purpose and status to the design values", () => {
    const checks = checkSql(userConsents);
    expect(checks["user_consents_purpose_check"]).toBe(
      "purpose IN ('data_treatment', 'commercial_comms')",
    );
    expect(checks["user_consents_status_check"]).toBe("status IN ('granted', 'revoked')");
  });

  it("ties status to revoked_at so a revocation is always recorded in both", () => {
    expect(checkSql(userConsents)["user_consents_revocation_check"]).toBe(
      "(status = 'revoked') = (revoked_at IS NOT NULL)",
    );
  });
});

describe("admin auth schema · audit columns (DAT-001 RF-10.9)", () => {
  it.each([
    ["identities", identities],
    ["sessions", sessions],
    ["email_verification_tokens", emailVerificationTokens],
    ["password_reset_tokens", passwordResetTokens],
    ["user_consents", userConsents],
    ["auth_providers_config", authProvidersConfig],
  ])("gives %s the mandatory audit columns", (_name, table) => {
    expect(columnNames(table)).toEqual(
      expect.arrayContaining(["created_at", "updated_at", "created_by", "updated_by"]),
    );
  });
});

describe("admin auth schema · auth_providers_config (AUTH-D-08, CA-AUTH-02)", () => {
  it("lives in the admin schema with id as primary key and AES-256-GCM bytea secret", () => {
    expect(getTableConfig(authProvidersConfig).schema).toBe("admin");
    expect(columnByName(authProvidersConfig, "id").primary).toBe(true);
    expect(columnByName(authProvidersConfig, "display_name").notNull).toBe(true);
    expect(columnByName(authProvidersConfig, "is_enabled").notNull).toBe(true);
    expect(columnByName(authProvidersConfig, "client_secret_encrypted").getSQLType()).toBe("bytea");
    expect(columnByName(authProvidersConfig, "scopes").getSQLType()).toBe("jsonb");
  });

  it("enforces lowercase non-empty id, paired secret/key_id and JSON array scopes", () => {
    const checks = checkSql(authProvidersConfig);
    expect(checks["auth_providers_config_id_format_check"]).toBe(
      "id = lower(id) AND length(trim(id)) > 0",
    );
    expect(checks["auth_providers_config_secret_key_pair_check"]).toBe(
      "(client_secret_encrypted IS NULL) = (secret_key_id IS NULL)",
    );
    expect(checks["auth_providers_config_scopes_array_check"]).toContain("jsonb_typeof");
  });

  it("grants DML on auth_providers_config to mocter_auth and mocter_admin with comments", () => {
    expect(providersGrantsMigration).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE admin.auth_providers_config TO mocter_auth;",
    );
    expect(providersGrantsMigration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.auth_providers_config TO mocter_admin;",
    );
    expect(providersGrantsMigration).toContain(
      "COMMENT ON TABLE admin.auth_providers_config IS",
    );
  });
});

describe("mocter_auth grants and comments (0003_auth_grants_comments.sql)", () => {
  const authTables = [
    "users",
    "identities",
    "sessions",
    "email_verification_tokens",
    "password_reset_tokens",
    "user_consents",
  ];

  it("grants SELECT, INSERT and UPDATE on the auth tables", () => {
    expect(grantsMigration).toContain("GRANT USAGE ON SCHEMA admin TO mocter_auth;");
    const grant = grantsMigration.match(/GRANT SELECT, INSERT, UPDATE ON TABLE([^;]*)TO mocter_auth;/);
    expect(grant).not.toBeNull();
    for (const table of authTables) {
      expect(grant?.[1]).toContain(`admin.${table}`);
    }
  });

  it("never grants DELETE, DDL or BYPASSRLS to mocter_auth", () => {
    expect(grantsMigration).not.toMatch(/GRANT[^;]*DELETE[^;]*TO mocter_auth/);
    expect(grantsMigration).not.toMatch(/GRANT ALL[^;]*TO mocter_auth/);
    expect(grantsMigration).not.toMatch(/ALTER ROLE mocter_auth/i);
  });

  it("does not grant access to tenant, client or audit tables", () => {
    expect(grantsMigration).not.toMatch(/GRANT[^;]*\b(clients|tenant_users|audit_log)\b[^;]*TO mocter_auth/);
  });

  it("comments every new table", () => {
    for (const table of [
      "identities",
      "sessions",
      "email_verification_tokens",
      "password_reset_tokens",
      "user_consents",
    ]) {
      expect(grantsMigration).toMatch(new RegExp(`COMMENT ON TABLE admin\\.${table} IS`));
    }
  });

  it("documents the audit_log INSERT prohibition in Spanish for ADM", () => {
    expect(grantsMigration).toContain("NO conceder INSERT a mocter_auth");
  });
});
