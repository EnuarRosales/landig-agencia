# Milestone 1 Independent Review & Adversarial Stress-Test Report

**Reviewer**: Reviewer 2 (`reviewer_m1_2`)  
**Scope**: Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion (M1)  
**Date**: 2026-11-09T01:21:00Z  
**Verdict**: **APPROVE**

---

## 1. Review Summary

The implementation of Milestone 1 (TNT-001 M1) has been independently verified through source code inspection, static analysis, unit test suite execution, end-to-end integration test execution, and live database probing against the running Docker containers (`mocter-core-pg-portal-1`, `mocter-cell-01-pg-cell-1`, `mocter-cell-01-pgbouncer-cell-1`).

All interface contracts, security invariants, database states, and architectural constraints are strictly satisfied. No integrity violations, facade implementations, hardcoded shortcuts, or test bypasses were detected.

---

## 2. Verified Claims & Evidence Chain

### 2.1 Physical RLS Isolation & PgBouncer Transaction Pooling
- **`prepare: false` Verification**: Verified in `packages/domain/src/db/cell-client.ts` line 365. Configured directly on the `postgres-js` client instance factory. This guarantees full compatibility with PgBouncer running in `POOL_MODE=transaction` (preventing prepared statement collision across pooled backend connections).
- **Transaction-local RLS Configuration**: In `withTenantCellTransaction` (`cell-client.ts:253`) and `findUserCredentialsInCell` (`drizzle-cell-auth.repository.ts:68`), the context parameter is injected via `SELECT set_config('app.current_client_id', clientId, true)`. The third argument `is_local = true` ensures the configuration parameter is scoped strictly to the current transaction.
- **Verification via Live PgBouncer Probing**:
  - Connected directly through PgBouncer on port 6432 with `mocter_app`.
  - Executed `BEGIN; SELECT set_config('app.current_client_id', '01a1bc84-cc30-73b6-bc84-1f0cda5a9661', true); SELECT count(*) FROM admin.users; COMMIT;` -> returned `count = 1`.
  - Immediately executed `SELECT current_setting('app.current_client_id', true);` on the next query -> returned empty string (`""`), proving zero configuration leakage between transactions.
- **`mocter_app` Role Privileges in `pg-cell-01`**:
  - Query: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'mocter_app';`
  - Output: `rolsuper: false`, `rolbypassrls: false`.
  - All 21 operational tables in schema `admin` have `relrowsecurity = true` AND `relforcerowsecurity = true` (`FORCE ROW LEVEL SECURITY`).
  - Executing `SELECT count(*) FROM admin.users;` as `mocter_app` without setting `app.current_client_id` returned `0` rows.
  - Attempting to insert a row as `mocter_app` without client context failed with `ERROR: new row violates row-level security policy for table "users"`.
  - Attempting privilege escalation via `SET ROLE mocter_bootstrap;` failed with `ERROR: permission denied to set role "mocter_bootstrap"`.

### 2.2 Credential Isolation & Identity Promotion
- **Cell Data Plane (`pg-cell-01` / `admin.users`)**:
  - Verified live via `psql`:
    `SELECT id, client_id, email, (password_hash IS NOT NULL) as has_hash, (password_hash LIKE '$argon2id$%') as is_argon2id, status FROM admin.users;`
    Output:
    - `id`: `01a1bc84-cbec-7a2c-9efe-3a3f55284113`
    - `client_id`: `01a1bc84-cc30-73b6-bc84-1f0cda5a9661`
    - `email`: `synergiamarket25@gmail.com`
    - `has_hash`: `true`
    - `is_argon2id`: `true`
- **Control Plane (`db-portal` / `admin.users`)**:
  - Verified live via `psql`:
    `SELECT id, email, identity_location, (password_hash IS NULL) as hash_cleared, (password_updated_at IS NULL) as updated_cleared FROM admin.users WHERE email = 'synergiamarket25@gmail.com';`
    Output:
    - `identity_location`: `6ae5619b-7ca3-4764-baae-1b8950a8e534` (cell-01 UUID)
    - `hash_cleared`: `true` (`password_hash` IS NULL)
    - `updated_cleared`: `true` (`password_updated_at` IS NULL)
  - Both fields are `NULL`, respecting the check constraint `((password_hash IS NULL) = (password_updated_at IS NULL))`.
- **Split-Identity Password Reset**:
  - Verified in `packages/domain/src/services/auth.service.ts:2204-2230`: When `isCellUser` is true (`user.identityLocation !== 'router'`), `AuthService.resetPassword` writes the new Argon2id hash directly to `pg-cell-XX` via `cellAuthRepo.updatePasswordHashInCell`, and consumes the token in `db-portal` via `authRepo.consumePasswordResetToken(tokenRecord.id, user.id, null, ...)` with `newPasswordHash = null`.

### 2.3 Synergia Market Tenant Reconciliation
- **Control Plane State**:
  - `admin.clients.slug`: `synergia-market`
  - `admin.clients.lifecycle_status`: `alta` (aligned to 'alta' because 0 products exist in cell, directing to onboarding wizard)
  - `admin.client_routing`: maps `clientId = 01a1bc84-cc30-73b6-bc84-1f0cda5a9661` to `cellId = 6ae5619b-7ca3-4764-baae-1b8950a8e534` (`routing_status = 'active'`).
- **Cell Data Plane State**:
  - `admin.users`: owner record materialized with Argon2id hash.
  - `admin.tenant_users`: membership with `role = 'tenant_owner'` and `status = 'active'`.
  - `admin.tenant_labels`: 4 reserved lead labels (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`) present with `origin = 'mocter_default'` and `state = 'active'`.
  - `admin.client_business_info`: commercial defaults (`paymentMethods: ["transferencia", "contraentrega"]`, `botPreset: "natural_rhythm"`).

### 2.4 Test Suite & Compilation Verification
1. **Domain Unit Tests**:
   - Command: `corepack pnpm --filter @mocter/domain test`
   - Result: **72 passed (72 files)**, **804 passed | 1 skipped** (the skipped test is guarded with `RUN_LIVE_RECONCILIATION`), Duration: 231s. Zero test failures.
2. **Dedicated Cell Client Tests**:
   - Command: `corepack pnpm --filter @mocter/domain exec vitest run src/db/cell-client.test.ts`
   - Result: **1 passed (1 file)**, **9 passed | 1 skipped (10 tests)**.
3. **E2E Scenario A Tests**:
   - Command: `node tests/e2e/run.mjs --scenario=A`
   - Result: **14 passed (14 tests)**, 0 failed, Duration: 32.22s.
4. **TypeScript Build**:
   - Command: `corepack pnpm --filter @mocter/domain build` (`tsc`)
   - Result: Exit code 0, 0 compilation errors.

### 2.5 Compliance with `.agents/AGENTS.md`
- **TSDoc in Neutral Spanish**: All new and modified classes, functions, interfaces, and methods in `cell-client.ts`, `admin-dashboard.service.ts`, `drizzle-cell-auth.repository.ts`, etc., are documented with Spanish TSDoc explaining parameters, return values, and architectural requirements.
- **No `console.*`**: Verified via regex search across `packages/domain/src/db/cell-client.ts` and related domain files. Zero matches. All logging uses `appLogger` (`LogEvent` structured logging).
- **No Deprecated Code**: No deprecated APIs or functions were used.
- **No Hardcoded Ports or Credentials**: Connection strings are constructed dynamically by reading the `cells` table, decrypting credentials in-memory via AES-256-GCM (`CellSecretsCryptoService`), and mapping topology types.

---

## 3. Adversarial Review & Attack Surface Analysis

### 3.1 Challenge: SQL Injection via Client ID in `set_config`
- **Attack Scenario**: An attacker passes a malicious `clientId` string (e.g. `' OR '1'='1`) to `withTenantCellTransaction` to break out of RLS or execute arbitrary SQL.
- **Defense Verified**:
  1. `UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` validates `clientId` before any database operation. If invalid, it immediately throws `CellPoolError` and halts.
  2. The SQL statement is parameterized using Drizzle's `sql` tagged template literal: `sql`SELECT set_config('app.current_client_id', ${clientId}, true)``.
- **Status**: **PASS (Defended)**.

### 3.2 Challenge: Connection Pool Starvation & Concurrent Initialization (Thundering Herd)
- **Attack Scenario**: Multiple incoming tenant requests simultaneously request connections for a cell whose pool is not yet initialized, causing multiple parallel connection attempts and socket exhaustion.
- **Defense Verified**: `CellDatabasePoolManager.getCellDb` uses a `pendingConnections` promise map. If an initialization is already in flight for a given `cellIdOrCode`, subsequent callers receive the identical pending promise, ensuring exactly one client factory instantiation per cell.
- **Status**: **PASS (Defended)**.

### 3.3 Challenge: Connection Failure & Automatic Eviction
- **Attack Scenario**: A PgBouncer node resets or terminates backend connections (`ECONNRESET`, `connection closed`), leaving dead connections in `this.pools`.
- **Defense Verified**: `withTenantCellTransaction` catches errors, evaluates `isConnectivityError(error)`, and automatically calls `this.closeCellPool(cellId)` to evict the broken pool from memory. Subsequent requests re-initialize a fresh client.
- **Status**: **PASS (Defended)**.

### 3.4 Challenge: Transaction Rollback Integrity
- **Attack Scenario**: A tenant query inside `withTenantCellTransaction` fails midway through execution. Does the transaction leave uncommitted or corrupted data?
- **Defense Verified**: `cellDb.transaction` wraps the callback in a database-level transaction. Any thrown exception causes an immediate PostgreSQL `ROLLBACK`. Furthermore, because `set_config` was executed with `is_local = true`, the session parameter `app.current_client_id` automatically resets upon rollback.
- **Status**: **PASS (Defended)**.

---

## 4. Integrity Inspection

| Integrity Check | Result | Evidence |
|-----------------|--------|----------|
| Hardcoded test outputs | NONE | Source code executes real queries and dynamic validations |
| Facade implementations | NONE | Full implementation of `CellDatabasePoolManager`, `postgres-js` pooling, AES-256-GCM decryption, and Drizzle repositories |
| Shortcuts bypassing task | NONE | Clean boundary between Control Plane (`portalDb`) and Cell Data Plane (`cellTxRunner`) across all services |
| Fabricated verification logs | NONE | Independent command execution in this session confirmed all outputs verbatim |
| Self-certifying claims | NONE | Verified independently using `psql`, `vitest`, and `run.mjs` |

---

## 5. Conclusion & Recommendation

Milestone 1 satisfies all requirements set forth in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_READY.md`. The physical cell data plane isolation is active and robust, RLS is strictly enforced, credentials reside exclusively in the cell, and existing tenant reconciliation is complete.

**Final Verdict**: **APPROVE**
