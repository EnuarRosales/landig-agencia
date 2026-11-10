# Dispatch for explorer_m2_1
Role: Milestone 2 Explorer — Session Resolution & Layout Dispatch
Scope: Layout fallback elimination and resolveAuthenticatedPortalContext implementation


## 2026-11-09T01:41:08Z
You are Explorer 1 for Milestone 2 (M2: Authoritative Session Dispatch & Shell Bifurcation — Features 9 & 10).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_1

Scope and Responsibilities:
Investigate and design the technical implementation strategy for Features 9 & 10 of Milestone 2:
1. Feature 9: Elimination of insecure role fallback in `apps/admin/app/layout.tsx` (lines 45-53 where `let role = 'platform_owner'` silently assigns SaaS platform owner privileges).
2. Feature 10: Implementation of server-side authoritative session resolution:
   - Function: `resolveAuthenticatedPortalContext(sessionId: string): Promise<PortalContext>`
   - Inspect where it should reside: `packages/domain/src/services/session-context.service.ts` or `admin-dashboard.service.ts`, exported for `apps/admin`.
   - Resolution logic:
     - Validate session via `authService.validateSession(sessionId)`. If invalid, return null/unauthenticated.
     - Query user's platform roles in `admin.platform_user_roles`. If present and active -> `scope: 'platform'`, `role: platformRoles[0]`.
     - If no platform roles:
       - Query active client routing and client record in `admin.clients`.
       - If no active client or `lifecycle_status === 'alta'` -> `scope: 'onboarding_prospect'`, `lifecycleStatus: 'alta'`.
       - If active client and `lifecycle_status === 'activo'` -> `scope: 'tenant'`, `activeClientId`, `role: 'tenant_owner' | 'tenant_agent'`, `activeCellId`.
   - Error handling: ensure invalid sessions do not render `AdminShell` (addressing the defect noted in `TEST_READY.md §5.1`).
