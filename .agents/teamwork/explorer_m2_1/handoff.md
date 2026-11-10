# Handoff Report · Milestone 2 Features 9 & 10 (Session Resolution & Insecure Fallback Elimination)

> **Agent:** Explorer 1 (`explorer_m2_1`)  
> **Milestone:** M2 — Authoritative Session Dispatch & Shell Bifurcation  
> **Features Investigated:**  
> - Feature 9: Elimination of insecure role fallback in `apps/admin/app/layout.tsx`  
> - Feature 10: Server-side authoritative session resolution (`resolveAuthenticatedPortalContext`)  
> **Target Worker:** Implementer for Features 9 & 10

---

## 1. Observation

1. **Insecure Role Fallback in `apps/admin/app/layout.tsx:44-54`**:
   Verbatim code:
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
   Direct query to live database `db-portal` confirms `admin.platform_user_roles` contains records exclusively for platform operators (`soporte@mocter.co`, `admin@mocter.co`, `ventas@mocter.co`). For tenant users like `synergiamarket25@gmail.com` (`01a1bc84-cbec-7a2c-9efe-3a3f55284113`), `fetchUserActivePlatformRoles` returns `[]`. Consequently, `role` stays `"platform_owner"`.

2. **Unconditional Shell Mounting in `apps/admin/app/layout.tsx:86`**:
   Verbatim code:
   ```tsx
   <AdminShell currentUser={currentUser}>{children}</AdminShell>
   ```
   When `getCurrentUser()` returns `undefined` (because no cookie is provided or an invalid/forged cookie like `mocter_sid=invalid_forged_session_token_12345` is provided), `RootLayout` continues execution and renders `<AdminShell currentUser={undefined}>{children}</AdminShell>` with HTTP 200, instead of redirecting to login. This directly causes the unauthenticated leakage escalated in `TEST_READY.md §5.1`.

3. **Whitespace Cookie Pass-through in `apps/admin/proxy.ts:27-31`**:
   Verbatim code:
   ```typescript
   const sid =
     request.cookies.get(sidCookieName)?.value ||
     request.cookies.get("mocter_sid")?.value;

   if (!sid) {
   ```
   When `mocter_sid` is `"   "`, `sid` is truthy, bypassing proxy redirection.

4. **Schema & Model Structure in `packages/domain`**:
   - `users.activeClientId` in `packages/domain/src/db/schemas/admin/users.ts:50` points to `admin.clients(id)` as the single-membership pointer (ADM-001 D-15), and is nullable for prospects.
   - `clients.lifecycleStatus` in `packages/domain/src/db/schemas/admin/clients.ts:39` defaults to `'alta'`. `ownerUserId` links to `users.id`.
   - `clientRouting` in `packages/domain/src/db/schemas/admin/client-routing.ts:16-24` links `clientId` -> `cellId`.
   - `fetchUserActivePlatformRoles(userId)` in `packages/domain/src/services/cell-authorization.service.ts:44` queries `admin.platform_user_roles` where `revoked_at IS NULL`.
   - No `session-context.service.ts` exists yet; `PROJECT.md:85` specifies this exact location.

5. **E2E Test Contracts in `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs`**:
   - Test B-T1.5 requires allowed scopes: `["platform", "tenant", "onboarding_prospect"]`.
   - Test B-T2.1 asserts non-platform user has 0 rows in `admin.platform_user_roles` and must never default to `platform_owner`.
   - Test B-T2.3 asserts empty/whitespace cookie must redirect with 307.
   - Test B-T2.4 & B-T2.5 assert tenants in state `'alta'` or with `active_client_id IS NULL` map to `/onboarding`.

---

## 2. Logic Chain

1. From Observation 1, any user lacking records in `admin.platform_user_roles` retains `role = 'platform_owner'` due to lines 45–53 in `apps/admin/app/layout.tsx`.
2. From Observation 2, because `RootLayout` mounts `<AdminShell>` regardless of whether `currentUser` is defined or what scope they belong to, both unauthenticated clients (with invalid cookies) and non-platform tenants are exposed to the SaaS platform administration UI.
3. From Observation 3, `proxy.ts` allows whitespace tokens to pass to `layout.tsx`, requiring trimming at the proxy boundary.
4. From Observation 4, the authoritative state necessary to partition user sessions resides across `admin.platform_user_roles`, `admin.clients`, and `admin.client_routing`.
5. Therefore, introducing `resolveAuthenticatedPortalContext` in `packages/domain/src/services/session-context.service.ts` to inspect these tables in strict hierarchical order:
   - Level 1: `validateSession(cleanSid)` -> If invalid, return `null`.
   - Level 2: `fetchUserActivePlatformRoles` -> If active roles present, return `scope: 'platform'`, `role: platformRoles[0]`.
   - Level 3: Non-platform users -> check `clients` and `client_routing`. If no client or `lifecycleStatus === 'alta'`, return `scope: 'onboarding_prospect'`. If `lifecycleStatus === 'activo'`, return `scope: 'tenant'`, `role: isOwner ? 'tenant_owner' : 'tenant_agent'`, `activeCellId`.
6. From Level 1 and Observation 2, when `layout.tsx` calls `resolveAuthenticatedPortalContext(sid)` and receives `null`, it immediately calls `redirect(resolveLoginRedirect(headers))` (HTTP 307), preventing `<AdminShell>` from rendering and resolving Defect §5.1.
7. From Levels 2 and 3 and Observation 1, non-platform users receive either `role: 'onboarding_prospect'`, `'tenant_owner'`, or `'tenant_agent'`, completely eliminating the insecure `platform_owner` fallback.

---

## 3. Caveats

- **Feature Boundary Isolation:** This exploration is strictly scoped to Features 9 and 10. The shell bifurcation component (`PortalShellRouter`, Feature 11), cross-scope navigation guards (Feature 12), and `apps/web` login redirects (Feature 13) build upon the `PortalContext` delivered here, but are distinct subsequent features.
- **Tenant Agent Cell Lookup:** For non-owner tenant users (`client.ownerUserId !== user.id`), this blueprint assigns `role = 'tenant_agent'`, which matches the global Router catalog. Detailed cell-side permissions resolution in `pg-cell-XX` via `CellDatabasePoolManager` is governed by M1/M4 contracts.
- **Read-Only Constraint:** Per instructions, no application source code was modified during this survey. Complete, verified drop-in blueprints are provided in `analysis.md`.

---

## 4. Conclusion

Features 9 & 10 must be implemented together by the Worker as follows:
1. **Module Creation:** Create `packages/domain/src/services/session-context.service.ts` implementing `resolveAuthenticatedPortalContext(sessionId: string): Promise<PortalContext | null>` with explicit scopes `platform`, `tenant`, and `onboarding_prospect`.
2. **Export Registration:** Export the service from `packages/domain/src/index.ts`.
3. **Unit Testing:** Implement `packages/domain/src/services/session-context.service.test.ts` covering all 10 branches (empty token, invalid token, disabled user, platform owner, prospect, tenant alta, tenant activo, tenant agent, fail-closed errors).
4. **Proxy Tightening:** Update `apps/admin/proxy.ts` to trim session tokens (`rawSid?.trim()`) and forward request path headers (`x-mocter-pathname`, `x-mocter-search`).
5. **Layout Refactor:** Refactor `apps/admin/app/layout.tsx` to eliminate `let role = 'platform_owner'`, call `resolveAuthenticatedPortalContext`, and execute `redirect()` when the session is null, preventing unauthenticated `<AdminShell>` mounting.

---

## 5. Verification Method

To independently verify the implementation:

1. **Verify Unit Tests:**
   ```powershell
   packages\domain\node_modules\.bin\vitest.cmd run src/services/session-context.service.test.ts
   ```
   Must pass all tests with 0 failures.

2. **Verify Scenario B E2E Tests:**
   ```powershell
   node tests/e2e/run.mjs --scenario=B
   ```
   Must output `14/14 PASS`.

3. **Verify Elimination of `let role = 'platform_owner'`:**
   ```powershell
   Select-String -Path "apps/admin/app/layout.tsx" -Pattern "let role = \"platform_owner\""
   ```
   Must return 0 matches.

4. **Verify Unauthenticated Redirect on Forged Cookie (Defect §5.1):**
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:3003/admin/cells" -Headers @{ Cookie = "mocter_sid=forged_token_123" } -MaximumRedirection 0 -ErrorAction SilentlyContinue | Select-Object StatusCode, @{N='Location';E={$_.Headers.Location}}
   ```
   Must return `StatusCode: 307` and `Location: .../es/login...`, with 0 occurrences of `AdminShell` HTML in the response body.
