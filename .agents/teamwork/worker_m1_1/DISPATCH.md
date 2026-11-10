## 2026-11-09T00:24:24Z

You are the Implementation Worker subagent for Milestone 1 (M1: Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion — Features 1 through 8).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\worker_m1_1

MANDATORY FIRST STEP:
Read the user request file at:
d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md

Read the project scope and specifications:
- d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
- docs/specs/tnt-001-entorno-operativo-inquilino/requirements.md, design.md, tasks.md
- .agents/AGENTS.md

MANDATORY BLUEPRINTS FROM EXPLORERS:
You MUST read and implement the exact blueprints designed by the M1 Explorers:
1. Features 1 & 2: `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_1\analysis.md` and `handoff.md`
2. Features 3, 4, 5: `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_2\analysis.md` and `handoff.md`
3. Features 6, 7, 8: `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_3\analysis.md` and `handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP (You own and may edit ONLY these files):
- `packages/domain/src/db/cell-client.ts` (NEW)
- `packages/domain/src/db/cell-client.test.ts` (NEW)
- `packages/domain/src/db/index.ts`
- `packages/domain/src/index.ts`
- `packages/domain/src/repositories/drizzle-cell-auth.repository.ts`
- `packages/domain/src/repositories/drizzle-crm.repository.ts`
- `packages/domain/src/repositories/drizzle-orders.repository.ts`
- `packages/domain/src/services/tenant-products-and-media.service.ts`
- `packages/domain/src/services/tenant-contacts-and-users.service.ts`
- `packages/domain/src/services/admin-dashboard.service.ts`
- `packages/domain/src/services/rbac.service.ts`
- `packages/domain/src/services/auth.service.ts`
- `packages/domain/src/repositories/auth.repository.interface.ts`
- `packages/domain/src/repositories/drizzle-auth.repository.ts`

TASKS TO EXECUTE:
1. Implement `packages/domain/src/db/cell-client.ts` with `CellDatabasePoolManager`, `resolvePgBouncerTarget`, `withTenantCellTransaction` enforcing `prepare: false` and `SELECT set_config('app.current_client_id', clientId, true)`. Export canonic helpers. Re-export in `db/index.ts` and `src/index.ts`. Write comprehensive unit tests in `cell-client.test.ts`.
2. Apply `ALTER ROLE mocter_app NOSUPERUSER NOBYPASSRLS;` in the local `mocter-cell-01-pg-cell-1` container to ensure strict RLS enforcement per DAT-001.
3. Update `drizzle-cell-auth.repository.ts`, `drizzle-crm.repository.ts`, and `drizzle-orders.repository.ts` to use `async (cellId) => getCellDb(cellId)` instead of `getDb()`.
4. Update `DrizzleTenantProductsRepository` and `DrizzleTenantContactsAndUsersRepository` to route quota queries to `portalDb = getDb()` and operational tables (`products`, `product_media`, `contacts`, `tenant_users`) to `cellTxRunner = withTenantCellTransaction`.
5. In `admin-dashboard.service.ts`:
   - Implement `provisionTenantInCellDataPlane(clientId, cellId, ownerUserId, clientData)` materializing `admin.users`, `admin.tenant_users` (`tenant_owner`), 4 reserved labels in `admin.tenant_labels`, and `admin.client_business_info`.
   - Update `createAdminTenant` to set `lifecycle_status = 'alta'` upon creation, update `users.identity_location = assignedCell.id`, and call `provisionTenantInCellDataPlane`.
   - Implement idempotent `reconcileProvisionedTenantsInCells()` to reconcile `Synergia Market` in `pg-cell-01`, set `identity_location = cellId`, clear `password_hash = NULL`, `password_updated_at = NULL` in `db-portal`, and set `lifecycle_status = 'alta'`. Run it to materialize Synergia Market in `pg-cell-01`.
6. In `rbac.service.ts`:
   - Update `fetchRbacOverview` to correlate `admin.users` with `clients.owner_user_id` and `active_client_id`, assigning `tenant_owner` / `tenant_agent`, updating role count, and formatting cell UUID as `cell-01`.
7. In `auth.service.ts` & `drizzle-auth.repository.ts`:
   - Update `resetPassword` and `consumePasswordResetToken` so that when a cell-hosted user (`identity_location !== 'router'`) sets/resets a password, the Argon2id hash is written to `pg-cell-XX` (`admin.users`) and cleared (`NULL`) in `db-portal`.
8. Run domain unit tests (`pnpm.cmd --filter @mocter/domain test`) and verify 100% pass.
9. Verify database state for Synergia Market in `pg-cell-01` via `psql` assertion.

Deliverables:
- Write your implementation log and test results in `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\worker_m1_1\progress.md` and `handoff.md`.
- Send a message to the orchestrator when completed with commands run, test output, and file diff summary.
