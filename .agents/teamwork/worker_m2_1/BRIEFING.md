# BRIEFING — 2026-11-09T01:54:00Z

## Mission
Implement Milestone 2: Authoritative Session Dispatch & Shell Bifurcation (Features 9, 10, 11, 12, 13) for the Mocter project.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: d:\3. Develoment\mocter-system\mocter-core
- State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\worker_m2_1
- Original parent: d9dd6187-8097-406e-a649-0b6a842d2eff
- Milestone: Milestone 2 (Features 9, 10, 11, 12, 13)

## 🔒 Key Constraints
- TSDoc in neutral Spanish on all exported functions, interfaces, and classes.
- Zero `console.*` in application code (use structured logger with request correlation).
- Zero deprecated code or APIs.
- Zero native dialogs (use `ConfirmationModal`).
- Form labels in Title Case.
- Zero spec codes (`TNT-001`, `ADM-001`, etc.) in user-facing UI.
- Integrity Mandate: genuine implementation, zero test hardcoding, zero facade shortcuts.
- Compile, Restart & Health Check Protocol (AGENTS.md §4.18): must compile, restart container `admin-portal`, verify HTTP 200 on health check.
- Write ownership restricted to assigned files.

## Current Parent
- Conversation ID: d9dd6187-8097-406e-a649-0b6a842d2eff
- Updated: not yet

## Task Summary
- **What to build**:
  1. `session-context.service.ts`: `resolveAuthenticatedPortalContext` with 3 mutually exclusive scopes (platform, tenant, onboarding_prospect) + domain export + unit tests.
  2. `tenant-workspace-shell.tsx`: Merchant store identity, 7 base modules, 4 dynamic capability modules, mobile drawer, desktop sidebar, user HUD, zero spec codes.
  3. `portal-shell-router.tsx`: Server Component that resolves session, routes shells, checks cross-scope access, handles redirects.
  4. Root layout (`apps/admin/app/layout.tsx`): eliminate fallback `role = 'platform_owner'`, mount `PortalShellRouter`.
  5. Proxy & Subtree guards: `apps/admin/proxy.ts` (trim cookie, inject x-pathname), `admin/page.tsx`, `admin/layout.tsx`, `workspace/layout.tsx`, `onboarding/layout.tsx`.
  6. Post-auth redirect alignment: `apps/web/components/auth/login-form.tsx`, `apps/web/app/api/auth/login/route.ts`, oauth callbacks (`google`, `facebook`), `apps/web/proxy.ts` (preserve subpaths).
- **Success criteria**:
  - Domain unit tests pass.
  - Scenario B E2E tests (14/14) pass.
  - Live probe with forged cookie returns HTTP 307 (zero AdminShell leak).
  - Health check returns HTTP 200 after container restart.
- **Interface contracts**: PROJECT.md, AGENTS.md, TEST_READY.md
- **Code layout**: packages/domain/src, apps/admin, apps/web

## Key Decisions Made
- [TBD - will update as implementation proceeds]

## Change Tracker
- **Files modified**: none yet
- **Build status**: pending
- **Pending issues**: none

## Quality Status
- **Build/test result**: pending
- **Lint status**: pending
- **Tests added/modified**: pending

## Loaded Skills
- **Source**: d:\3. Develoment\mocter-system\mocter-core\.agents\skills\nextjs-logging\SKILL.md
- **Local copy**: not yet copied
- **Core methodology**: Structured logging with Pino, request correlation via AsyncLocalStorage and x-request-id, non-blocking via after(), strict server/client separation.

## Artifact Index
- DISPATCH.md — Assignment and requirements
- progress.md — Liveness heartbeat and execution log
- handoff.md — Final 5-component report
