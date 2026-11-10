# Dispatch for explorer_m2_2
Role: Milestone 2 Explorer — Shell Bifurcation & TenantWorkspaceShell
Scope: TenantWorkspaceShell.tsx, PortalShellRouter, and zero layout leakage


## 2026-11-09T01:41:18Z
You are Explorer 2 for Milestone 2 (M2: Shell Bifurcation & TenantWorkspaceShell — Feature 11).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_2

MANDATORY FIRST STEP:
Read the user request file at:
d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md

Read project documents:
- Project specification: d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
- E2E Test Suite declaration: d:\3. Develoment\mocter-system\mocter-core\TEST_READY.md
- Previous survey report: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_survey_3\handoff.md

Scope and Responsibilities:
Investigate and design the technical implementation strategy for Feature 11 of Milestone 2:
1. `TenantWorkspaceShell.tsx`:
   - Design the dedicated tenant backoffice shell component under `apps/admin/components/tenant-workspace-shell.tsx`.
   - Distinct visual identity and navigation:
     - Tenant logo / branding placeholder
     - Tenant navigation menu (Dashboard, Products, CRM Contacts, Orders, Bot, Team, Billing)
     - Optional modules dynamically filtered by capability flags (`conversations`, `branding`, `community`, `reports`)
     - Tenant user profile / quick actions (sign out, switch store if multi-tenant)
     - NO SaaS platform administration links (zero leaks to `/admin/cells`, `/admin/tenants`, `/admin/plans`, etc.)
2. Layout Shell Bifurcation / `PortalShellRouter`:
   - In `apps/admin/app/layout.tsx` or `apps/admin/components/portal-shell-router.tsx`:
   - Server component wrapper that inspects `resolveAuthenticatedPortalContext` and the active pathname:
     - If `scope === 'platform'` and on `/admin/*` -> render `<AdminShell>{children}</AdminShell>`
     - If `scope === 'tenant'` and on `/workspace/*` -> render `<TenantWorkspaceShell>{children}</TenantWorkspaceShell>`
     - If on `/onboarding` -> render un-shelled or wizard layout
     - If unauthenticated -> redirect to login (never render `AdminShell`)

Deliverables:
- Write `analysis.md` and `handoff.md` in your state folder (`d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_2\`).
- Recommend the exact implementation blueprint for the Worker.
- Note: You are read-only. Do NOT edit application source code.
- Send a message to the orchestrator when completed.
