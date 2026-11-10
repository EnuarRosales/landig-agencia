# Dispatch for reviewer_m1_2
Role: Milestone 1 Independent Reviewer 2
Scope: Verify M1 interface contracts, robustness, and RLS security enforcement


## 2026-11-09T01:10:37Z

You are Reviewer 2 for Milestone 1 (M1: Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\reviewer_m1_2

MANDATORY FIRST STEP:
Read the user request file at:
d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md

Read project documents:
- Project specification: d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
- E2E Test Suite declaration: d:\3. Develoment\mocter-system\mocter-core\TEST_READY.md
- Worker M1 handoff report: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\worker_m1_1\handoff.md

Scope of Review:
Examine Milestone 1 implementation with a focus on interface contracts, security invariants, and database state:
1. Physical RLS isolation: Verify that `prepare: false` is configured for PgBouncer, `SELECT set_config('app.current_client_id', clientId, true)` is set transaction-locally, and `mocter_app` cannot bypass RLS.
2. Credential isolation: Verify that promoted tenant users have Argon2id hashes in `pg-cell-01` (`admin.users`) and `password_hash = NULL` with `password_updated_at = NULL` in `db-portal` (`admin.users`).
3. Synergia Market reconciliation: Verify database state in `db-portal` and `pg-cell-01` using `psql`.
4. Run unit tests: `pnpm.cmd --filter @mocter/domain test`
5. Run E2E tests: `node tests/e2e/run.mjs --scenario=A`
6. Verify code compliance with .agents/AGENTS.md (TSDoc in neutral Spanish, no console.*, no deprecated code).

Deliverables:
- Write `analysis.md` and `handoff.md` in your state folder (`d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\reviewer_m1_2\`).
- Your handoff MUST contain an explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
- Send a message to the orchestrator when completed with your verdict and findings summary.
