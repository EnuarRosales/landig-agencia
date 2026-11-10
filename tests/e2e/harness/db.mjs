import { execSync } from "node:child_process";
import { config } from "./config.mjs";

/**
 * Direct database assertion helper for E2E tests.
 * Executes queries on db-portal or pg-cell-01 via docker exec psql,
 * guaranteeing zero dependency on ORM internals and immune to host port mapping variations.
 */

export class DbAssertionClient {
  /**
   * Execute raw SQL on db-portal.
   * @param {string} sql
   * @returns {Array<Record<string, any>>}
   */
  static queryPortal(sql) {
    return this._execPsql(config.dbPortal.containerName, config.dbPortal.user, config.dbPortal.database, sql);
  }

  /**
   * Execute raw SQL on pg-cell-01.
   * @param {string} sql
   * @returns {Array<Record<string, any>>}
   */
  static queryCell(sql) {
    return this._execPsql(config.cellDb.containerName, "postgres", config.cellDb.database, sql);
  }

  /**
   * Execute a query on pg-cell-01 within an explicit transaction that enforces RLS under mocter_admin.
   * @param {string|null} clientId - If null or empty, runs without client context.
   * @param {string} sql - SQL to execute inside transaction.
   * @returns {Array<Record<string, any>>|string}
   */
  static queryCellWithTenantContext(clientId, sql) {
    const wrappedSql = clientId
      ? `BEGIN;\nSET ROLE mocter_admin;\nSELECT set_config('app.current_client_id', '${clientId}', true);\n${sql};\nCOMMIT;`
      : `BEGIN;\nSET ROLE mocter_admin;\nSELECT set_config('app.current_client_id', '', true);\n${sql};\nCOMMIT;`;
    return this._execPsql(config.cellDb.containerName, "postgres", config.cellDb.database, wrappedSql);
  }

  static _execPsql(container, user, db, sql) {
    try {
      const cleanSql = sql.trim().replace(/;+$/, "");
      const isMultiStatement = cleanSql.includes(";") || cleanSql.toUpperCase().startsWith("BEGIN");

      if (isMultiStatement) {
        const cmd = `docker exec -i ${container} psql -v ON_ERROR_STOP=1 -U ${user} -d ${db}`;
        const stdout = execSync(cmd, {
          input: sql,
          encoding: "utf8",
          timeout: config.timeouts.dbQueryMs,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return stdout;
      }

      // Single SELECT query: format as JSON for programmatic assertion
      const jsonSql = `SELECT json_agg(t) FROM (${cleanSql}) t;`;
      const cmd = `docker exec -i ${container} psql -v ON_ERROR_STOP=1 -U ${user} -d ${db} -t -A`;
      const stdout = execSync(cmd, {
        input: jsonSql,
        encoding: "utf8",
        timeout: config.timeouts.dbQueryMs,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const trimmed = stdout.trim();
      if (!trimmed || trimmed === "" || trimmed === "null") {
        return [];
      }
      return JSON.parse(trimmed);
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : "";
      const stdout = err.stdout ? err.stdout.toString() : "";
      const combined = [stderr, stdout, err.message].filter(Boolean).join("\n");
      throw new Error(`DbAssertionClient query failed on ${container} (${db}): ${combined}`);
    }
  }

  /**
   * Read single scalar or row.
   */
  static async getClientById(clientId) {
    const rows = this.queryPortal(
      `SELECT id, slug, display_name, lifecycle_status, owner_user_id, plan_id FROM admin.clients WHERE id = '${clientId}'`,
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  static async getPortalUserByEmail(email) {
    const rows = this.queryPortal(
      `SELECT id, email, display_name, identity_location, (password_hash IS NULL) AS password_is_null, status FROM admin.users WHERE email = '${email.toLowerCase()}'`,
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  static async getCellUserByEmail(email) {
    const rows = this.queryCell(
      `SELECT id, client_id, email, display_name, (password_hash IS NOT NULL) AS has_password_hash, status FROM admin.users WHERE email = '${email.toLowerCase()}'`,
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }
}
