# Handoff Report · Milestone 2 (Features 12 & 13)
**Navigation Guards, Session Perimeter Defense, and Post-Authentication Redirect Alignment**

## 1. Observation

1. **Unauthenticated & Forged Cookie Shell Leakage (`apps/admin/proxy.ts:27-31` and `apps/admin/app/layout.tsx:86`)**:
   - In `apps/admin/proxy.ts:31`:
     ```typescript
     if (!sid) {
       // redirects to login
     }
     return NextResponse.next();
     ```
   - In `apps/admin/app/layout.tsx:86`:
     ```tsx
     <AdminShell currentUser={currentUser}>{children}</AdminShell>
     ```
   - Direct live probe execution:
     `node -e "fetch('http://localhost:3003/admin/cells', { headers: { Cookie: 'mocter_sid=invalid_forged_session_token_12345' }, redirect: 'manual' }).then(r => console.log('STATUS:', r.status))"`
     Result: `STATUS: 200 LOCATION: null`.
     Observation: When an unauthenticated client supplies a forged or revoked cookie, `proxy.ts` passes the request. In `apps/admin/app/layout.tsx`, `authService.validateSession(sid)` returns `{ ok: false }`, but line 86 still mounts `<AdminShell>`, leaking platform UI to unauthenticated users with HTTP 200 (defect in `TEST_READY.md §5.1`).

2. **Incoherent Post-Login Targets in `apps/web/components/auth/login-form.tsx:84-104`**:
   - Verbatim code:
     ```typescript
     if (userRole.startsWith("platform_")) {
       target = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co";
     } else if (!clientId) {
       target = `/${locale}/onboarding`;
     } else {
       target = `/${locale}/admin`;
     }
     ```
   - Direct observation:
     - Platform users are redirected to `NEXT_PUBLIC_ADMIN_URL` root `/` rather than `/admin`.
     - Prospect users (`!clientId`) are redirected to `/${locale}/onboarding` on `apps/web` (port 3001) where no onboarding route exists (HTTP 404).
     - Active tenants are redirected to `/${locale}/admin` on port 3001, which proxies to port 3003 root `/` (`AdminHomePage`), dropping tenants into the SaaS platform control plane.
     - Tenants in `lifecycle_status === 'alta'` with a client ID are treated as active and redirected to `/admin` instead of `/onboarding`.

3. **Indiscriminate Root Redirects in OAuth Callbacks**:
   - In `apps/web/app/api/auth/google/callback/route.ts:235` and `facebook/callback/route.ts:230`:
     ```typescript
     : NextResponse.redirect(new URL(process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003"), { status: 303 });
     ```
   - Direct observation: Both OAuth callbacks unconditionally send all users to the root `/` of `mocter-admin` without checking scope, roles, or lifecycle status.

4. **Subpath Stripping and Missing Routes in `apps/web/proxy.ts:28-79`**:
   - Verbatim code:
     ```typescript
     const subPath = pathname.replace(/^(\/(es|en))?\/admin/, "") || "/";
     const targetUrl = new URL(subPath, adminBase);
     ```
   - Direct observation: Stripping `/admin` converts `/es/admin/cells` into `/cells` (HTTP 404) on `mocter-admin`. Furthermore, `apps/web/proxy.ts` lacks handling for `/workspace` and `/onboarding`, causing access to them on port 3001 to return HTTP 404.

5. **Missing `/admin` Route in `apps/admin/app/admin/`**:
   - Running `Test-Path "apps/admin/app/admin/page.tsx"` returns `False`. No page currently exists at `/admin`. The control plane home currently resides only at `apps/admin/app/page.tsx` (`/`).

---

## 2. Logic Chain

1. From Observation 1, because `apps/admin/proxy.ts` only checks if `!sid` without validating token authenticity or expiration, and `apps/admin/app/layout.tsx` unconditionally mounts `<AdminShell currentUser={currentUser}>` even when `currentUser` is `undefined`, forged and revoked sessions bypass the perimeter and receive the full HTML shell with HTTP 200.
2. From Observation 2 and 3, because `login-form.tsx` and OAuth callbacks do not inspect tenant lifecycle status (`alta` vs `activo`), and route non-platform users to either a non-existent port 3001 `/onboarding` path or to `/admin` which lands on `mocter-admin /`, tenant isolation is violated immediately after authentication.
3. From Observation 4, because `apps/web/proxy.ts` strips `/admin` during reverse proxying, links originating from `apps/web` to admin sub-resources break, and requests to `/workspace` or `/onboarding` fail with 404.
4. From Observation 5, because `apps/admin/app/admin/page.tsx` does not exist, enforcing the canonical routing contract where platform users land on `/admin` requires creating `apps/admin/app/admin/page.tsx`.
5. Therefore, a **3-tier navigation guard** combining `proxy.ts` (whitespace rejection & header propagation), `layout.tsx` (authoritative context resolution & cross-scope redirects), and subtree layouts (`/admin/layout.tsx`, `/workspace/layout.tsx`, `/onboarding/layout.tsx`), coupled with aligned post-auth redirects in `login-form.tsx`, OAuth callbacks, and `apps/web/proxy.ts`, resolves all identified vulnerabilities and fulfills Features 12 & 13.

---

## 3. Caveats

- In Next.js App Router, `proxy.ts` executes in the edge middleware runtime where PostgreSQL native socket connections (`pg`) are not available. Authoritative session resolution against PostgreSQL must execute in Server Components (`RootLayout` and layout guards) running on Node.js runtime.
- In Next.js Server Components, calling `redirect(...)` throws a `NEXT_REDIRECT` control-flow error. Layout guards must never catch this error in generic `try/catch` blocks without calling `unstable_rethrow` (per `AGENTS.md §4.14`).
- No source code in the application was modified during this survey (strictly read-only investigation).

---

## 4. Conclusion

Features 12 & 13 must be implemented according to the blueprint in `.agents/teamwork/explorer_m2_3/analysis.md`:
1. **`apps/admin/proxy.ts`**: Validate `!sid.trim()`, inject `x-pathname` and `x-request-id` into request headers.
2. **`apps/admin/app/layout.tsx`**: Consume `resolveAuthenticatedPortalContext(sid)`. If session is invalid/revoked, issue `redirect(...)` with HTTP 307. Implement cross-scope guards (`/` -> `/admin`, `/workspace`, or `/onboarding`; non-platform blocked from `/admin/*`; platform blocked from `/workspace/*`; `alta` blocked from `/workspace/*`).
3. **`apps/admin/app/admin/page.tsx`**: Create route exporting `AdminHomePage`.
4. **Subtree layout guards**: Add `apps/admin/app/admin/layout.tsx`, `apps/admin/app/workspace/layout.tsx`, and `apps/admin/app/onboarding/layout.tsx`.
5. **`apps/web/components/auth/login-form.tsx`**: Align targets to `${adminBase}/admin`, `${adminBase}/workspace`, and `${adminBase}/onboarding`.
6. **`apps/web/app/api/auth/login/route.ts`**: Return `lifecycleStatus` alongside `clientId`.
7. **OAuth callbacks (`google` & `facebook`)**: Enforce deterministic redirects according to user scope and lifecycle.
8. **`apps/web/proxy.ts`**: Proxy `/admin`, `/workspace`, and `/onboarding` without stripping subpaths.

---

## 5. Verification Method

To independently verify these findings and the subsequent implementation:

1. **Verify Live Forged Session Leakage (Baseline Failure)**:
   ```bash
   node -e "fetch('http://localhost:3003/admin/cells', { headers: { Cookie: 'mocter_sid=invalid_forged_session_token_12345' }, redirect: 'manual' }).then(r => console.log('STATUS:', r.status))"
   ```
   Current status: returns `200`. Expected after Worker implementation: returns `307` with `location` pointing to `/es/login`.

2. **Execute E2E Scenario B Suite**:
   ```bash
   node tests/e2e/run.mjs --scenario=B
   ```
   Must pass all 14 assertions covering Tiers 1 through 4.

3. **Verify Cross-Scope Navigation Interception**:
   - Request `GET /` with an active tenant cookie (`synergiamarket25@gmail.com`) -> returns `307 Location: http://localhost:3003/workspace`.
   - Request `GET /admin/cells` with an active tenant cookie -> returns `307 Location: http://localhost:3003/workspace`.
   - Request `GET /workspace` with a tenant in state `alta` -> returns `307 Location: http://localhost:3003/onboarding`.
   - Request `GET /workspace` with a platform operator cookie -> returns `307 Location: http://localhost:3003/admin`.

4. **Verify Post-Auth Redirect URLs in `apps/web`**:
   - Search for `target =` in `apps/web/components/auth/login-form.tsx`:
     ```powershell
     Select-String -Path "apps/web/components/auth/login-form.tsx" -Pattern "target =" -Context 1,3
     ```
     Confirm destinations resolve to `${adminBase}/admin`, `${adminBase}/workspace`, and `${adminBase}/onboarding`.
