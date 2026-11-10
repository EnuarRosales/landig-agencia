# Handoff Report — Milestone 1 (M1: Identity Promotion, Password Routing & Reconciliation)

**Agent**: Adversarial Challenger 2 (`challenger_m1_2`)  
**Mission**: Empirically stress-test identity promotion, password setup/reset, and reconciliation idempotency.  
**Explicit Verdict**: **APPROVE**  

---

## 1. Observation

### 1.1 Direct Database Observations
1. **Control Plane (`mocter-core-pg-portal-1` / `db-portal`) for Synergia Market:**
   - Command:
     ```bash
     docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.id, c.slug, c.lifecycle_status, cr.cell_id, u.id as user_id, u.email, u.identity_location, (u.password_hash IS NULL) as hash_null, (u.password_updated_at IS NULL) as updated_null FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id LEFT JOIN admin.client_routing cr ON c.id = cr.client_id WHERE c.slug = 'synergia-market';"
     ```
   - Verbatim Output:
     ```
     id: 01a1bc84-cc30-73b6-bc84-1f0cda5a9661
     slug: synergia-market
     lifecycle_status: alta
     cell_id: 6ae5619b-7ca3-4764-baae-1b8950a8e534
     user_id: 01a1bc84-cbec-7a2c-9efe-3a3f55284113
     email: synergiamarket25@gmail.com
     identity_location: 6ae5619b-7ca3-4764-baae-1b8950a8e534
     hash_null: t
     updated_null: t
     ```

2. **Cell Data Plane (`mocter-cell-01-pg-cell-1` / `pg-cell-01`) for Synergia Market:**
   - `admin.users`: Row exists with `id = 01a1bc84-cbec-7a2c-9efe-3a3f55284113`, `client_id = 01a1bc84-cc30-73b6-bc84-1f0cda5a9661`, `email = synergiamarket25@gmail.com`, `status = active`, and `password_hash = $argon2id$v=19$m=65536,t=3,p=1$l9Keel+xgAjkVpC/fBC42A$ICGxhYKjc8jR0z/OE9fQ/sJgTLODnTvaobisCAJRrlY`.
   - `admin.tenant_users`: Row exists with `id = 01a1bdd2-116d-7c5e-adcb-f95c0e640313`, `role = tenant_owner`, `status = active`.
   - `admin.tenant_labels`: Exactly 4 reserved default labels exist (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`), with `origin = mocter_default` and `state = active`.
   - `admin.client_business_info`: Row exists with `payment_methods = ["transferencia", "contraentrega"]`, `bot_preset = natural_rhythm`.

### 1.2 Adversarial Stress Test Suite Execution
Created and executed co-located test suite `packages/domain/src/db/cell-adversarial-m1.test.ts` containing 10 stress tests:
- Command:
  ```bash
  docker exec mocter-core-admin-portal-1 pnpm --filter @mocter/domain exec vitest run src/db/cell-adversarial-m1.test.ts
  ```
- Verbatim Result:
  ```
   ✓ src/db/cell-adversarial-m1.test.ts (10 tests) 1811ms
     ✓ Stress 1.1: Re-running reconcile 5 times consecutively causes no duplicates, regressions or errors (662ms)
     ✓ Stress 1.2: Concurrent rapid execution (3 parallel reconciliation calls) resolves cleanly without deadlocks
     ✓ Stress 2.1: Verify control plane db-portal fields for Synergia Market
     ✓ Stress 2.2: Verify pg-cell-01 tables and Argon2id hash for Synergia Market
     ✓ Stress 3.1: Password validation boundaries (length, ASCII specials, unicode, spaces)
     ✓ Stress 3.2: Purpose 'setup' rejected when native password already exists in cell
     ✓ Stress 3.3: Purpose 'reset' rejected when user has NO native password
     ✓ Stress 3.4: Expired reset token rejected
     ✓ Stress 3.5: Consumed token cannot be reused
     ✓ Stress 3.6: Live reset writes Argon2id to cell and keeps NULL in db-portal (721ms)

   Test Files  1 passed (1)
        Tests  10 passed (10)
  ```

### 1.3 E2E Test Suite Execution
Executed E2E Scenario A:
- Command:
  ```bash
  node tests/e2e/run.mjs --scenario=A
  ```
- Verbatim Result:
  ```
  📦 Suite: Scenario A · Physical Cell Isolation, RLS, and Identity Promotion
    ✅ [PASS] [Tier 1] A-T1.1: Physical cell database pg-cell-01 is reachable and healthy (373ms)
    ✅ [PASS] [Tier 1] A-T1.2: RLS blocks queries on pg-cell-01 when current_client_id is omitted (returns 0 rows) (293ms)
    ✅ [PASS] [Tier 1] A-T1.3: RLS allows reads on pg-cell-01 when valid client context is established (439ms)
    ✅ [PASS] [Tier 1] A-T1.4: Cell data plane schema contains all required multi-tenant tables (286ms)
    ✅ [PASS] [Tier 1] A-T1.5: Credential promotion stores Argon2id hash in pg-cell-01 and NULL in db-portal (655ms)
    ✅ [PASS] [Tier 2] A-T2.1: Setting empty string or invalid UUID as current_client_id fails safely (702ms)
    ✅ [PASS] [Tier 2] A-T2.2: Attempting cross-tenant insert on pg-cell-01 with mismatched client_id is rejected by RLS with-check (337ms)
    ✅ [PASS] [Tier 2] A-T2.3: Tenant password hash format complies with RFC Argon2id parameters (1ms)
    ✅ [PASS] [Tier 2] A-T2.4: Client routing entry maps tenant explicitly to active cell UUID (303ms)
    ✅ [PASS] [Tier 2] A-T2.5: Physical cell isolation prevents direct foreign-key references to db-portal (268ms)
    ✅ [PASS] [Tier 3] A-T3.1: Cross-tenant data isolation: Client A cannot see Client B products (308ms)
    ✅ [PASS] [Tier 3] A-T3.2: Cross-tenant data isolation: Client B cannot see Client A contacts (284ms)
    ✅ [PASS] [Tier 3] A-T3.3: Pairwise role check: tenant_owner vs tenant_agent membership validation in cell (289ms)
    ✅ [PASS] [Tier 4] A-T4.1: Synergia Market reconciliation idempotency in pg-cell-01 (786ms)

  Total Tests: 14 | Passed: 14 | Failed: 0 | Duration: 5.33s
  ```

### 1.4 Hermetic Domain Tests and Build
- Hermetic test suite command: `corepack pnpm --filter @mocter/domain test`
  - Output: `Test Files: 72 passed | 1 skipped (73). Tests: 804 passed | 11 skipped (815). Exit code 0.`
- TypeScript compilation: `corepack pnpm --filter @mocter/domain build`
  - Output: `$ tsc. Exited with code 0.`
- Container health checks:
  - `http://localhost:3003/api/health` -> HTTP 200 `{"status":"ok"}`
  - `http://localhost:3001/api/health` -> HTTP 200 `{"status":"healthy","database":{"status":"up"}}`

---

## 2. Logic Chain

1. **Reconciliation Idempotency (Obs 1.1, Obs 1.2 Stress 1.1 & 1.2):**
   - In `packages/domain/src/services/admin-dashboard.service.ts`, `provisionTenantInCellDataPlane` handles cell table seeding using `.onConflictDoUpdate` for `cellUsers` (updating only non-credential metadata: email, name, avatar, status) and `.onConflictDoNothing` for `cellTenantLabels` and `cellClientBusinessInfo`.
   - Running the reconciliation 5 times consecutively and 3 times in parallel resulted in zero duplicates, zero primary key collisions, and exactly 1 user row, 1 membership, 4 labels, and 1 business info record in `pg-cell-01`.
   - The Argon2id password hash was not overwritten with `NULL` even though `users.password_hash` in `db-portal` is `NULL`.

2. **Synergia Market Materialization (Obs 1.1, Obs 1.2 Stress 2.1 & 2.2):**
   - The user record in `db-portal` has `identity_location = 6ae5619b-7ca3-4764-baae-1b8950a8e534` (cell UUID), `password_hash = NULL`, and `password_updated_at = NULL`.
   - The merchant record in `pg-cell-01` has the full Argon2id hash (`$argon2id$v=19$m=65536,t=3,p=1$...`) and active status.
   - The client record in `db-portal` has `lifecycle_status = 'alta'`, aligning with the requirement to route the merchant into the onboarding flow.

3. **Split Identity Credential Locality (Obs 1.2 Stress 3.6):**
   - In `AuthService.resetPassword`, when `user.identityLocation !== 'router'`, the Argon2id hash is written directly to the target cell via `cellAuthRepo.updatePasswordHashInCell`.
   - The control plane token in `db-portal` is consumed with `newPasswordHash = null`, satisfying the database check constraint `((password_hash IS NULL) = (password_updated_at IS NULL))`.
   - A live test resetting a cell user's password confirmed that the new Argon2id hash is saved in `pg-cell-01`, cryptographically verified with `verifyPassword`, while `db-portal` strictly retains `password_hash = NULL`.

4. **Security State Machine Enforcement (Obs 1.2 Stress 3.1 - 3.5):**
   - Tokens with `purpose: "setup"` are rejected on accounts that already have native passwords in cell (`PASSWORD_ALREADY_EXISTS`).
   - Tokens with `purpose: "reset"` are rejected on passwordless accounts (`NO_NATIVE_PASSWORD`).
   - Expired and consumed tokens are deterministically rejected with `TOKEN_EXPIRED` and `TOKEN_ALREADY_USED`.
   - Passwords with fewer than 7 chars or greater than 128 chars, or lacking uppercase, digits, or ASCII special characters, are strictly rejected.

5. **Regressions & E2E Verification (Obs 1.3, Obs 1.4):**
   - E2E Scenario A passed 14/14 tests in 5.33 seconds.
   - 100% of hermetic `@mocter/domain` tests pass (804 tests), TypeScript compiles with zero errors (exit code 0), and both portal containers are verified healthy.

---

## 3. Caveats

- Live integration tests against `pg-cell-01` and `pgbouncer-cell-01` require the Docker container environment (`docker compose`) running locally. For hermetic CI environments without Docker, tests are guarded with `describe.runIf(Boolean(process.env.DATABASE_URL || process.env.RUN_LIVE_RECONCILIATION))`.
- No other caveats.

---

## 4. Conclusion

Milestone 1 satisfies all functional, architectural, security, and idempotency criteria defined in `ORIGINAL_REQUEST.md`, `PROJECT.md` (Features 1 through 8), and `TEST_READY.md`.

Explicit Verdict: **APPROVE**

---

## 5. Verification Method

To independently reproduce the empirical verification:

```bash
# 1. Run live adversarial stress test suite in admin portal container (10 tests)
docker exec mocter-core-admin-portal-1 pnpm --filter @mocter/domain exec vitest run src/db/cell-adversarial-m1.test.ts

# 2. Run E2E Scenario A test suite (14 tests)
node tests/e2e/run.mjs --scenario=A

# 3. Run hermetic domain tests and TypeScript build
corepack pnpm --filter @mocter/domain test
corepack pnpm --filter @mocter/domain build

# 4. Inspect Synergia Market state directly in databases
docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT slug, lifecycle_status, (password_hash IS NULL) as hash_cleared FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id WHERE c.slug = 'synergia-market';"
docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT email, (password_hash IS NOT NULL) as has_hash, status FROM admin.users;"
```

### Invalidation Conditions:
- Any run of `reconcileProvisionedTenantsInCells` overwriting `admin.users.password_hash` in `pg-cell-01` with `NULL`.
- Any password reset for a cell-hosted merchant writing a password hash to `db-portal`.
- Any duplicate row created in `admin.users`, `admin.tenant_users`, or `admin.tenant_labels` on repeated reconciliation.
