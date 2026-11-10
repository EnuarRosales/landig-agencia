# Handoff Report — Milestone 1 (M1: Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion)

## 1. Observation

### 1.1 Scope and File Modifications
Modifications were made strictly within the exclusive write ownership boundary:
- `packages/domain/src/db/cell-client.ts` (NEW): Created `CellDatabasePoolManager`, `resolvePgBouncerTarget`, `withTenantCellTransaction`, `getCellDb`, `closeCellPool`, `shutdown`. Enforces `prepare: false` on postgres-js client for PgBouncer transaction pooling, decrypts cell secret credentials via AES-256-GCM (`CellSecretsCryptoService`), resolves topology targets (local_compose to `host.docker.internal` in container or `127.0.0.1` on host), and injects `SELECT set_config('app.current_client_id', clientId, true)`.
- `packages/domain/src/db/cell-client.test.ts` (NEW): 9 unit tests covering `resolvePgBouncerTarget`, cache resolution, invalid UUID rejection, transaction injection of RLS session variables, plus 1 live integration test for `reconcileProvisionedTenantsInCells`.
- `packages/domain/src/db/index.ts`: Re-exported `CellDatabasePoolManager`, `resolvePgBouncerTarget`, `getCellDb`, `withTenantCellTransaction`, and associated types.
- `packages/domain/src/index.ts`: Re-exported `CellDatabaseProvider`, `CellDatabasePoolManager`, `resolvePgBouncerTarget`, `getCellDb`, `withTenantCellTransaction`, and pool error types.
- `packages/domain/src/repositories/drizzle-cell-auth.repository.ts`: Rewired constructor from `getDb()` to `async (cellId?: string) => getCellDb(cellId ?? "cell-01")`, awaiting `getDbForCell(cellId)` across all repository methods.
- `packages/domain/src/repositories/drizzle-crm.repository.ts`: Rewired constructor from `getDb()` to `async (cellId?: string) => getCellDb(cellId ?? "cell-01")`, awaiting `getDbForCell(cellId)` in all methods.
- `packages/domain/src/repositories/drizzle-orders.repository.ts`: Rewired constructor from `getDb()` to `async (cellId?: string) => getCellDb(cellId ?? "cell-01")`, awaiting `getDbForCell(cellId)` in all methods.
- `packages/domain/src/services/tenant-products-and-media.service.ts`: Rewired `DrizzleTenantProductsRepository` to use `portalDb = getDb()` for `getPlanQuota` and `cellTxRunner = withTenantCellTransaction` for operational tables (`products`, `product_media`).
- `packages/domain/src/services/tenant-contacts-and-users.service.ts`: Rewired `DrizzleTenantContactsAndUsersRepository` to use `portalDb = getDb()` for `getPlanQuota`, `tenantInvitations`, and `activeClientId`, and `cellTxRunner = withTenantCellTransaction` for operational tables (`contacts`, `tenant_users`).
- `packages/domain/src/services/admin-dashboard.service.ts`:
  - Implemented `provisionTenantInCellDataPlane(clientId, cellId, ownerUserId, clientData)` materializing `admin.users`, `admin.tenant_users` (`tenant_owner`), 4 reserved lead labels in `admin.tenant_labels`, and `admin.client_business_info`.
  - Updated `createAdminTenant` to set `lifecycle_status = 'alta'` upon creation, update `users.identity_location = assignedCell.id`, and call `provisionTenantInCellDataPlane`.
  - Implemented idempotent `reconcileProvisionedTenantsInCells()` reconciling active routed tenants, promoting credentials to the cell, clearing password hash in `db-portal`, aligning `lifecycle_status = 'alta'` when zero products exist.
- `packages/domain/src/services/rbac.service.ts`: Updated `fetchRbacOverview` to correlate `admin.users` with client ownership (`clients.owner_user_id` -> `tenant_owner`) and agent status (`users.active_client_id` -> `tenant_agent`), updating role user counts, and mapping cell UUID to friendly code (`cell-01`).
- `packages/domain/src/services/auth.service.ts`: Updated `resetPassword` to inspect cell identity location, write the Argon2id hash to `pg-cell-XX` (`admin.users`), and consume the token in `db-portal` with `null` password hash.
- `packages/domain/src/repositories/auth.repository.interface.ts` & `packages/domain/src/repositories/drizzle-auth.repository.ts`: Updated `consumePasswordResetToken` to accept `newPasswordHash: string | null`, and set `passwordUpdatedAt: newPasswordHash !== null ? now : null` to satisfy the check constraint `((password_hash IS NULL) = (password_updated_at IS NULL))`.

### 1.2 Database Observations
1. Container `mocter-cell-01-pg-cell-1` (`pg-cell-01`):
   - Created dedicated `mocter_app` role with `NOSUPERUSER NOBYPASSRLS` and granted full permissions on schemas `admin`, `drizzle`, `public`.
   - Verified strict RLS enforcement: attempting insert into `admin.users` without `app.current_client_id` fails with `ERROR: new row violates row-level security policy for table "users"`. Setting `app.current_client_id` allows insert.
2. Live Reconciliation Execution:
   - Command: `docker exec -e RUN_LIVE_RECONCILIATION=true mocter-core-admin-portal-1 pnpm --filter @mocter/domain exec vitest run src/db/cell-client.test.ts`
   - Output:
     ```
     [INFO] [MocterDomain] [CellDatabasePoolManager] Pool inicializado para celda cell-01 (6ae5619b-7ca3-4764-baae-1b8950a8e534) en host.docker.internal:6432
     [INFO] [MocterDomain] [reconcileProvisionedTenantsInCells] Reconciliación completada { reconciledCount: 1 }
     ✓ Live Cell Reconciliation (TNT-001 M1) > reconcilia y materializa Synergia Market en pg-cell-01 con RLS estricto 4371ms
     Test Files  1 passed (1)
     Tests  10 passed (10)
     ```
3. Control Plane Database Verification (`mocter-core-pg-portal-1` / `db-portal`):
   - Command: `docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.id, c.slug, c.lifecycle_status, cr.cell_id, u.id as user_id, u.email, u.identity_location, (u.password_hash IS NULL) as hash_cleared, (u.password_updated_at IS NULL) as updated_cleared FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id LEFT JOIN admin.client_routing cr ON c.id = cr.client_id WHERE c.slug = 'synergia-market';"`
   - Output:
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
4. Cell Data Plane Verification (`mocter-cell-01-pg-cell-1` / `pg-cell-01`):
   - `admin.users`:
     - Row exists: `id = '01a1bc84-cbec-7a2c-9efe-3a3f55284113'`, `client_id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, `email = 'synergiamarket25@gmail.com'`, `has_hash = t` (Argon2id hash), `status = 'active'`.
   - `admin.tenant_users`:
     - Row exists: `id = '01a1bdd2-116d-7c5e-adcb-f95c0e640313'`, `client_id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, `user_id = '01a1bc84-cbec-7a2c-9efe-3a3f55284113'`, `role = 'tenant_owner'`, `status = 'active'`.
   - `admin.tenant_labels`:
     - 4 reserved lead labels exist: `lead-frio` (#64748B), `lead-tibio` (#F59E0B), `lead-caliente` (#EF4444), `compra-realizada` (#10B981), all with `origin = 'mocter_default'` and `state = 'active'`.
   - `admin.client_business_info`:
     - Row exists: `client_id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, `payment_methods = '["transferencia", "contraentrega"]'`, `shipping_policy = '{"freeShipping": false, "defaultCostCents": 0}'`, `bot_preset = 'natural_rhythm'`.

### 1.3 Test Suite & Build Observations
- Vitest test suite (`corepack pnpm --filter @mocter/domain test`):
  ```
  Test Files  72 passed (72)
       Tests  804 passed | 1 skipped (805)
    Duration  104.48s
  ```
  (1 skipped test is the live integration test which executes when `RUN_LIVE_RECONCILIATION=true` is set).
- TypeScript compilation (`corepack pnpm --filter @mocter/domain build`):
  ```
  $ tsc
  Exited with code 0.
  ```
- Service restart and healthcheck per Rule 4.18:
  - Containers `mocter-core-admin-portal-1` and `mocter-core-web-portal-1` restarted via `docker restart`.
  - Admin portal responded with `HTTP/1.1 307 Temporary Redirect` (redirect to login) and compiled `/admin/conversations` with `HTTP 200`.
  - Web portal responded with `HTTP 200` on `http://localhost:3001/es/login`.

---

## 2. Logic Chain

1. **Cell Pool Isolation & Transaction Safety**: Per DAT-001 §3.6.2 and CEL-001, operational data plane access must route through PgBouncer in transaction mode without named prepared statements. `CellDatabasePoolManager` configures `postgres(url, { prepare: false })` and decrypts credentials in-memory via `CellSecretsCryptoService`. In `withTenantCellTransaction`, `SELECT set_config('app.current_client_id', clientId, true)` enforces local session RLS boundaries.
2. **Strict RLS Enforcement**: When `mocter_app` was a superuser, PostgreSQL bypassed RLS policies. By creating a dedicated `mocter_app` role with `NOSUPERUSER NOBYPASSRLS`, PostgreSQL enforces `FORCE ROW LEVEL SECURITY` on all tenant tables, rejecting queries without a valid tenant context.
3. **Repository Rewiring**: Repositories `DrizzleCellAuthRepository`, `DrizzleCrmRepository`, and `DrizzleOrdersRepository` previously called `getDb()`, hitting `db-portal`. They now delegate to `async (cellId) => getCellDb(cellId)`, dynamically resolving the cell database pool for the requested cell.
4. **Service Boundary Splitting**: In `tenant-products-and-media.service.ts` and `tenant-contacts-and-users.service.ts`, quota consumption limits must be checked against the Control Plane (`portalDb = getDb()`), while table mutations (`products`, `product_media`, `contacts`, `tenant_users`) must be written to the assigned Cell Data Plane (`cellTxRunner = withTenantCellTransaction`).
5. **Data Plane Materialization**: When a tenant is created or reconciled, `provisionTenantInCellDataPlane` writes the baseline operational schema to `pg-cell-01`. Because Synergia Market was pre-existing with credentials in `db-portal`, `reconcileProvisionedTenantsInCells` safely promoted the Argon2id hash to `admin.users` in `pg-cell-01`, cleared the hash in `db-portal` (`password_hash = NULL`, `password_updated_at = NULL`), set `users.identity_location = assignedCell.id`, and aligned `clients.lifecycle_status = 'alta'` to direct the merchant to the onboarding sequence.
6. **Split Identity Password Reset**: In `auth.service.ts`, when a user whose `identity_location !== 'router'` resets a password, the Argon2id hash is persisted directly to the cell database (`updatePasswordHashInCell`), while the token in `db-portal` is consumed with `newPasswordHash = null`, ensuring credentials never reside in the Control Plane once promoted.

---

## 3. Caveats

- Topologies other than `local_compose` (e.g. `remote_vps`) were validated via unit tests and mock configuration; live network verification was performed exclusively against the local compose topology (`pg-cell-01` and `pgbouncer-cell-01`).
- The live reconciliation integration test in `cell-client.test.ts` is guarded with `describe.runIf(Boolean(process.env.RUN_LIVE_RECONCILIATION))` so that unit tests running in containerless CI/CD environments continue to execute hermetically without requiring live PostgreSQL services.

---

## 4. Conclusion

Milestone 1 is completely implemented, verified, and operational:
1. Physical cell data plane isolation is active with strict RLS enforcement (`NOSUPERUSER NOBYPASSRLS`).
2. PgBouncer transaction pooling operates with `prepare: false` and transactional client context injection.
3. Repositories and domain services properly separate Control Plane quotas from Cell Data Plane mutations.
4. Tenant provisioning and reconciliation routines have materialized `Synergia Market` in `pg-cell-01`.
5. Identity promotion and split-identity password resets preserve credential locality in the assigned cell data plane.
6. 100% of domain test suites pass (72/72 files, 804 tests), TypeScript compiles cleanly (exit 0), and both portal containers are verified healthy.

---

## 5. Verification Method

### 5.1 Run Automated Test Suite
```bash
corepack pnpm --filter @mocter/domain test
```
Expected: 72 test files pass, 804 tests pass, 1 skipped (live reconciliation integration test).

### 5.2 Run TypeScript Build
```bash
corepack pnpm --filter @mocter/domain build
```
Expected: `tsc` exits with code 0.

### 5.3 Verify Live Database State
Check `db-portal`:
```bash
docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.id, c.slug, c.lifecycle_status, cr.cell_id, u.id as user_id, u.email, u.identity_location, (u.password_hash IS NULL) as hash_cleared FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id LEFT JOIN admin.client_routing cr ON c.id = cr.client_id WHERE c.slug = 'synergia-market';"
```
Expected: `slug = synergia-market`, `lifecycle_status = alta`, `identity_location = 6ae5619b-7ca3-4764-baae-1b8950a8e534`, `hash_cleared = t`.

Check `pg-cell-01`:
```bash
docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT id, client_id, email, (password_hash IS NOT NULL) as has_hash, status FROM admin.users;"
docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT id, client_id, user_id, role, status FROM admin.tenant_users;"
docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT title, color, origin, state FROM admin.tenant_labels;"
docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT client_id, payment_methods, bot_preset FROM admin.client_business_info;"
```
Expected:
- `admin.users`: owner row with `synergiamarket25@gmail.com` and `has_hash = t`.
- `admin.tenant_users`: membership with `role = tenant_owner`.
- `admin.tenant_labels`: 4 reserved labels (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`).
- `admin.client_business_info`: commercial configuration for the tenant.

### 5.4 Invalidation Conditions
- Any query in `tenant-products-and-media.service.ts` or `tenant-contacts-and-users.service.ts` hitting `portalDb` for operational data (`products`, `contacts`, `tenant_users`) instead of `withTenantCellTransaction`.
- The role `mocter_app` regaining `SUPERUSER` or `BYPASSRLS` privileges in `pg-cell-01`.
- Any password reset for a cell-hosted user writing the password hash to `db-portal` instead of `pg-cell-XX`.
