# Handoff Report — Milestone 1 Independent Reviewer 2

## 1. Observation

Direct observations and evidence gathered during independent verification:

### 1.1 Source Code and Interface Contracts
- `packages/domain/src/db/cell-client.ts`:
  - Line 364-370: PgBouncer transaction pooling client configured with `prepare: false`:
    ```ts
    const sqlClient = this.clientFactory(connectionUrl, {
      prepare: false,
      max: this.options.maxConnectionsPerCell ?? 10,
      idle_timeout: this.options.idleTimeoutSeconds ?? 20,
      connect_timeout: this.options.connectTimeoutSeconds ?? 10,
      onnotice: () => {},
    });
    ```
  - Line 250-256: `withTenantCellTransaction` injects local session RLS parameter:
    ```ts
    return await cellDb.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_client_id', ${clientId}, true)`
      );
      return await callback(tx as unknown as DrizzleCellDb);
    });
    ```
  - Line 116, 206, 242: Strict UUID regex guard (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) throwing `CellPoolError` on invalid client IDs.
  - Line 160-172: Thundering herd protection via `pendingConnections` in-flight promise map.
  - Line 265-267: Automatic pool eviction on connectivity failures (`ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`, `connection closed`).
- `packages/domain/src/repositories/drizzle-cell-auth.repository.ts`:
  - Line 34: Constructor wired to `(cellId?: string) => getCellDb(cellId ?? "cell-01")`.
  - Line 67-69: Injects `SELECT set_config('app.current_client_id', ${clientId}, true)` inside cell transaction.
- `packages/domain/src/services/admin-dashboard.service.ts`:
  - Line 2646-2736: `provisionTenantInCellDataPlane` writes base tenant configuration to `pg-cell-XX` under `withTenantCellTransaction`: `cellUsers`, `cellTenantUsers` (`role = 'tenant_owner'`), 4 reserved lead labels in `cellTenantLabels`, and commercial defaults in `cellClientBusinessInfo`.
  - Line 2774-2917: `reconcileProvisionedTenantsInCells` promotes credentials to `pg-cell-01`, sets `users.passwordHash = null` and `users.passwordUpdatedAt = null` in `db-portal`, updates `users.identityLocation = cellId`, and aligns `clients.lifecycleStatus = 'alta'` when zero products exist in cell.
- `packages/domain/src/services/auth.service.ts`:
  - Line 2204-2230: Split-identity password reset writes Argon2id hash to `pg-cell-XX` via `updatePasswordHashInCell` and calls `consumePasswordResetToken` in `db-portal` with `newPasswordHash = null`.
- `packages/domain/src/repositories/drizzle-auth.repository.ts`:
  - Line 707-712: `consumePasswordResetToken` sets `passwordHash = newPasswordHash` and `passwordUpdatedAt = newPasswordHash !== null ? now : null`, strictly satisfying check constraint `((password_hash IS NULL) = (password_updated_at IS NULL))`.

### 1.2 Live Database State Probing via `psql`
1. Control plane (`db-portal` / `mocter-core-pg-portal-1`):
   ```bash
   docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.id, c.slug, c.lifecycle_status, cr.cell_id, u.id as user_id, u.email, u.identity_location, (u.password_hash IS NULL) as hash_cleared, (u.password_updated_at IS NULL) as updated_cleared FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id LEFT JOIN admin.client_routing cr ON c.id = cr.client_id WHERE c.slug = 'synergia-market';"
   ```
   Verbatim output:
   ```
   id: 01a1bc84-cc30-73b6-bc84-1f0cda5a9661
   slug: synergia-market
   lifecycle_status: alta
   cell_id: 6ae5619b-7ca3-4764-baae-1b8950a8e534
   user_id: 01a1bc84-cbec-7a2c-9efe-3a3f55284113
   email: synergiamarket25@gmail.com
   identity_location: 6ae5619b-7ca3-4764-baae-1b8950a8e534
   hash_cleared: t
   updated_cleared: t
   ```
2. Cell data plane (`pg-cell-01` / `mocter-cell-01-pg-cell-1`):
   - User table credentials:
     ```bash
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT id, client_id, email, (password_hash IS NOT NULL) as has_hash, (password_hash LIKE '\$argon2id\$%') as is_argon2id, status FROM admin.users;"
     ```
     Verbatim output:
     ```
     id: 01a1bc84-cbec-7a2c-9efe-3a3f55284113
     client_id: 01a1bc84-cc30-73b6-bc84-1f0cda5a9661
     email: synergiamarket25@gmail.com
     has_hash: t
     is_argon2id: t
     status: active
     ```
   - Operational tables:
     `admin.tenant_users` has 1 row with `role = tenant_owner`, `status = active`.
     `admin.tenant_labels` has 4 rows (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`) with `origin = mocter_default`.
     `admin.client_business_info` has 1 row with `bot_preset = natural_rhythm`.
3. Database Role and RLS Verification:
   - `pg_roles` inspection: `mocter_app` has `rolsuper: f` and `rolbypassrls: f`.
   - Table RLS inspection: All 21 operational tables in schema `admin` have `relrowsecurity: t` and `relforcerowsecurity: t`.
   - Direct RLS query without client context: `SET ROLE mocter_app; SELECT count(*) FROM admin.users;` returns `0`.
   - Direct RLS insert without client context: `INSERT INTO admin.users ...` returns `ERROR: new row violates row-level security policy for table "users"`.
   - Direct privilege escalation attempt: `SET ROLE mocter_app; SET ROLE mocter_bootstrap;` returns `ERROR: permission denied to set role "mocter_bootstrap"`.
   - PgBouncer transaction pooling test on port 6432:
     Executing `BEGIN; SELECT set_config('app.current_client_id', '01a1bc84-cc30-73b6-bc84-1f0cda5a9661', true); SELECT count(*) FROM admin.users; COMMIT;` returns `count = 1`.
     Subsequent query `SELECT current_setting('app.current_client_id', true);` returns empty string `""`, verifying zero parameter leakage.

### 1.3 Test Execution & Compilation
1. Automated domain tests: `corepack pnpm --filter @mocter/domain test`
   Result: **72 test files passed (72)**, **804 passed | 1 skipped** (live reconciliation test).
2. Cell client tests: `corepack pnpm --filter @mocter/domain exec vitest run src/db/cell-client.test.ts`
   Result: **1 test file passed (1)**, **9 passed | 1 skipped**.
3. E2E Scenario A tests: `node tests/e2e/run.mjs --scenario=A`
   Result: **14 passed (14)**, 0 failed.
4. TypeScript build: `corepack pnpm --filter @mocter/domain build` (`tsc`)
   Result: Exit code 0, 0 compilation errors.

---

## 2. Logic Chain

1. **Isolation Invariant**: By enforcing `prepare: false` on the client pool, PgBouncer transaction-mode pooling safely handles ephemeral backend connections without prepared statement collisions (DAT-001 §3.6.2).
2. **Context Leakage Prevention**: Setting `is_local = true` in `SELECT set_config('app.current_client_id', clientId, true)` guarantees that upon transaction commit or rollback, the setting is discarded by PostgreSQL. Direct testing against PgBouncer confirmed that subsequent queries on the same connection see an empty setting, eliminating cross-tenant data leakage risks.
3. **Privilege Boundary Invariant**: Because `mocter_app` is non-superuser (`rolsuper = f`) and cannot bypass RLS (`rolbypassrls = f`), PostgreSQL's `FORCE ROW LEVEL SECURITY` engine intercepts all DML queries. Queries without client context return 0 rows, and unauthorized inserts fail with security violations.
4. **Credential Segregation Invariant**: Promoted tenant identities must never store credentials in the Global Router (`db-portal`). The reconciliation routine safely promoted the Argon2id hash to `admin.users` in `pg-cell-01` and set `password_hash = NULL` and `password_updated_at = NULL` in `db-portal`. Password resets via `AuthService.resetPassword` preserve this invariant by writing the new Argon2id hash directly to `pg-cell-XX`.
5. **Existing Tenant Materialization**: Synergia Market was materialized into `pg-cell-01` with an owner record, `tenant_owner` membership, default labels, and business info. Its `lifecycle_status` in `db-portal` is aligned to `alta`, correctly preparing it for the Milestone 3 onboarding wizard.
6. **No Integrity Violations**: Source code inspection confirmed genuine algorithmic implementations of connection pooling, AES-256-GCM secret decryption, and Drizzle query construction, with zero hardcoding or facade shortcuts.

---

## 3. Caveats

- **Cell Secrets Rotation**: If cell credentials in `admin.cells` are rotated while the application is running, existing cached entries in `CellDatabasePoolManager.pools` will continue to use the old password until `closeCellPool(cellId)` or `shutdown()` is called. In a future milestone, an administrative event hook could trigger pool eviction upon cell secret rotation.
- **Topologies**: Network testing was performed against the `local_compose` topology (`pg-cell-01` and `pgbouncer-cell-01`). Remote VPS topologies (`remote_vps`) were validated via unit tests and mock configuration.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all functional requirements, security invariants, interface contracts, and architectural rules specified in `ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_READY.md`, and `.agents/AGENTS.md`. The implementation is robust, fully verified, and ready for integration.

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Run Domain Unit Tests**:
   ```bash
   corepack pnpm --filter @mocter/domain test
   ```
   *Expected*: 72 passed test files, 804 passed tests, 1 skipped.
2. **Run E2E Scenario A Tests**:
   ```bash
   node tests/e2e/run.mjs --scenario=A
   ```
   *Expected*: 14 passed tests, 0 failed.
3. **Inspect Database State**:
   - `db-portal`:
     ```bash
     docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.id, c.slug, c.lifecycle_status, cr.cell_id, u.id as user_id, u.email, u.identity_location, (u.password_hash IS NULL) as hash_cleared FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id LEFT JOIN admin.client_routing cr ON c.id = cr.client_id WHERE c.slug = 'synergia-market';"
     ```
     *Expected*: `slug = synergia-market`, `lifecycle_status = alta`, `hash_cleared = t`.
   - `pg-cell-01`:
     ```bash
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT id, client_id, email, (password_hash IS NOT NULL) as has_hash, (password_hash LIKE '\$argon2id\$%') as is_argon2id FROM admin.users;"
     ```
     *Expected*: `synergiamarket25@gmail.com` with `has_hash = t` and `is_argon2id = t`.
4. **Invalidation Conditions**:
   - `mocter_app` gaining `SUPERUSER` or `BYPASSRLS` privileges in `pg-cell-01`.
   - `prepare: true` or omitted in `CellDatabasePoolManager`.
   - Any query in tenant services writing operational data to `db-portal` instead of `withTenantCellTransaction`.
   - Password reset for a cell-hosted tenant user writing `password_hash` to `db-portal`.
