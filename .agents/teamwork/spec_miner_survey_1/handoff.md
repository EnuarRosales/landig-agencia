# Handoff Report — Specification Miner Survey 1

**Agent ID:** `spec_miner_survey_1`  
**Role:** Specification Miner  
**Objective:** Mine and document all required functional and non-functional features, architectural contracts, security invariants, end-to-end verification scenarios, and acceptance criteria for TNT-001 (Tenant Operating Environment Stabilization).  
**Target Path:** `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\spec_miner_survey_1\handoff.md`  

---

## 1. Observation

Direct inspections of the repository and specification sources yielded the following verified findings:

1. **Insecure SaaS Role Fallback in `apps/admin/app/layout.tsx` (Lines 45–53):**
   ```ts
   let role = "platform_owner";
   try {
     const roles = await fetchUserActivePlatformRoles(user.id);
     if (roles.length > 0) {
       role = roles.includes("platform_owner") ? "platform_owner" : (roles[0] || "platform_owner");
     }
   } catch {
     // Fallback seguro a platform_owner
   }
   ```
   Furthermore, line 86 unconditionally mounts:
   ```tsx
   <AdminShell currentUser={currentUser}>{children}</AdminShell>
   ```
   Any authenticated user lacking entries in `admin.platform_user_roles` (such as a tenant owner or prospective registrant) is silently assigned `platform_owner` and granted access to the SaaS backoffice shell.

2. **Omission of Tenant Roles in `packages/domain/src/services/rbac.service.ts` (Lines 428–452):**
   `fetchRbacOverview` only selects from `admin.platform_user_roles`:
   ```ts
   const activeRoles = await db
     .select()
     .from(platformUserRoles)
     .where(sql`revoked_at IS NULL`);
   ...
   roles: userRolesMap.get(u.id) || ["Sin Rol"]
   ```
   Tenant owners with memberships in `tenant_users` or ownership in `admin.clients.owner_user_id` are designated `"Sin Rol"` and displayed with `identityLocation = "router"`.

3. **Cell Auth and Product Repositories Default to `db-portal`:**
   - `packages/domain/src/repositories/drizzle-cell-auth.repository.ts` (Lines 36–39):
     ```ts
     constructor(
       private readonly dbProvider: CellDatabaseProvider = () => getDb(),
       private readonly cellHealthChecker?: CellConnectionChecker,
     ) {}
     ```
   - `packages/domain/src/services/tenant-products-and-media.service.ts` (Lines 260–261):
     ```ts
     export class DrizzleTenantProductsRepository implements ITenantProductsRepository {
       constructor(private readonly db: any = getDb()) {}
     ```
   Both repositories use `getDb()`, targeting `db-portal` instead of the tenant's cell database via PgBouncer.

4. **Premature Active Status and Missing Cell Materialization in `packages/domain/src/services/admin-dashboard.service.ts` (Lines 2664–2720):**
   - Line 2673 sets `lifecycleStatus: "activo"` instead of `"alta"`.
   - Lines 2680–2720 update `users.activeClientId`, insert into `clientRouting` and `clientPlans`, and provision Chatwoot, but never insert into `admin.users`, `admin.tenant_users`, `admin.tenant_labels`, or `admin.client_business_info` on the assigned cell (`pg-cell-01`).
   - `identity_location` in `admin.users` remains `'router'`.

5. **In-Memory Stub for Onboarding in `packages/domain/src/services/onboarding-and-limits.service.ts` (Lines 176–202):**
   ```ts
   export class AdminOnboardingAndLimitsService {
     private readonly onboardingStore = new Map<string, OnboardingSessionState>();
     private readonly routingCache = new Map<string, { cellId: string; identityLocation: string }>();
   ```
   The service uses in-memory maps, lacks PostgreSQL persistence, and is not wired to any Next.js route or UI.

6. **Absence of Required New Files:**
   The following target files were verified not to exist in the current working tree (`Test-Path` returned `False`):
   - `packages/domain/src/db/cell-client.ts`
   - `packages/domain/src/services/session-context.service.ts`
   - `packages/domain/src/services/tenant-onboarding.service.ts`
   - `packages/domain/src/services/tenant-workspace.service.ts`
   - `apps/admin/components/portal-shell-router.tsx`
   - `apps/admin/components/tenant-workspace-shell.tsx`
   - `apps/admin/app/onboarding/`
   - `apps/admin/app/workspace/`

7. **Cell Migration Journal & Current UI State:**
   - `packages/domain/drizzle-cell/meta/_journal.json` contains 10 migration entries (`0000_cell_foundation` to `0009_cell_phase4_conversation_state_rls_grants_comments`).
   - `apps/admin/app/admin/cells/page.tsx` and `cell-actions.tsx` have no columns, status badges, or action triggers for inspecting or executing cell schema migrations.

---

## 2. Logic Chain

1. **Premise 1 (Isolation & RLS):** By architectural contract `DAT-001 RF-10.11` and `CEL-001 §2`, all tenant operational data must reside in PostgreSQL 18 cells with `FORCE ROW LEVEL SECURITY`. Observations 3 and 4 prove that the existing implementation failed to insert rows into `pg-cell-01` and pointed repositories to `db-portal`. Therefore, a dynamic connection pool manager (`CellDatabasePoolManager`) executing `SELECT set_config('app.current_client_id', clientId, true)` on every transaction is required.
2. **Premise 2 (Identity & Credentials Separation):** `AUTH-001 AUTH-D-01` and `AUTH-D-09` mandate that tenant password hashes reside strictly in `pg-cell-XX` (`admin.users`), with `password_hash = NULL` in `db-portal`. Observation 4 proves that tenant creation currently retains credentials in `db-portal`. Therefore, credential setup and reset must update `pg-cell-XX` and clear `db-portal` password hashes upon promotion.
3. **Premise 3 (Zero-Trust Shell Bifurcation):** `ADM-001 RF-02.6` (D-35) prohibits sharing UI component trees between SaaS administrators and tenant operators. Observation 1 proves that `layout.tsx` erroneously granted `platform_owner` to tenant users due to an unsafe fallback. Therefore, an authoritative session resolver (`resolveAuthenticatedPortalContext`) and a bifurcated shell router (`PortalShellRouter.tsx`) are required to enforce mutually exclusive routing: `/admin/*` (`AdminShell.tsx`), `/onboarding` (`TenantOnboardingWizard.tsx`), and `/workspace/*` (`TenantWorkspaceShell.tsx`).
4. **Premise 4 (Time-to-Value & Onboarding):** `ADM-001 RF-14.12` (D-36) requires a unified 3-step onboarding wizard completed in under 5 minutes. Observations 4 and 5 prove that the onboarding service was an in-memory stub and clients were immediately marked active. Therefore, a real PostgreSQL-backed `TenantOnboardingService` and `/onboarding` wizard are required.
5. **Premise 5 (Cell Migration Management):** `ORIGINAL_REQUEST.md R5` demands automated inspection of active cell schemas against `drizzle-cell` journals and controlled manual execution from the admin portal. Observation 7 confirms that the migration journals exist on disk but the UI and backend lack migration status tracking and execution endpoints.

---

## 3. Caveats

1. **Live Database State:** The existing tenant record `Synergia Market` (`synergiamarket25@gmail.com`) resides in the live Docker PostgreSQL database (`db-portal`) and not in static code files. Its reconciliation must be executed dynamically via `reconcileProvisionedTenantsInCells()` upon system startup or initialization.
2. **Docker Network Resolution:** Inside Docker containers (`apps/admin`, `apps/web`), communication with PgBouncer on the host requires `host.docker.internal:6432` in `local_compose` topology, which must be resolved through `resolveLocalProbeTarget`.
3. **Chatwoot Iframe Constraint:** Chatwoot integration remains strictly embedded in an iframe (`same-site`); no Chatwoot database schema changes or API modifications outside `mocter-admin` are permitted.
4. **No caveats** regarding the authoritative requirements and design specifications: all contracts in `TNT-001`, `ADM-001`, and `AUTH-001` are fully reconciled.

---

## 4. Conclusion

The specification survey for `TNT-001` is complete and fully documented in `analysis.md`. All 24 core functional/non-functional features across requirements `R1` through `R5` have been enumerated with precise inputs, outputs, error behaviors, and edge cases. The four end-to-end verification scenarios (A through D) and the five-phase implementation sequence are thoroughly defined. 

Implementation can proceed cleanly following the phased tasks:
- **Phase 1 (R1):** `CellDatabasePoolManager`, `DrizzleCellAuthRepository` connection, cell provisioning, and `Synergia Market` reconciliation.
- **Phase 2 (R2):** `resolveAuthenticatedPortalContext`, eradication of `platform_owner` fallback, `PortalShellRouter.tsx`, and shell separation.
- **Phase 3 (R3):** `TenantOnboardingService`, `/onboarding` route, and `TenantOnboardingWizard.tsx`.
- **Phase 4 (R4):** `TenantWorkspaceService`, `TenantWorkspaceShell.tsx`, `/workspace/*` views, and SeaweedFS/imgproxy media pipeline.
- **Phase 5 (R5 & Verification):** Cell migration inspection badge and execution trigger, unit test suite, container restarts, and live scenario validations A through D.

---

## 5. Verification Method

To independently verify the findings in this report:

1. **Verify File Gaps & Fallbacks in Code:**
   - Inspect `apps/admin/app/layout.tsx` (lines 45–53) to verify the `platform_owner` fallback.
   - Inspect `packages/domain/src/services/admin-dashboard.service.ts` (line 2673) to verify `lifecycleStatus: "activo"`.
   - Inspect `packages/domain/src/repositories/drizzle-cell-auth.repository.ts` (lines 37–38) to verify `getDb()` default.
   - Run:
     ```powershell
     Test-Path "packages/domain/src/db/cell-client.ts","apps/admin/components/portal-shell-router.tsx","apps/admin/components/tenant-workspace-shell.tsx"
     ```
     Expected: All return `False`.

2. **Verify Specification References:**
   - Inspect `docs/specs/tnt-001-entorno-operativo-inquilino/requirements.md` and `design.md`.
   - Inspect `docs/specs/adm-001-mocter-admin/requirements.md` (decisions D-35, D-36, D-37).
   - Inspect `docs/specs/auth-001-autenticacion-hibrida/requirements.md` (decisions AUTH-D-01, AUTH-D-09).

3. **Verify Deliverable Artifact:**
   - Inspect `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\spec_miner_survey_1\analysis.md` to review the exhaustive 24-feature catalog, 20 edge cases, and architectural invariants.
