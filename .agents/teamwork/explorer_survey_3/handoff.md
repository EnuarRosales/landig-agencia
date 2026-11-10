# Handoff Report · Application & UI Architecture Survey (`apps/admin` and `apps/web`)

## 1. Observation

1. **Role Fallback in `apps/admin/app/layout.tsx`**:
   - File: `apps/admin/app/layout.tsx:44-54`
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
   - Line 86:
     ```tsx
     <AdminShell currentUser={currentUser}>{children}</AdminShell>
     ```
   - Direct observation: When a tenant user signs in, `fetchUserActivePlatformRoles(user.id)` returns `[]` because they have no records in `admin.platform_user_roles`. `role` stays `"platform_owner"`, and the user is unconditionally wrapped in `AdminShell`.

2. **Absence of Tenant Shell, Onboarding, and Workspace Routes in `apps/admin`**:
   - `apps/admin/components/`: Only contains `admin-shell.tsx`, `ai-enhance-textarea.tsx`, `brand-logo.tsx`, `confirmation-modal.tsx`, `data-table.tsx`, `theme-provider.tsx`, `theme-toggle.tsx`, and `user-profile-modal.tsx`. `TenantWorkspaceShell.tsx` and `TenantOnboardingWizard.tsx` do **not exist**.
   - `apps/admin/app/`: The only `page.tsx` files are `app/page.tsx` (the platform control plane dashboard), `app/admin/{ai,billing,cells,conversations,leads,orders,plans,referrals,reports,settings/branding,settings/notifications,tenants,users}/page.tsx`, and `app/design-system/page.tsx`.
   - Command output: Searching for `workspace` or `onboarding` under `apps/admin/app` returns 0 files. Routes `/onboarding` and `/workspace/*` do not exist.

3. **Absence of Cell Migration UI and Trigger in `apps/admin/app/admin/cells/`**:
   - In `apps/admin/app/admin/cells/page.tsx` (lines 339–342), status badges render only `c.status` (`active`, `draft`, `provisioning`, `verifying`, `draining`, `maintenance`, `error_connection`).
   - In `apps/admin/app/admin/cells/cell-actions.tsx`, action buttons only include: `manifiesto`, `reverificar`, `drenar`, `editar`, `eliminar`.
   - Grepping `apps/admin/app/admin/cells` and `apps/web/app/api/admin/cells` for `migration` or `migrate` yields 0 matches. No migration status detection against `packages/domain/drizzle-cell/` and no manual trigger endpoint exists.

4. **Post-Authentication Redirects in `apps/web`**:
   - In `apps/web/components/auth/login-form.tsx:84-104`:
     ```typescript
     if (userRole.startsWith("platform_")) {
       target = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co";
     } else if (!clientId) {
       target = `/${locale}/onboarding`;
     } else {
       target = `/${locale}/admin`;
     }
     ```
   - Observation: When `!clientId`, user is sent to `/${locale}/onboarding` on `apps/web:3001` where no page exists (HTTP 404). When `clientId` is present, user is sent to `/${locale}/admin` which `proxy.ts` redirects to `NEXT_PUBLIC_ADMIN_URL` root `/`, where `apps/admin/app/page.tsx` renders the platform owner dashboard inside `AdminShell`.
   - In `apps/web/app/api/auth/google/callback/route.ts:235` and `facebook/callback/route.ts:230`: OAuth callbacks redirect unconditionally to `new URL(process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003")`.

5. **Existing Domain Building Blocks**:
   - `TenantCapabilityGateService` is already implemented in `packages/domain/src/services/tenant-capability-gate.service.ts` with `assertCapability`, `getEffectiveCapabilities`, and `filterNavItems`.
   - `CatalogAndMediaService.signImgproxyUrl` in `packages/domain/src/services/catalog-and-media.service.ts:715` implements HMAC-SHA256 URL signing for `imgproxy`.
   - `S3StorageService` in `packages/domain/src/services/s3-storage.service.ts` implements SeaweedFS bucket `media` operations.
   - `AiEnhanceTextarea` in `apps/admin/components/ai-enhance-textarea.tsx` is implemented and verified.
   - `DrizzleTenantProductsRepository` in `packages/domain/src/services/tenant-products-and-media.service.ts:261` currently defaults to `getDb()` (`db-portal`) rather than the cell connection pool (`pg-cell-XX`).

---

## 2. Logic Chain

1. From Observation 1, because `apps/admin/app/layout.tsx` defaults `role = "platform_owner"` whenever a user has no records in `admin.platform_user_roles`, all non-platform users (prospects and tenant owners) are falsely identified as platform owners.
2. From Observation 1 and 2, because `RootLayout` wraps `{children}` directly in `<AdminShell>`, every route in `apps/admin` is rendered with the SaaS platform corporate sidebar and topbar, leaking platform controls to tenants.
3. From Observation 2, because no `/onboarding` or `/workspace/*` routes exist in `apps/admin`, tenant users cannot perform tenant operations or complete guided onboarding.
4. From Observation 4, because `apps/web/components/auth/login-form.tsx` redirects non-platform users either to a non-existent `/onboarding` route on `apps/web` or to `/admin` which lands on `apps/admin:3003 /`, tenants are dropped directly into the SaaS platform control plane (`AdminHomePage`).
5. From Observation 3, platform administrators currently have no visual indication in `/admin/cells` of whether a cell database has pending schema migrations, and have no UI trigger or backend endpoint to execute `packages/domain/drizzle-cell/` migrations on a target cell.
6. From Observation 5, while the core domain capabilities (`TenantCapabilityGateService`, `signImgproxyUrl`, `S3StorageService`, `AiEnhanceTextarea`) are already implemented in `@mocter/domain` and `apps/admin/components`, they lack the presentation layer (`TenantWorkspaceShell.tsx`, `/workspace/*` pages, `TenantOnboardingWizard.tsx`) and the multi-tenant cell database connection bridge (`CellDatabasePoolManager`).

---

## 3. Caveats

- Chatwoot internal database schemas and upstream Rails controllers are out of scope (per `AGENTS.md` and `TNT-001`).
- This survey did not modify any source code or execute live database mutations (strictly read-only investigation).
- Docker network probe behavior in `local_compose` vs `remote_vps` depends on `resolveLocalProbeTarget` (`host.docker.internal:6432` vs container host address), which should be tested during end-to-end container health verification.

---

## 4. Conclusion

The application and UI layer in `apps/admin` and `apps/web` is currently configured exclusively for SaaS platform operators, causing a complete breach of multi-tenant isolation at the UI level. To achieve the goals of `TNT-001`, the implementation phase must:
1. Replace the fallback `role = "platform_owner"` in `apps/admin/app/layout.tsx` with server-side authoritative dispatch using `resolveAuthenticatedPortalContext(sid)`.
2. Implement `TenantWorkspaceShell.tsx` and the `/workspace/*` route tree (7 base modules + 4 gated optional modules).
3. Implement `TenantOnboardingWizard.tsx` at `/onboarding` supporting 3 steps with `AiEnhanceTextarea` and cell persistence.
4. Implement `/api/tenant/*` route handlers backed by `pg-cell-XX` via `CellDatabasePoolManager`.
5. Fix post-authentication redirects in `apps/web` (`login-form.tsx`, OAuth callbacks, `proxy.ts`) to route deterministically to `/onboarding`, `/workspace`, or `/admin`.
6. Add migration status badges and a manual migration execution trigger in `/admin/cells` connected to a new `/api/admin/cells/[id]/migrate` endpoint.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify `layout.tsx` fallback**:
   ```powershell
   Select-String -Path "apps/admin/app/layout.tsx" -Pattern "platform_owner"
   ```
   Lines 45–53 will show `let role = "platform_owner"` and fallback assignment.

2. **Verify missing Workspace and Onboarding routes**:
   ```powershell
   Test-Path "apps/admin/app/workspace"
   Test-Path "apps/admin/app/onboarding"
   Test-Path "apps/admin/components/tenant-workspace-shell.tsx"
   ```
   All three commands return `False`.

3. **Verify missing Cell Migration actions**:
   ```powershell
   Select-String -Path "apps/admin/app/admin/cells/cell-actions.tsx" -Pattern "migrat"
   Select-String -Path "apps/web/app/api/admin/cells" -Pattern "migrat"
   ```
   Both commands return 0 matches.

4. **Verify `login-form.tsx` redirect flaw**:
   ```powershell
   Select-String -Path "apps/web/components/auth/login-form.tsx" -Pattern "target = " -Context 1,2
   ```
   Lines 84–104 will show redirecting `!clientId` to `/${locale}/onboarding` on port 3001 and `clientId` to `/${locale}/admin`.
