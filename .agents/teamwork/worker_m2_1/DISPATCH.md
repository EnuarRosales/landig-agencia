## 2026-11-09T01:53:26Z

You are the Milestone 2 Worker for the Mocter project.

Your mission is to implement Milestone 2: Authoritative Session Dispatch & Shell Bifurcation (Features 9, 10, 11, 12, 13).

## Mandatory Inputs & References
You MUST read these files before writing any code:
1. ORIGINAL_REQUEST.md: `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md`
2. PROJECT.md: `d:\3. Develoment\mocter-system\mocter-core\PROJECT.md`
3. TEST_READY.md: `d:\3. Develoment\mocter-system\mocter-core\TEST_READY.md`
4. Detailed Explorer Blueprints:
   - `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_1\analysis.md` & `handoff.md` (Features 9 & 10: Insecure role fallback elimination & `resolveAuthenticatedPortalContext`)
   - `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_2\analysis.md` & `handoff.md` (Feature 11: `TenantWorkspaceShell.tsx` and `PortalShellRouter.tsx`)
   - `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_3\analysis.md` & `handoff.md` (Features 12 & 13: 3-tier navigation guards, post-auth redirect alignment, and path stripping fix)

## Write Ownership
You have EXCLUSIVE write ownership of the following files:
- `packages/domain/src/services/session-context.service.ts`
- `packages/domain/src/services/session-context.service.test.ts`
- `packages/domain/src/index.ts`
- `apps/admin/proxy.ts`
- `apps/admin/components/tenant-workspace-shell.tsx`
- `apps/admin/components/tenant-workspace-shell.test.tsx`
- `apps/admin/components/portal-shell-router.tsx`
- `apps/admin/components/portal-shell-router.test.tsx`
- `apps/admin/app/layout.tsx`
- `apps/admin/app/admin/page.tsx`
- `apps/admin/app/admin/layout.tsx`
- `apps/admin/app/workspace/layout.tsx`
- `apps/admin/app/onboarding/layout.tsx`
- `apps/web/components/auth/login-form.tsx`
- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/api/auth/google/callback/route.ts`
- `apps/web/app/api/auth/facebook/callback/route.ts`
- `apps/web/proxy.ts`

DO NOT edit any other application source files without documenting why.

## Scope of Work

### Feature 9 & 10: Session Resolution & Fallback Elimination
1. Create `packages/domain/src/services/session-context.service.ts` implementing `resolveAuthenticatedPortalContext(sessionId: string): Promise<PortalContext | null>`.
   - Partition into 3 mutually exclusive scopes: `"platform"`, `"tenant"`, `"onboarding_prospect"`.
   - If user has active records in `admin.platform_user_roles`, scope is `"platform"`.
   - If user has assigned `clientId` with `lifecycleStatus === 'activo'`, scope is `"tenant"` (role: `tenant_owner` if ownerUserId === user.id else `tenant_agent`), resolve activeCellCode (`cell.name` or `cell.code`, e.g. `pg-cell-01`), planName, and capability flags.
   - If user has no active client or `lifecycleStatus === 'alta'`, scope is `"onboarding_prospect"`.
   - If session is invalid, expired, revoked, or user disabled, return `null`.
2. Re-export `resolveAuthenticatedPortalContext`, `PortalContext`, and `PortalScope` in `packages/domain/src/index.ts`.
3. Create comprehensive unit tests in `packages/domain/src/services/session-context.service.test.ts`.

### Feature 11: Shell Bifurcation & TenantWorkspaceShell
1. Create `apps/admin/components/tenant-workspace-shell.tsx` as a client component:
   - Visual merchant store identity: store logo or avatar, name, slug, badge "Comercio", cell indicator `● pg-cell-01`.
   - 7 Base modules: `/workspace` (Tablero), `/workspace/products` (Productos Y Catálogo), `/workspace/contacts` (Contactos CRM), `/workspace/orders` (Pedidos Y Ventas), `/workspace/bot` (Asistente AI Y Bot), `/workspace/team` (Equipo Y Miembros), `/workspace/billing` (Mi Plan Y Cuotas).
   - 4 Dynamic capability-gated modules: `/workspace/conversations` (`chatwoot_inboxes`), `/workspace/branding` (`custom_branding`), `/workspace/community` (`community_feed`), `/workspace/reports` (`data_export`).
   - Mobile First topbar + off-canvas drawer with touch targets >= 44px. Desktop persistent sidebar (260px).
   - User profile HUD: "Ficha De Perfil Del Comercio", "Cambiar Comercio" (D-15 guidance), and "Cerrar Sesión" with `ConfirmationModal`.
   - ZERO links to `/admin/*`, zero platform jargon, zero spec codes (`TNT-001`).
2. Create `apps/admin/components/portal-shell-router.tsx` as a Server Component:
   - Reads session cookie, calls `resolveAuthenticatedPortalContext(sid)`. If null, redirects to login (HTTP 307).
   - Reads `x-pathname` from request headers.
   - Dispatches: `AdminShell` (platform on `/admin/*` or `/`), `TenantWorkspaceShell` (tenant on `/workspace/*`), un-shelled (`onboarding_prospect` on `/onboarding`).
   - Intercepts cross-scope access.
3. Update `apps/admin/app/layout.tsx`: eliminate `let role = 'platform_owner'` fallback, mount `<PortalShellRouter>{children}</PortalShellRouter>`.

### Features 12 & 13: Navigation Guards & Post-Auth Redirect Alignment
1. `apps/admin/proxy.ts`: trim cookie value (`!sid || !sid.trim()`), inject `x-pathname` and `x-request-id` in request headers.
2. Create `apps/admin/app/admin/page.tsx` exporting `AdminHomePage` so `/admin` renders the control plane dashboard.
3. Create subtree layout guards in `apps/admin/app/admin/layout.tsx`, `apps/admin/app/workspace/layout.tsx`, and `apps/admin/app/onboarding/layout.tsx`.
4. `apps/web/components/auth/login-form.tsx:84-104`: redirect platform users to `${adminBase}/admin`, active tenants to `${adminBase}/workspace`, and prospects/alta to `${adminBase}/onboarding`.
5. `apps/web/app/api/auth/login/route.ts`: return `lifecycleStatus`.
6. `apps/web/app/api/auth/google/callback/route.ts` and `facebook/callback/route.ts`: deterministic redirects per scope.
7. `apps/web/proxy.ts`: proxy `/admin`, `/workspace`, and `/onboarding` without stripping the subpath.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Constitutional Directives (.agents/AGENTS.md)
- TSDoc in neutral Spanish on all exported functions, interfaces, and classes.
- Zero `console.*` in application code (use structured logger with request correlation).
- Zero deprecated code or APIs.
- Zero native dialogs (use `ConfirmationModal`).
- Form labels in Title Case.
- Zero spec codes (`TNT-001`, `ADM-001`) in user-facing UI.

## Verification Checklist
1. Unit tests: run `pnpm --filter @mocter/domain test` or `packages\domain\node_modules\.bin\vitest.cmd run src/services/session-context.service.test.ts`.
2. E2E tests: run `node tests/e2e/run.mjs --scenario=B`. All 14 tests must pass.
3. Live HTTP verification: probe `http://localhost:3003/admin/cells` with forged cookie `mocter_sid=invalid_forged_session_token_12345` -> must return HTTP 307 redirecting to `/es/login` (zero `AdminShell` HTML in response).
4. Container restart & health check (AGENTS.md §4.18):
   - Compile changes.
   - Restart container: `docker compose -f docker-compose.cell.yml restart admin-portal` (or `docker restart mocter-core-admin-portal-1`).
   - Check `curl -I http://localhost:3003/api/health` -> HTTP 200.

Document all findings, commands, and results in `d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\worker_m2_1\handoff.md`.
Use `send_message` to report completion.
