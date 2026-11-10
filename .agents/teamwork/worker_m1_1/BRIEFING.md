# BRIEFING — 2026-11-09T00:25:00Z

## Mission
Implement Milestone 1 (M1: Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion — Features 1 through 8) in packages/domain, ensuring full genuine logic, no hardcoding, strict RLS enforcement, dynamic cell database pooling, repository/service rewiring to cell data plane, tenant provisioning, RBAC correlation, and identity promotion on password reset.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: d:\3. Develoment\mocter-system\mocter-core
- State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\worker_m1_1
- Original parent: d9dd6187-8097-406e-a649-0b6a842d2eff
- Milestone: M1 - Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion

## 🔒 Key Constraints
- EXCLUSIVE WRITE OWNERSHIP:
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
- DO NOT CHEAT: All implementations genuine, real database queries, real RLS, no fake mock results or hardcoded strings.
- Follow .agents/AGENTS.md: TSDoc in neutral Spanish, no console.*, no deprecated code, no hardcoding.

## Current Parent
- Conversation ID: d9dd6187-8097-406e-a649-0b6a842d2eff
- Updated: 2026-11-09T00:25:00Z

## Task Summary
- **What to build**: Features 1-8 of TNT-001 (M1): CellDatabasePoolManager, RLS permission fix on mocter_app, cell-aware repositories (cell-auth, crm, orders), cell-isolated services (products, contacts, admin dashboard provisioning & reconciliation), RBAC cell formatting & correlation, and split-identity password reset promotion.
- **Success criteria**: 100% tests pass on `@mocter/domain`, Synergia Market provisioned in `pg-cell-01`, cell queries execute on cell DB with proper `set_config`.
- **Interface contracts**: TNT-001 specs, CEL-001, DAT-001.

## Change Tracker
- **Files modified**:
  - `packages/domain/src/db/cell-client.ts`: New CellDatabasePoolManager with resolvePgBouncerTarget and withTenantCellTransaction
  - `packages/domain/src/db/cell-client.test.ts`: New unit & live integration tests for cell client pooling and reconciliation
  - `packages/domain/src/db/index.ts`: Re-export cell client utilities and types
  - `packages/domain/src/index.ts`: Re-export cell client interfaces and helpers
  - `packages/domain/src/repositories/drizzle-cell-auth.repository.ts`: Rewired to async (cellId) => getCellDb(cellId)
  - `packages/domain/src/repositories/drizzle-crm.repository.ts`: Rewired to async (cellId) => getCellDb(cellId)
  - `packages/domain/src/repositories/drizzle-orders.repository.ts`: Rewired to async (cellId) => getCellDb(cellId)
  - `packages/domain/src/services/tenant-products-and-media.service.ts`: Quota to portalDb, operational tables to cellTxRunner
  - `packages/domain/src/services/tenant-contacts-and-users.service.ts`: Quota to portalDb, contacts/memberships to cellTxRunner
  - `packages/domain/src/services/admin-dashboard.service.ts`: Tenant cell provisioning and live idempotent reconciliation
  - `packages/domain/src/services/rbac.service.ts`: Tenant owner/agent correlation and friendly cell code mapping
  - `packages/domain/src/services/auth.service.ts`: Split-identity password reset promotion to cell database
  - `packages/domain/src/repositories/auth.repository.interface.ts`: Support nullable newPasswordHash in consumePasswordResetToken
  - `packages/domain/src/repositories/drizzle-auth.repository.ts`: Support nullable newPasswordHash in consumePasswordResetToken
- **Build status**: Pass (`tsc` exit 0, vitest 72/72 suites passed, 804 passed, 1 skipped live integration test)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (100% pass, 804 tests passed, 0 failures; live reconciliation test verified against live DB)
- **Lint status**: Clean (tsc --noEmit clean)
- **Tests added/modified**: `cell-client.test.ts` (10 tests: 9 unit tests + 1 live reconciliation integration test)

## Loaded Skills
- None explicitly loaded.

## Artifact Index
- `DISPATCH.md` — assignment dispatch
- `BRIEFING.md` — situational awareness
- `progress.md` — heartbeat and progress tracker
- `handoff.md` — final completion report
