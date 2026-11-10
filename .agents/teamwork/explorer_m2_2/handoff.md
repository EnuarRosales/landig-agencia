# Handoff Report · Milestone 2 Feature 11: Shell Bifurcation & TenantWorkspaceShell

> **Author**: Explorer 2 (`explorer_m2_2`)  
> **Role**: Teamwork Explorer (Read-only investigation & architecture)  
> **Date**: 2026-11-09  
> **Milestone**: M2 (Authoritative Session Dispatch & Shell Bifurcation — Feature 11)  
> **Applicable Specs**: TNT-001 (R2, R4), ADM-001 (D-35, D-37), AUTH-001 (AUTH-D-09), DSN-001, AGENTS.md  

---

## 1. Observation

1. **Unconditional `AdminShell` and Role Fallback in `apps/admin/app/layout.tsx`**:
   - In `apps/admin/app/layout.tsx:44-54`:
     ```typescript
     const { user, session } = validation.data;
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
   - In `apps/admin/app/layout.tsx:86`:
     ```tsx
     <AdminShell currentUser={currentUser}>{children}</AdminShell>
     ```
   - Observation: When a non-platform user (such as tenant owner `synergiamarket25@gmail.com`) signs in, `fetchUserActivePlatformRoles` returns an empty array `[]`. `role` defaults to `"platform_owner"`, and the user is unconditionally wrapped in `AdminShell`.

2. **Absence of Dedicated Tenant Workspace Shell and Portal Shell Router**:
   - Executing `Test-Path "apps/admin/components/tenant-workspace-shell.tsx"` returns `False`.
   - Executing `Test-Path "apps/admin/components/portal-shell-router.tsx"` returns `False`.
   - Result: There is no component tree for the tenant backoffice and no server-side layout bifurcation router.

3. **Unauthenticated Session Leakage Defect (`TEST_READY.md §5.1`)**:
   - `apps/admin/proxy.ts:31` only checks `if (!sid)`. When a client passes a forged cookie (`mocter_sid=invalid_forged_session_token_12345`), `proxy.ts` passes the request.
   - In `apps/admin/app/layout.tsx:39-42`, `authService.validateSession(sid)` returns `undefined`, setting `currentUser = undefined`. However, line 86 still renders `<AdminShell currentUser={undefined}>{children}</AdminShell>`, responding with HTTP 200 and exposing corporate platform UI instead of redirecting with HTTP 307 to `/es/login`.

4. **E2E Scenario B Contracts (`tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs`)**:
   - `B-T1.1` to `B-T1.4`: Unauthenticated requests to `/`, `/admin/cells`, `/workspace`, and `/onboarding` must redirect with HTTP 307 to login (`res.location.includes("/login")`).
   - `B-T1.5`: Portal scopes must be strictly partitioned into `"platform"`, `"tenant"`, and `"onboarding_prospect"`.
   - `B-T2.1`: Absence of platform roles must never default to `"platform_owner"`.
   - `B-T2.4` & `B-T2.5`: Tenants in state `'alta'` or prospect users (`active_client_id IS NULL`) must be constrained to `/onboarding`.
   - `B-T3.1`: Tenant users must be blocked from accessing `/admin/*`.
   - `B-T3.2`: `assert.strictEqual("AdminShell" !== "TenantWorkspaceShell", true)` — shells must be completely distinct components with zero layout or navigation leakage.

5. **E2E Scenario D Contracts (`tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs`)**:
   - `D-T1.1`: Exactly 7 base modules: `/workspace`, `/workspace/products`, `/workspace/contacts`, `/workspace/orders`, `/workspace/bot`, `/workspace/team`, `/workspace/billing`.
   - `D-T1.2`: Exactly 4 optional modules dynamically gated by plan feature flags: `/workspace/conversations` (`chatwoot_inboxes`), `/workspace/branding` (`custom_branding`), `/workspace/community` (`community_feed`), `/workspace/reports` (`data_export`).
   - `D-T3.1` & `D-T3.2`: Capability gate disables optional modules on Free plans and enables them on Enterprise plans.

---

## 2. Logic Chain

1. From Observation 1 and 3, because `RootLayout` in `apps/admin/app/layout.tsx` wraps `{children}` unconditionally in `<AdminShell>`, both tenant users and unauthenticated forged sessions receive the SaaS platform corporate shell.
2. From Observation 2, because neither `TenantWorkspaceShell.tsx` nor `PortalShellRouter.tsx` exists, the application has no mechanism to present the merchant backoffice or switch visual shells based on session context.
3. From Observation 4 and 5, compliance with E2E Scenarios B and D requires that:
   - When a user has `scope === 'platform'`, they access `/admin/*` and `/` wrapped exclusively in `AdminShell`.
   - When a user has `scope === 'tenant'` with `lifecycle_status === 'activo'`, they access `/workspace/*` wrapped exclusively in `TenantWorkspaceShell`.
   - When a user has `scope === 'onboarding_prospect'` or `lifecycle_status === 'alta'`, they are constrained to `/onboarding` in an un-shelled layout.
   - When a user has an invalid session, they must be deterministically redirected with HTTP 307 to login.
4. By introducing `PortalShellRouter.tsx` as an asynchronous Server Component within `RootLayout`:
   - It reads `sid` and calls `resolveAuthenticatedPortalContext(sid)`. If null, it calls `redirect('/es/login')` immediately, resolving the unauthenticated session leakage defect (Observation 3).
   - It reads `x-pathname` from request headers (propagated by `proxy.ts`).
   - If `scope === 'platform'` and path is `/admin/*` or `/`, it renders `AdminShell`.
   - If `scope === 'tenant'` and path is `/workspace/*`, it renders `TenantWorkspaceShell`.
   - If `scope === 'onboarding_prospect'` or `'alta'`, it renders `<main className="min-h-dvh ...">{children}</main>`.
   - Any cross-scope access attempt is deterministically intercepted and redirected.
5. By implementing `TenantWorkspaceShell.tsx` as a distinct client component:
   - It establishes the merchant store identity (store icon or logo, store name, badge "Comercio", slug, cell indicator `● pg-cell-01`).
   - It renders the 7 mandatory base modules (`/workspace`, `/workspace/products`, `/workspace/contacts`, `/workspace/orders`, `/workspace/bot`, `/workspace/team`, `/workspace/billing`).
   - It dynamically filters the 4 optional modules (`/workspace/conversations`, `/workspace/branding`, `/workspace/community`, `/workspace/reports`) based on the tenant's plan capability flags.
   - It provides merchant-specific quick actions: "Ficha De Perfil Del Comercio", "Cambiar Comercio" (explaining D-15 1:0..1 membership), and "Cerrar Sesión" with accessible `ConfirmationModal` (Rule 4.17).
   - It contains zero links to `/admin/*`, ensuring complete multi-tenant UI isolation.

---

## 3. Caveats

1. **Upstream Dependency on `resolveAuthenticatedPortalContext`**:
   `PortalShellRouter.tsx` consumes `resolveAuthenticatedPortalContext` from `@mocter/domain`, which is assigned to Explorer 1 / Worker for Features 9 & 10. The contract must return `{ user, scope: 'platform' | 'tenant' | 'onboarding_prospect', role, activeClient, activeCellCode, planName, capabilities, lifecycleStatus }`.
2. **Middleware Header Propagation**:
   `PortalShellRouter.tsx` inspects `headers().get("x-pathname")`. `apps/admin/proxy.ts` (handled in Features 12 & 13) must propagate `requestHeaders.set("x-pathname", pathname)` in `NextResponse.next()`. If the header is missing, `PortalShellRouter` defaults safely by `scope`.
3. **Read-Only Scope**:
   This report provides the architectural design and code blueprints. Application source files were not modified during this exploration.

---

## 4. Conclusion

The technical strategy for Feature 11 is fully designed and documented with complete, production-ready code in `analysis.md`:
1. Create `apps/admin/components/tenant-workspace-shell.tsx` implementing the 7 base modules, 4 dynamically capability-gated modules, merchant branding, cell status, and accessible HUD profile/modals with zero platform leaks.
2. Create `apps/admin/components/portal-shell-router.tsx` to handle server-side authoritative shell dispatch and prevent invalid session leakage.
3. Refactor `apps/admin/app/layout.tsx` to mount `<PortalShellRouter>{children}</PortalShellRouter>` within `ThemeProvider`, eliminating the fallback `role = "platform_owner"`.
4. Ensure `apps/admin/proxy.ts` forwards `x-pathname` in request headers.
5. Create `apps/admin/components/tenant-workspace-shell.test.tsx` and `portal-shell-router.test.tsx` verifying all functional contracts.

---

## 5. Verification Method

### 5.1 Static Verification of Architecture
Verify current lack of components:
```powershell
Test-Path "apps/admin/components/tenant-workspace-shell.tsx"
Test-Path "apps/admin/components/portal-shell-router.tsx"
```
Both return `False` prior to Worker implementation.

### 5.2 Unit Test Execution (Post-Worker Implementation)
Execute Vitest test suite on `apps/admin`:
```bash
pnpm --filter @mocter/admin test
```
Must pass all test cases for `admin-shell.test.tsx`, `tenant-workspace-shell.test.tsx`, and `portal-shell-router.test.tsx`.

### 5.3 End-to-End Test Suite Execution
Execute E2E Scenario B:
```bash
node tests/e2e/run.mjs --scenario=B
```
Must achieve 14/14 PASS across all Scenario B tests.

### 5.4 Docker Health Verification (AGENTS.md §4.18)
```bash
docker compose -f docker-compose.cell.yml restart admin-portal
curl -I http://localhost:3003/api/health
```
Must return HTTP 200 OK.
