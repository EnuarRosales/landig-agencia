# Technical Investigation & UI Architecture Survey: `apps/admin` and `apps/web`

**Date**: 2026-11-09T00:05:00Z  
**Author**: Explorer Subagent (Application and UI Architecture)  
**Target Specifications**: `TNT-001`, `ADM-001`, `AUTH-001`, `DAT-001`, `CEL-001`  
**Working Directory**: `d:\3. Develoment\mocter-system\mocter-core`

---

## 1. Executive Summary

This investigation surveys the application structure, routing, shells, authentication guards, and UI components across `apps/admin` and `apps/web`.

### Core Discoveries
1. **Critical Role Fallback in `apps/admin/app/layout.tsx`**: Every authenticated user whose query to `fetchUserActivePlatformRoles` returns empty is granted `role = "platform_owner"` by fallback (lines 45–53), and is unconditionally wrapped in `AdminShell` (line 86).
2. **Missing UI Tree Separation**: There is only one layout in `apps/admin` (`apps/admin/app/layout.tsx`). `TenantWorkspaceShell.tsx` does **not exist**. There are **no routes** for `/onboarding` or `/workspace/*` in `apps/admin/app/`.
3. **Admin Dashboard Exposed at `/`**: `apps/admin/app/page.tsx` serves the SaaS Platform Control Plane dashboard directly at `/`, displaying metrics for the entire multi-tenant system and hardcoding a "Platform Owner" security badge.
4. **Incomplete Post-Authentication Redirects in `apps/web`**:
   - `apps/web/components/auth/login-form.tsx` redirects users without `clientId` to `/${locale}/onboarding` on `apps/web:3001` (where no such page exists, producing a 404). Users with `clientId` are redirected to `/${locale}/admin`, which `proxy.ts` redirects to `apps/admin:3003` at `/`, dropping tenants directly into the SaaS platform admin dashboard.
   - Google and Facebook OAuth callbacks unconditionally redirect to `NEXT_PUBLIC_ADMIN_URL` root (`/`).
5. **No Cell Migration UI or Execution Endpoint**:
   - `apps/admin/app/admin/cells/` has no migration status badges and no manual execution triggers.
   - There is no endpoint in `apps/web/app/api/admin/cells/` or `apps/admin/app/api/` for executing or querying cell schema migrations against `packages/domain/drizzle-cell/`.
6. **Reusable Foundation Exists in Domain**:
   - `TenantCapabilityGateService` is implemented in `packages/domain/src/services/tenant-capability-gate.service.ts`.
   - `CatalogAndMediaService` has HMAC-SHA256 `signImgproxyUrl` implemented.
   - `S3StorageService` handles SeaweedFS S3 operations.
   - `AiEnhanceTextarea` exists at `apps/admin/components/ai-enhance-textarea.tsx` and connects to `/api/ai/enhance`.
   - Cell migrations are defined in `packages/domain/drizzle-cell/` (0000 to 0009).

---

## 2. Investigation of `apps/admin/app/layout.tsx` & Role Fallback

### 2.1 File Location & Observations
- **Path**: `apps/admin/app/layout.tsx`
- **Lines 44–54**:
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
- **Line 86**:
```tsx
<AdminShell currentUser={currentUser}>{children}</AdminShell>
```

### 2.2 Mechanism & Vulnerability
1. When any user signs in (including tenant owners such as `Synergia Market` or self-service signups), `authService.validateSession(sid)` validates the cookie against `db-portal`.
2. `fetchUserActivePlatformRoles(user.id)` queries `admin.platform_user_roles`. Because tenant users are not platform operators, this query returns an empty array `[]`.
3. Because `roles.length === 0`, `role` retains its initial variable assignment: `"platform_owner"`.
4. In `RootLayout`, the user is rendered inside `<AdminShell currentUser={currentUser}>{children}</AdminShell>`.
5. As a consequence, tenant owners and prospect users receive platform operator navigation, access to the platform control plane (`/admin/*`), and view platform KPIs.

---

## 3. Session Resolution, Auth Context & Middleware

### 3.1 `apps/admin/proxy.ts`
- **Path**: `apps/admin/proxy.ts`
- **Lines 25–65**:
  - The proxy inspects the request for `__Host-mocter_sid` or `mocter_sid`.
  - If missing on non-API routes, it redirects to `${loginBase}/es/login?return_to=...`.
  - If `sid` is present, it simply calls `NextResponse.next()`.
- **Limitation**: The proxy performs **zero authorization checks**, **zero role validation**, and **zero route dispatching**. A tenant user requesting `/admin/cells` or `/admin/users` passes straight through.

### 3.2 Status of `resolveAuthenticatedPortalContext`
- **Required By**: `TNT-RF-02.1`, `TNT-001 design.md §2.3`
- **Current State**: **Does not exist anywhere in the codebase**.
- **Requirement**: Must be implemented in `@mocter/domain` (`packages/domain/src/services/session-context.service.ts`) to resolve:
  1. `scope: "platform"`: when user has active roles in `admin.platform_user_roles` (`platform_owner`, `platform_admin`, `platform_sales`).
  2. `scope: "tenant"`: when user has an associated `activeClientId` with `lifecycleStatus === 'activo'`. Includes `capabilities` and `limits`.
  3. `scope: "onboarding_prospect"`: when user has `activeClientId === null` or `lifecycleStatus === 'alta'`.

---

## 4. Shell Architecture: `AdminShell.tsx` vs `TenantWorkspaceShell.tsx`

### 4.1 Existing `AdminShell.tsx`
- **Path**: `apps/admin/components/admin-shell.tsx`
- **Lines 69–75**:
```typescript
const user: CurrentUserDto = currentUser || {
  id: "01a19874-1077-744c-8514-d4c990cd7259",
  email: "soporte@mocter.co",
  displayName: "Platform Owner",
  role: "platform_owner",
  status: "active",
};
```
- **Navigation Items (Lines 121–193)**:
  Exclusively SaaS corporate administration:
  - `/` (Plano de Control / Dashboard)
  - `/admin/leads` (Bandeja Leads)
  - `/admin/orders` (Suscripciones y Ventas)
  - `/admin/billing` (Facturación y Planes)
  - `/admin/cells` (Celdas de Datos)
  - `/admin/conversations` (Chatwoot Omnicanal)
  - `/admin/tenants` (Inquilinos y Comercios)
  - `/admin/users` (Usuarios y Roles RBAC)
  - `/admin/ai` (Inteligencia y Prompts)
  - `/admin/referrals` (Programa de Referidos)
  - `/admin/reports` (Informes y Analítica)
  - `/admin/settings/notifications` (Correos y SMTP)
  - `/admin/settings/branding` (Identidad y Marca)
  - `/design-system` (Sistema de Diseño)

### 4.2 Status of `TenantWorkspaceShell.tsx`
- **Path**: `apps/admin/components/tenant-workspace-shell.tsx`
- **Current State**: **Does not exist**.
- **Required Architecture (ADM-001 D-35, TNT-RF-04.1)**:
  Must be an independent `.tsx` client component featuring:
  - **7 Base Modules** (available on all plans, constrained by `plan_limits`):
    - `/workspace` (Tablero / KPI Overview)
    - `/workspace/products` (Catálogo de Productos y Multimedia)
    - `/workspace/contacts` (Contactos CRM)
    - `/workspace/orders` (Pedidos y Ventas)
    - `/workspace/bot` (Asistente AI y Contexto de Atención)
    - `/workspace/team` (Equipo y Agentes)
    - `/workspace/billing` (Mi Plan y Cuotas Comerciales)
  - **4 Optional Modules** (filtered dynamically by `TenantCapabilityGateService`):
    - `/workspace/conversations` (Bandeja Chatwoot embebida en iframe)
    - `/workspace/branding` (Marca Blanca y Personalización)
    - `/workspace/community` (Comunidad y Feed)
    - `/workspace/reports` (Informes y Exportación)
  - Responsive HUD layout: Mobile-first header with drawer + desktop persistent 260px sidebar + Tenant User Profile Modal.

---

## 5. Route Hierarchy & Component Tree Separation

### 5.1 Current Route Tree in `apps/admin/app/`
```
apps/admin/app/
├── layout.tsx                     <- Global layout wrapping all in AdminShell
├── page.tsx                       <- SaaS Control Plane (AdminHomePage)
├── global-error.tsx
├── admin/
│   ├── ai/page.tsx
│   ├── billing/page.tsx
│   ├── cells/page.tsx
│   ├── conversations/page.tsx
│   ├── leads/page.tsx
│   ├── orders/page.tsx
│   ├── plans/page.tsx
│   ├── referrals/page.tsx
│   ├── reports/page.tsx
│   ├── settings/
│   │   ├── branding/page.tsx
│   │   └── notifications/page.tsx
│   ├── tenants/page.tsx
│   └── users/page.tsx
└── design-system/page.tsx
```

### 5.2 Missing Routes
- **`/onboarding`**: 0 files exist under `apps/admin/app/onboarding`.
- **`/workspace` and `/workspace/*`**: 0 files exist under `apps/admin/app/workspace`.

### 5.3 Required Router / Guard Architecture (`TNT-D-01`)
To strictly separate `.tsx` trees:
1. `apps/admin/app/page.tsx` must guard against non-platform users: if `scope !== 'platform'`, redirect immediately to `/onboarding` (if `onboardingRequired`) or `/workspace`.
2. `/admin/*` routes must enforce `scope === 'platform'`.
3. `/onboarding` must enforce `scope === 'onboarding_prospect'` or `lifecycle_status === 'alta'`. If already `activo`, redirect to `/workspace`.
4. `/workspace/*` must enforce `scope === 'tenant'` and `lifecycle_status === 'activo'`.

---

## 6. Onboarding Implementation (`/onboarding`)

### 6.1 Current Status
- `apps/admin/app/onboarding/` does **not exist**.
- `TenantOnboardingWizard.tsx` does **not exist**.
- `packages/domain/src/services/onboarding-and-limits.service.ts` contains `AdminOnboardingAndLimitsService` implemented using in-memory `Map` collections (`onboardingStore`, `routingCache`, `cellsStore`) without persistent database transactions.

### 6.2 Existing Building Blocks
1. **`AiEnhanceTextarea`** (`apps/admin/components/ai-enhance-textarea.tsx`):
   - Fully implemented, tested, Title Case compliant, supports `hasInferenceAccess` check, and comparison modal with accept/edit/discard workflow.
   - Connected to Route Handler `apps/admin/app/api/ai/enhance/route.ts`.
2. **Bot Presets Catalog**:
   - Defined in `packages/domain/src/db/schemas/admin/bot-catalog.ts` (`botPresets`).
   - Seed data in `packages/domain/src/services/bot-catalog.seed.ts` (e.g., presets for customer service, lead qualification).
3. **`client_business_info` Schema**:
   - Defined in `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts` for cell storage (`payment_methods`, `shipping_policy`, `returns_policy`, `warranty_policy`, `order_message`).
4. **Reserved Lead Labels**:
   - `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada` in `onboarding-and-limits.service.ts`.

### 6.3 Required 3-Step Wizard Flow
- **Step 1: Business Profile & Cell Allocation**:
  - Manual Signup (`lifecycle_status = 'alta'`): Fields (`displayName`, `slug`, `plan`, `cell`) pre-populated from `admin.clients`.
  - Self-Service Signup (`activeClientId = null`): Selects name, slug, currency, timezone, plan, allocates cell (`cell-01`), creates `admin.clients`, registers `admin.client_routing` and `admin.client_plans`.
- **Step 2: First Product with AI Assist**:
  - Name, price in cents, currency, description with `AiEnhanceTextarea`.
  - Persists directly into `pg-cell-XX` table `admin.products` under RLS (`current_client_id`).
- **Step 3: Bot Preset & Tenant Activation**:
  - Selection of customer support preset, business hours, and payment policies.
  - Persists into `pg-cell-XX` table `admin.client_business_info`.
  - Updates `admin.clients.lifecycle_status` from `'alta'` to `'activo'` in `db-portal`.
  - Deterministically redirects to `/workspace`.

---

## 7. Workspace Modules, Capability Gating & Media Pipeline

### 7.1 Workspace Pages Needed
Under `apps/admin/app/workspace/`:
- `page.tsx`: Workspace Dashboard (KPI summary: active products, orders, contacts, storage usage).
- `products/page.tsx`: Product Catalog, stock management, media upload gallery.
- `contacts/page.tsx`: CRM customer list, lead status tags (`lead-frio`, `lead-caliente`, etc.).
- `orders/page.tsx`: Orders table, order status tracking.
- `bot/page.tsx`: Bot preset configuration, system prompt customization, business policies.
- `team/page.tsx`: Agent list and email invitation modal (enforcing `max_tenant_agents`).
- `billing/page.tsx`: Current plan summary, usage vs `plan_limits`, upgrade options.
- `conversations/page.tsx`: Embebed Chatwoot iframe (`/api/auth/chatwoot/embed`).
- `branding/page.tsx`: Logo, primary colors, white-label configuration.
- `community/page.tsx`: Tenant community posts and feed.
- `reports/page.tsx`: Sales and inventory reporting.

### 7.2 Capability Gating Implementation
- `TenantCapabilityGateService` (`packages/domain/src/services/tenant-capability-gate.service.ts`):
  - `assertCapability(clientId, capabilityCode)`: returns `Result<true>` or `CAPABILITY_NOT_INCLUDED`.
  - `getEffectiveCapabilities(clientId)`: combines plan capabilities from `plan_capability_values` with active `client_feature_overrides`.
  - `filterNavItems(clientId, items)`: filters out navigation links where `capabilityCode` is false.
- Must be integrated into `TenantWorkspaceShell.tsx` and server-side route layouts.

### 7.3 Data Access Layer Gap: Cell Connection Pooling
- Currently, `DrizzleTenantProductsRepository` in `packages/domain/src/services/tenant-products-and-media.service.ts` (line 261) defaults to `getDb()` (`db-portal`).
- For cell isolation, it must connect via `CellDatabasePoolManager.withTenantCellTransaction(clientId, ...)` executing `SELECT set_config('app.current_client_id', clientId, true)` on `pg-cell-XX`.

### 7.4 Media Pipeline: SeaweedFS S3 + imgproxy HMAC
- **S3 Upload**: `S3StorageService` in `packages/domain/src/services/s3-storage.service.ts` uploads to bucket `media`.
- **HMAC Signer**: `CatalogAndMediaService.signImgproxyUrl` in `packages/domain/src/services/catalog-and-media.service.ts` (lines 715–770) generates HMAC-SHA256 signatures for `imgproxy` URLs formatted as `s3://media/<storageKey>`.
- **Endpoint needed**: `/api/tenant/media` to handle multipart file uploads, execute magic-byte validation, store in SeaweedFS, record metadata in `admin.product_media`, increment `admin.client_usage`, and return the signed imgproxy URL.

---

## 8. Cell Migration UI (`/admin/cells`)

### 8.1 Current Implementation in `apps/admin/app/admin/cells/`
- `page.tsx`: Lists cells from `/api/admin/cells` and displays:
  - Code, Host, Tier, Topology, PgBouncer host/port, Database name, Capacity, Region, Status.
  - Status badge only shows `c.status` (`active`, `draft`, `provisioning`, `verifying`, `draining`, `maintenance`, `error_connection`).
- `cell-actions.tsx`:
  - Actions supported:
    1. Manifiesto (`/api/admin/cells/[id]/manifest`)
    2. Reverificar / Verificar Conexión (`/api/admin/cells/[id]/handshake`)
    3. Editar Célula (`PATCH /api/admin/cells/[id]`)
    4. Drenar Célula (`POST /api/admin/cells/[id]/action` with `action: "drain"`)
    5. Eliminar Célula (`DELETE /api/admin/cells/[id]`)
- **Missing Features**:
  1. **No Migration Status Badge**: Does not query or indicate whether the cell has pending migrations against `packages/domain/drizzle-cell/`.
  2. **No Migration Trigger**: No UI button or modal to execute migrations.
  3. **No Migration API Endpoint**: No `/api/admin/cells/[id]/migrate` endpoint in `apps/web/app/api/admin/cells/` or `apps/admin/app/api/admin/cells/`.

### 8.2 Migration Mechanism Reference
- In `packages/domain/scripts/migrate.mjs`:
  ```javascript
  const migrationsFolder = fileURLToPath(new URL("../drizzle-cell", import.meta.url));
  await migrate(drizzle(sql), { migrationsFolder });
  ```
- Drizzle stores migration journal entries in `drizzle.__drizzle_migrations`.
- An inspection service can query `drizzle.__drizzle_migrations` on the target cell database and compare against the journal in `packages/domain/drizzle-cell/meta/_journal.json`.

---

## 9. `apps/web/` Post-Authentication Redirects

### 9.1 `apps/web/proxy.ts`
- Lines 28–79 intercept `/admin`, `/es/admin`, `/en/admin`:
  - If no `sid`: redirects to `/es/login?return_to=...`.
  - If `sid` present: strips `/admin` prefix and redirects to `NEXT_PUBLIC_ADMIN_URL` (`http://localhost:3003`).
- **Issue**: It sends everyone to the root `/` of `mocter-admin`, which currently renders the platform operator dashboard.

### 9.2 `apps/web/components/auth/login-form.tsx`
- Lines 78–104:
```typescript
let target = returnTo;
if (!target) {
  const userRole = data.data?.user?.role || "";
  const clientId = data.data?.clientId;

  if (userRole.startsWith("platform_")) {
    target = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co";
  } else if (!clientId) {
    target = `/${locale}/onboarding`; // 404 on apps/web!
  } else {
    target = `/${locale}/admin`;      // Redirects to admin root / -> platform dashboard!
  }
}
window.location.href = target;
```
- **Issues**:
  1. If `!clientId`: redirects to `/${locale}/onboarding` on port 3001, which does not exist (404). It must redirect to `${adminBase}/onboarding`.
  2. If `clientId` exists: redirects to `/${locale}/admin` which forwards to `${adminBase}/`. Without portal dispatching, the tenant user lands on the SaaS platform dashboard. It should redirect to `${adminBase}/workspace` (or `${adminBase}/onboarding` if `lifecycle_status === 'alta'`).

### 9.3 OAuth Callbacks (`google/callback` and `facebook/callback`)
- Lines 235–237 of `google/callback/route.ts` and line 230 of `facebook/callback/route.ts`:
```typescript
NextResponse.redirect(new URL(process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003"), {
  status: 303,
});
```
- **Issue**: Unconditionally redirects to `http://localhost:3003` (root `/`). Needs to redirect to the authoritative portal router or specific destination based on user scope.

---

## 10. Summary Matrix of Gaps & Required Actions

| Component | Current State | Required State (`TNT-001`) | Severity |
|---|---|---|---|
| `apps/admin/app/layout.tsx` | Role defaults to `platform_owner`; all users wrapped in `AdminShell` | Use `resolveAuthenticatedPortalContext(sid)`; remove `platform_owner` fallback | **Critical** |
| `PortalShellRouter` | Missing | Server component dispatching `AdminShell`, `TenantWorkspaceShell`, or bare layout based on scope | **Critical** |
| `TenantWorkspaceShell.tsx` | Missing | Independent client component with 7 base modules + 4 gated modules | **High** |
| `apps/admin/app/onboarding` | Missing (404) | 3-step wizard with `AiEnhanceTextarea`, bot preset, and cell persistence | **High** |
| `apps/admin/app/workspace/*` | Missing (404) | Base & gated workspace pages backed by cell queries | **High** |
| `apps/admin/app/admin/cells` UI | Shows lifecycle status only; no migration badge or trigger | Add pending migration badge & "Ejecutar Migración" trigger modal | **Medium** |
| Cell Migration API | Missing `/migrate` endpoint | Route handler to inspect & apply `drizzle-cell` migrations | **Medium** |
| `apps/web` Post-Login Redirects | Sends prospects to 404 on web; tenants to platform dashboard | Deterministically route to `${adminBase}/onboarding` or `/workspace` | **High** |
| `DrizzleTenantProductsRepository` | Queries `getDb()` (`db-portal`) | Query `pg-cell-XX` via `CellDatabasePoolManager` under RLS | **Critical** |
| `/api/tenant/*` Routes | Missing (only `/api/admin/tenants/[id]/*` exists) | Route handlers resolving context from session `activeClientId` | **High** |
