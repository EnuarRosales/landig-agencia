## 2026-11-09T00:11:37Z
You are an Explorer subagent for Milestone 1 (M1: Repository Delegation & Identity Promotion).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_2

MANDATORY FIRST STEPS:
1. Read the user request file at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md
2. Read the project scope file at:
   d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
3. Read the previous survey report at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_survey_2\handoff.md

Scope and Responsibilities:
Investigate and design the technical implementation strategy for Features 3, 4, and 5 of Milestone 1:
1. Updating cell repositories to delegate to `CellDatabasePoolManager`:
   - `packages/domain/src/repositories/drizzle-cell-auth.repository.ts`
   - `packages/domain/src/repositories/drizzle-crm.repository.ts`
   - `packages/domain/src/repositories/drizzle-orders.repository.ts`
   - `packages/domain/src/services/tenant-products-and-media.service.ts` (`DrizzleTenantProductsRepository`)
   - `packages/domain/src/services/tenant-contacts-and-users.service.ts`
   - Remove hardcoded `getDb()` defaults and inject cell connection provider or `withTenantCellTransaction`.
2. Cell-side Tenant Provisioning:
   - In `packages/domain/src/services/admin-dashboard.service.ts`:
   - Implement `provisionTenantInCellDataPlane(clientId: string, cellId: string, ownerUserId: string, clientData: any)`
   - Materialize tenant owner in `admin.users`, `admin.tenant_users`, `admin.tenant_labels`, and `admin.client_business_info` in `pg-cell-XX`.
   - Ensure tenant creation sets `lifecycle_status = 'alta'` (not premature 'activo').
3. Identity Promotion & Credential Isolation:
   - When a user password is set or promoted, write Argon2id hash to `pg-cell-XX` (`admin.users`).
   - Set `password_hash = NULL` in `db-portal` (`admin.users`).
   - Set `users.identity_location = <cell_uuid>` in `db-portal`.

Deliverables:
- Write `analysis.md` and `handoff.md` in your state folder (`d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_2\`).
- Recommend the exact implementation blueprint for the Worker.
- Note: You are read-only. Do NOT edit application source code.
- Send a message to the orchestrator when completed.
