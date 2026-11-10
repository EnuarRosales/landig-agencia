# Handoff Report — Adversarial Challenger 1 (Milestone M1)

**Verdict**: `APPROVE`

---

## 1. Observation

### 1.1 Direct Adversarial Stress Testing Execution
An empirical adversarial test suite was authored at `tests/adversarial/m1-cell-isolation-stress.mjs` and executed both from the host runtime and within the container environment (`mocter-core-admin-portal-1`).

Command executed (Host):
```bash
node tests/adversarial/m1-cell-isolation-stress.mjs
```
Command executed (Container):
```bash
docker exec -e CELL_PGBOUNCER_URL=postgresql://mocter_app:63374ac00e284b51c46eb584d652f31d6b9346a16ff5a5f8812cb8b773f415ab@host.docker.internal:6432/pg-cell-01 mocter-core-admin-portal-1 node tests/adversarial/m1-cell-isolation-stress.mjs
```

Verbatim Output (Container execution):
```
=======================================================
   ADVERSARIAL CHALLENGER — M1 EMPIRICAL STRESS SUITE   
=======================================================

📦 Preparing Seed Fixtures in pg-cell-01 via PgBouncer...
   Seed fixtures ready.

🧪 Suite 1: Cross-Tenant Data Leakage & RLS Enforcement Matrix
  ✅ [PASS] ADV-1.1: Tenant Alpha cannot read Tenant Beta products by explicit client_id (97ms)
  ✅ [PASS] ADV-1.2: Tenant Alpha cannot read Tenant Beta products by direct product ID (417ms)
  ✅ [PASS] ADV-1.3: Tenant Alpha unscoped SELECT returns ONLY Alpha products (zero leakage) (367ms)
  ✅ [PASS] ADV-1.4: Subquery / CTE attack cannot penetrate RLS boundary to read Beta products (220ms)
  ✅ [PASS] ADV-1.5: Cross-tenant UPDATE is strictly rejected (affects 0 rows) (178ms)
  ✅ [PASS] ADV-1.6: Cross-tenant DELETE is strictly rejected (affects 0 rows) (88ms)
  ✅ [PASS] ADV-1.7: Cross-tenant INSERT is blocked by RLS WITH CHECK policy (50ms)
  ✅ [PASS] ADV-1.8: Cross-tenant Contacts and Users isolation holds symmetrically (35ms)

🧪 Suite 2: Omitted, Empty, and Malformed Tenant Context Attacks
  ✅ [PASS] ADV-2.1: Transaction without setting app.current_client_id returns 0 rows across all tables (47ms)
  ✅ [PASS] ADV-2.2: Omitted context INSERT throws RLS violation (34ms)
  ✅ [PASS] ADV-2.3: Setting empty string '' evaluates to NULL and returns 0 rows (42ms)
  ✅ [PASS] ADV-2.4: Setting non-existent UUID returns 0 rows safely (17ms)
  ✅ [PASS] ADV-2.5: SQL injection attempt in context string throws UUID syntax error and leaks 0 rows (35ms)

🧪 Suite 3: PgBouncer Session State Contamination (Cross-Tx Bleed)
  ✅ [PASS] ADV-3.1: Alternating transactions on PgBouncer never bleed tenant context (204ms)

🧪 Suite 4: PgBouncer Transaction Pooling Stability Under High Concurrency
    Concurrency Results:
      Total: 100 | Success: 100 | Failed: 0
      Duration: 4309ms | Throughput: 23.2 tx/sec
      Error 42P05 (prepared statement already exists): 0
      Error 26000 (prepared statement does not exist): 0
      Other errors: 0
  ✅ [PASS] ADV-4.1: 100 concurrent transactions with parameter binding run without 42P05 or 26000 errors (4309ms)

🧪 Suite 5: Empirical Oracle — Demonstrating Failure Mode of prepare: true on PgBouncer
  ✅ [PASS] ADV-5.1: Negative Control: verify prepare: false is strictly required for PgBouncer (868ms)

🧪 Suite 6: Connection Pool Drainage and Reconnection Resilience
  ✅ [PASS] ADV-6.1: Graceful pool closure drains active connections and allows clean re-initialization (1365ms)

🧹 Cleaning up test fixtures from pg-cell-01...
   Teardown complete.

=======================================================
               ADVERSARIAL STRESS SUMMARY              
=======================================================
  Total Adversarial Tests: 17
  Passed:                  17
  Failed:                  0
=======================================================
ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS RATE.
```

### 1.2 E2E Scenario A Execution
Command:
```bash
node tests/e2e/run.mjs --scenario=A
```
Verbatim Result:
```
=======================================================
       MOCTER CORE — END-TO-END VERIFICATION RUNNER     
=======================================================

📦 Suite: Scenario A · Physical Cell Isolation, RLS, and Identity Promotion
  ✅ [PASS] [Tier 1] A-T1.1: Physical cell database pg-cell-01 is reachable and healthy (1259ms)
  ✅ [PASS] [Tier 1] A-T1.2: RLS blocks queries on pg-cell-01 when current_client_id is omitted (returns 0 rows) (917ms)
  ✅ [PASS] [Tier 1] A-T1.3: RLS allows reads on pg-cell-01 when valid client context is established (836ms)
  ✅ [PASS] [Tier 1] A-T1.4: Cell data plane schema contains all required multi-tenant tables (609ms)
  ✅ [PASS] [Tier 1] A-T1.5: Credential promotion stores Argon2id hash in pg-cell-01 and NULL in db-portal (1220ms)
  ✅ [PASS] [Tier 2] A-T2.1: Setting empty string or invalid UUID as current_client_id fails safely (1533ms)
  ✅ [PASS] [Tier 2] A-T2.2: Attempting cross-tenant insert on pg-cell-01 with mismatched client_id is rejected by RLS with-check (825ms)
  ✅ [PASS] [Tier 2] A-T2.3: Tenant password hash format complies with RFC Argon2id parameters (0ms)
  ✅ [PASS] [Tier 2] A-T2.4: Client routing entry maps tenant explicitly to active cell UUID (1412ms)
  ✅ [PASS] [Tier 2] A-T2.5: Physical cell isolation prevents direct foreign-key references to db-portal (731ms)
  ✅ [PASS] [Tier 3] A-T3.1: Cross-tenant data isolation: Client A cannot see Client B products (614ms)
  ✅ [PASS] [Tier 3] A-T3.2: Cross-tenant data isolation: Client B cannot see Client A contacts (845ms)
  ✅ [PASS] [Tier 3] A-T3.3: Pairwise role check: tenant_owner vs tenant_agent membership validation in cell (796ms)
  ✅ [PASS] [Tier 4] A-T4.1: Synergia Market reconciliation idempotency in pg-cell-01 (1760ms)

=======================================================
                     TEST SUMMARY                       
=======================================================
  Total Tests:  14
  Passed:       14
  Failed:       0
  Skipped:      0
  Duration:     13.36s
=======================================================
```

### 1.3 Database Role Privileges and RLS Enforcement Observations
- Container `mocter-cell-01-pg-cell-1` (`pg-cell-01`):
  - Command: `docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "\du"`
  - Role `mocter_app` has no attributes (`NOSUPERUSER NOBYPASSRLS`).
  - Command: `docker exec mocter-cell-01-pg-cell-1 psql -U mocter_bootstrap -d pg-cell-01 -c "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'admin' AND c.relkind = 'r';"`
  - All 21 tables in schema `admin` have `relrowsecurity = t` and `relforcerowsecurity = t`.
- Live Reconciliation Test:
  - Command: `docker exec -e RUN_LIVE_RECONCILIATION=true mocter-core-admin-portal-1 pnpm --filter @mocter/domain exec vitest run src/db/cell-client.test.ts`
  - All 10 unit and integration tests passed (10/10).

---

## 2. Logic Chain

1. **Isolation Robustness (Observations 1.1, 1.3)**:
   - When `mocter_app` connects to `pg-cell-01`, it operates under `NOSUPERUSER NOBYPASSRLS` and `FORCE ROW LEVEL SECURITY`.
   - In `ADV-1.1` through `ADV-1.8`, all attempts by Tenant Alpha to view, modify, delete, or insert Tenant Beta records were completely repelled (0 rows read, 0 rows mutated, RLS WITH CHECK violation on insert).
   - In `ADV-2.1`, executing queries without `app.current_client_id` returned 0 rows across `products`, `contacts`, `users`, and `orders`.
   - In `ADV-2.5`, passing SQL injection vectors (`' OR '1'='1`) into the context parameter threw syntax errors from PostgreSQL's UUID parser and exposed 0 rows.
2. **PgBouncer Session Purity (Observation 1.1, ADV-3.1)**:
   - In PgBouncer transaction pooling mode, backend server connections are reused across clients.
   - If tenant context was set via session-level `SET app.current_client_id = ...`, subsequent transactions on the same backend connection could inherit the previous tenant's identity.
   - Because `withTenantCellTransaction` sets `SELECT set_config('app.current_client_id', clientId, true)` with `is_local = true` (`SET LOCAL`), PostgreSQL transaction boundary guarantees reset the GUC variable at `COMMIT`/`ROLLBACK`.
   - Empirical test `ADV-3.1` subjected PgBouncer to 30 sequential alternating transactions cycling between Alpha, Beta, and Unset contexts. Zero context bleeds occurred (`bleedCount = 0`).
3. **High-Concurrency Stability with `prepare: false` (Observation 1.1, ADV-4.1)**:
   - In PgBouncer transaction mode, prepared statements named by client drivers collide across backend connections, generating error `42P05` (`prepared statement already exists`) or `26000` (`prepared statement does not exist`).
   - In `ADV-4.1`, 100 concurrent transactions using parameter binding were executed simultaneously against PgBouncer.
   - The test completed with 100% success (100 / 100), 0 occurrences of error `42P05`, and 0 occurrences of error `26000`.
4. **Pool Drainage and Reconnection (Observation 1.1, ADV-6.1)**:
   - Closing a pool immediately ends open connections, and subsequent queries reconnect with freshly decrypted secrets without data plane inconsistency.

---

## 3. Caveats

- **Local Compose Environment**: Verification was executed against local Docker Compose infrastructure (`mocter-cell-01-pgbouncer-cell-1`, `mocter-cell-01-pg-cell-1`, `mocter-core-pg-portal-1`). Multi-host remote VPS network configurations were verified via configuration parsing and topology target resolver unit tests.
- **Failover / HA**: Automatic failover (e.g. PgBouncer multi-backend switchover or Patroni promotion) is out of scope for Milestone 1.

---

## 4. Conclusion

**Verdict: `APPROVE`**

The implementation of Milestone 1 (`TNT-001`, M1) is empirically robust, secure, and resilient:
1. Physical cell data plane isolation strictly prevents any cross-tenant data access or mutation.
2. Omission of tenant context fails safely by returning 0 rows under `FORCE ROW LEVEL SECURITY`.
3. PgBouncer transaction pooling operates cleanly without session state leakage.
4. `prepare: false` completely eliminates prepared statement collisions (`42P05` and `26000`) under high concurrency (100 concurrent transactions, 100% success).
5. All 14 tests in E2E Scenario A and all 10 tests in `cell-client.test.ts` pass with zero errors.

Milestone 1 is ready to be merged and unblocks subsequent milestones (M2: Authoritative Session Dispatch & Shell Bifurcation).

---

## 5. Verification Method

### 5.1 Run Adversarial Stress Suite
```bash
node tests/adversarial/m1-cell-isolation-stress.mjs
```
Expected: 17/17 tests pass with 0 failures and 0 prepared statement collisions.

Or run inside the container:
```bash
docker exec -e CELL_PGBOUNCER_URL=postgresql://mocter_app:63374ac00e284b51c46eb584d652f31d6b9346a16ff5a5f8812cb8b773f415ab@host.docker.internal:6432/pg-cell-01 mocter-core-admin-portal-1 node tests/adversarial/m1-cell-isolation-stress.mjs
```

### 5.2 Run E2E Scenario A
```bash
node tests/e2e/run.mjs --scenario=A
```
Expected: 14/14 tests pass.

### 5.3 Run Live Reconciliation Unit & Integration Tests
```bash
docker exec -e RUN_LIVE_RECONCILIATION=true mocter-core-admin-portal-1 pnpm --filter @mocter/domain exec vitest run src/db/cell-client.test.ts
```
Expected: 10/10 tests pass.

### 5.4 Invalidation Conditions
- Any query in `ADV-1.1` through `ADV-1.8` returning > 0 rows for cross-tenant operations.
- Any transaction without `app.current_client_id` returning > 0 rows on operational tables.
- Any occurrence of PostgreSQL error `42P05` or `26000` during concurrent traffic on PgBouncer.
- Any context bleed observed in `ADV-3.1`.
