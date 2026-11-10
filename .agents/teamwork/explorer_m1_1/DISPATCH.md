# Dispatch for explorer_m1_1
Role: Milestone 1 Explorer — Pool & RLS
Scope: M1 Pool Manager, PgBouncer protocol, and RLS context injection


## 2026-11-09T00:11:30Z
You are an Explorer subagent for Milestone 1 (M1: Physical Cell Data Plane Isolation & Connection Pool).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_1

MANDATORY FIRST STEPS:
1. Read the user request file at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md
2. Read the project scope file at:
   d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
3. Read the previous survey report at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_survey_2\handoff.md

Scope and Responsibilities:
Investigate and design the technical implementation strategy for Features 1 & 2 of Milestone 1:
1. `CellDatabasePoolManager` in `packages/domain/src/db/cell-client.ts`:
   - Connection pool caching by cell ID.
   - Dynamic connection to PgBouncer (`mocter_app` user on port 6432 in local_compose / host.docker.internal).
   - In-memory secret decryption using `cellSecretsCryptoService` and `CELL_SECRETS_KEY`.
   - Mandatory `prepare: false` due to PgBouncer transaction pooling mode.
2. RLS Context Injection:
   - Helper function `withTenantCellTransaction<T>(clientId: string, callback: (tx: DrizzleCellDb) => Promise<T>): Promise<T>`
   - Executing `SELECT set_config('app.current_client_id', clientId, true)` (or `SET LOCAL app.current_client_id = ...`) inside the transaction before callback.
   - Verifying behavior under PostgreSQL `FORCE ROW LEVEL SECURITY`.
   - Error handling, connection cleanup, and pool shutdown methods.

Deliverables:
- Write `analysis.md` and `handoff.md` in your state folder (`d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_1\`).
- Recommend the exact implementation blueprint for the Worker.
- Note: You are read-only. Do NOT edit application source code.
- Send a message to the orchestrator when completed.
