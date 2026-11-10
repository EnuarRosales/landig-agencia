# Dispatch for explorer_m2_3
Role: Milestone 2 Explorer — Navigation Guards & Redirects
Scope: Server navigation guards, proxy.ts, login-form.tsx, OAuth callbacks


## 2026-11-09T01:41:26Z

You are Explorer 3 for Milestone 2 (M2: Navigation Guards & Redirects — Features 12 & 13).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_3

MANDATORY FIRST STEP:
Read the user request file at:
d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md

Read project documents:
- Project specification: d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
- E2E Test Suite declaration: d:\3. Develoment\mocter-system\mocter-core\TEST_READY.md
- Previous survey report: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_survey_3\handoff.md

Scope and Responsibilities:
Investigate and design the technical implementation strategy for Features 12 & 13 of Milestone 2:
1. Feature 12: Server-side Navigation Guards:
   - In `apps/admin/proxy.ts` (middleware/proxy) and layout guards:
     - Intercept non-platform users attempting to access `/admin/*` or `/` -> redirect to `/workspace` (if `activo`) or `/onboarding` (if `alta`).
     - Intercept platform operators attempting to access `/workspace/*` without tenant context.
     - Intercept users with `lifecycle_status === 'alta'` attempting to access `/workspace/*` -> redirect to `/onboarding`.
     - Intercept unauthenticated users or users with invalid/revoked session tokens -> redirect to login (HTTP 307).
2. Feature 13: Post-Authentication Redirect Alignment in `apps/web`:
   - Inspect `apps/web/components/auth/login-form.tsx:84-104`.
   - Inspect OAuth callbacks: `apps/web/app/api/auth/google/callback/route.ts` and `facebook/callback/route.ts`.
   - Inspect `apps/web/proxy.ts` / redirect routing.
   - Enforce deterministic post-auth redirects:
     - `platform` users -> `NEXT_PUBLIC_ADMIN_URL/admin`
     - `tenant` users (`lifecycle_status === 'activo'`) -> `NEXT_PUBLIC_ADMIN_URL/workspace`
     - `onboarding_prospect` users (`lifecycle_status === 'alta'` or no client) -> `NEXT_PUBLIC_ADMIN_URL/onboarding`
   - Test against E2E Scenario B: `node tests/e2e/run.mjs --scenario=B`.

Deliverables:
- Write `analysis.md` and `handoff.md` in your state folder (`d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m2_3\`).
- Recommend the exact implementation blueprint for the Worker.
- Note: You are read-only. Do NOT edit application source code.
- Send a message to the orchestrator when completed.
