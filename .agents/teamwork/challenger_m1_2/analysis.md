# Adversarial Analysis Report — Milestone 1 (M1: Identity Promotion, Password Routing & Reconciliation)

**Agent**: Adversarial Challenger 2 (`challenger_m1_2`)  
**Target Milestone**: M1 (Cell Isolation, PgBouncer Pooling, Identity Promotion, Password Setup/Reset, Synergia Market Reconciliation)  
**Verification Date**: 2026-11-09T01:39:00Z  

---

## 1. Executive Summary

Milestone 1 work was subjected to rigorous, zero-trust empirical adversarial stress testing against live PostgreSQL control plane (`db-portal`) and cell data plane (`pg-cell-01`) environments. All claims made by Worker M1 were verified independently through custom stress harnesses, concurrency bombardment, edge-case password permutations, security token state-machine testing, and live execution of E2E Scenario A.

**Overall risk assessment**: **LOW**  
All security boundaries (zero plaintext, Argon2id exclusively in cell, `password_hash = NULL` in portal, fail-closed token validation, strict RLS, and reconciliation idempotency) hold under severe stress conditions.

---

## 2. Adversarial Challenges & Hypotheses

### Challenge 1 (High Severity Hypothesis): Reconciliation Routine Non-Idempotency & Data Regressions
- **Assumption Challenged**: Re-executing `reconcileProvisionedTenantsInCells()` repeatedly or concurrently will corrupt cell tables, insert duplicate users/labels/memberships, cause unique constraint crashes, or overwrite the cell's Argon2id password hash with `NULL` (since `users.password_hash` in `db-portal` is `NULL` after initial promotion).
- **Attack Scenario**: 
  1. Trigger 5 consecutive full reconciliations on an already reconciled cell.
  2. Fire 3 concurrent reconciliation requests simultaneously (`Promise.all`) to induce race conditions during table insertion.
- **Blast Radius**: If broken, tenant data in cells would experience duplicated memberships, broken foreign keys, or wiped credentials preventing merchant logins.
- **Observed Empirical Result**: **PASSED (ROBUST)**.
  - In `packages/domain/src/services/admin-dashboard.service.ts` (lines 2650-2676), `cellUsers.insert` uses `.onConflictDoUpdate` targeting `[clientId, id]`, specifically omitting `passwordHash` and `passwordUpdatedAt` from the `set` clause. Thus, once promoted to the cell, subsequent reconciliations NEVER overwrite the cell password hash with `NULL`.
  - Membership in `cellTenantUsers` checks `existingMembership` before inserting.
  - `cellTenantLabels` uses `.onConflictDoNothing({ target: [clientId, title] })`, preventing label duplication.
  - Exactly 1 user, 1 membership, 4 labels, and 1 business info record exist after 5 consecutive runs and after 3 concurrent parallel runs.

### Challenge 2 (Critical Severity Hypothesis): Split Identity Credential Leakage to Control Plane
- **Assumption Challenged**: When a cell-hosted merchant resets or sets up their password via `AuthService.resetPassword`, the new Argon2id hash might leak into `db-portal` `admin.users` or leave orphaned plaintext/hashes in transit.
- **Attack Scenario**:
  1. Provision a cell-routed merchant user (`identity_location = cellId`, `active_client_id = clientId`).
  2. Issue a valid `purpose: "reset"` token in `db-portal`.
  3. Execute `authService.resetPassword` with a new high-entropy password (`NewCellP@ssw0rd2026!#$`).
  4. Query `db-portal` `admin.users` and `pg-cell-01` `admin.users`.
- **Blast Radius**: Credential centralization in control plane would violate physical isolation contracts (TNT-RF-01.5, DAT-001).
- **Observed Empirical Result**: **PASSED (ROBUST)**.
  - In `db-portal`: `users.password_hash` remained strictly `NULL`, and `users.password_updated_at` remained strictly `NULL`.
  - In `pg-cell-01`: `cellUsers.password_hash` was updated to the new Argon2id hash (`$argon2id$v=19$...`).
  - Cryptographic verification via `verifyPassword` succeeded against the cell hash and rejected the old password.
  - Reset token in `db-portal` was consumed (`consumed_at IS NOT NULL`).

### Challenge 3 (Medium Severity Hypothesis): Setup vs Reset Token State-Machine Bypass
- **Assumption Challenged**: A malicious actor or misconfigured client could use a `purpose: "setup"` token on an existing password-protected cell account to overwrite the password without providing the current password, or use a `purpose: "reset"` token on an account that has no password.
- **Attack Scenario**:
  1. Issue a `setup` token for Synergia Market (which already has a native password in `pg-cell-01`).
  2. Attempt to invoke `authService.resetPassword`.
  3. Issue a `reset` token for a federated/passwordless account and attempt `authService.resetPassword`.
  4. Test expired and already consumed tokens.
- **Blast Radius**: Account takeover or state desynchronization.
- **Observed Empirical Result**: **PASSED (ROBUST)**.
  - Attempting `setup` on Synergia Market failed immediately with `PASSWORD_ALREADY_EXISTS` (`"La cuenta ya cuenta con una contraseña establecida."`).
  - Attempting `reset` on a passwordless account failed immediately with `NO_NATIVE_PASSWORD` (`"La cuenta no cuenta con una contraseña nativa previa para recuperar."`).
  - Expired tokens failed with `TOKEN_EXPIRED`.
  - Re-using a consumed token failed with `TOKEN_ALREADY_USED`.

### Challenge 4 (Low/Medium Severity Hypothesis): Password Boundary & Character Encoding Vulnerabilities
- **Assumption Challenged**: Non-ASCII characters (e.g. Spanish accents `á, é, í, ó, ú, ñ`), edge-case lengths (6, 7, 128, 129 chars), or passwords with internal whitespace could bypass validation or fail Argon2id hashing.
- **Attack Scenario**: Test boundary vectors through both `validatePassword` and `authPasswordSchema`.
- **Observed Empirical Result**: **PASSED (ROBUST)**.
  - Length 6: rejected (`Too short (< 7 chars)`).
  - Length 7: accepted (exact minimum).
  - Length 128: accepted (exact maximum).
  - Length 129: rejected (`> 128 chars`).
  - Missing uppercase, digit, or ASCII special: rejected.
  - Spanish characters (`P@ssw0rdñáéíóú123`): accepted.
  - Complex ASCII punctuation: accepted.
  - Preserved whitespace (`P@ss w0rd 123!`): accepted.

---

## 3. Stress Test Results Matrix

| Test ID | Test Scenario | Expected Behavior | Actual Behavior | Status |
|---|---|---|---|---|
| **ST-01** | Re-run reconcile 5 times consecutively | No duplicates, zero constraint errors, Argon2id preserved in cell, NULL in portal | 5/5 runs completed with `ok: true`, exact counts preserved (1 user, 1 membership, 4 labels, 1 config) | **PASS** |
| **ST-02** | 3 concurrent parallel reconciliations | Concurrent transactions resolve without deadlocks or primary key collisions | All 3 resolved with `ok: true`, table counts unchanged | **PASS** |
| **ST-03** | Synergia Market control plane check (`db-portal`) | `identity_location = 6ae5619b-7ca3-4764-baae-1b8950a8e534`, `password_hash IS NULL`, `lifecycle_status = 'alta'` | Matched exact expectations | **PASS** |
| **ST-04** | Synergia Market cell data plane check (`pg-cell-01`) | `admin.users` has owner row with Argon2id hash; `admin.tenant_users` has `tenant_owner`; `admin.tenant_labels` has 4 reserved labels | Exact records verified in `pg-cell-01` | **PASS** |
| **ST-05** | Password validation boundaries | Rejection of <7 and >128 chars; acceptance of valid 7-128 chars with required complexity | 11/11 boundary cases passed | **PASS** |
| **ST-06** | Setup token on cell user with existing password | Return `ok: false`, `code: PASSWORD_ALREADY_EXISTS` | Rejected with `PASSWORD_ALREADY_EXISTS` | **PASS** |
| **ST-07** | Reset token on user with no native password | Return `ok: false`, `code: NO_NATIVE_PASSWORD` | Rejected with `NO_NATIVE_PASSWORD` | **PASS** |
| **ST-08** | Expired password reset token | Return `ok: false`, `code: TOKEN_EXPIRED` | Rejected with `TOKEN_EXPIRED` | **PASS** |
| **ST-09** | Re-use of consumed password reset token | Return `ok: false`, `code: TOKEN_ALREADY_USED` | Rejected with `TOKEN_ALREADY_USED` | **PASS** |
| **ST-10** | Live split-identity password reset on cell user | Argon2id written to `pg-cell-01`; `password_hash` remains NULL in `db-portal`; new password verifies | New Argon2id hash verified in cell; portal hash remained NULL; token consumed | **PASS** |
| **E2E-A** | Full E2E Scenario A suite (`tests/e2e/run.mjs --scenario=A`) | 14/14 tests pass across Tiers 1-4 | 14 passed in 5.33s (0 failed, 0 skipped) | **PASS** |
| **PKG-D** | Full `@mocter/domain` test suite (`corepack pnpm test`) | Zero failures across all domain suites | 72 passed, 1 skipped (live test guard), 804 tests passed | **PASS** |
| **BLD-D** | TypeScript compilation (`corepack pnpm build`) | Zero compilation errors | `tsc` exit code 0 | **PASS** |
| **HLT-01**| Container health check on `/api/health` | HTTP 200 on port 3003 (admin) and port 3001 (web) | Both containers returned HTTP 200 OK | **PASS** |

---

## 4. Unchallenged Areas

- **Topologies other than `local_compose`**: Remote VPS SSH tunneling and remote PgBouncer topologies were validated via unit test mocks in `cell-client.test.ts`. Live network validation was performed against the active compose cluster (`mocter-cell-01-pgbouncer-cell-1` and `mocter-cell-01-pg-cell-1`).
- **Milestones 2 through 6**: Scope strictly bounded to Milestone 1 per orchestrator dispatch. Session routing and layout bifurcation are scheduled for Milestone 2.

---

## 5. Conclusion & Recommendation

The Milestone 1 implementation is exceptionally solid. The code exhibits high architectural discipline, rigorous separation between control plane and cell data planes, resilient error handling, strict RLS policy compliance, and total idempotency under repeated and concurrent execution.

**Verdict**: **APPROVE**
