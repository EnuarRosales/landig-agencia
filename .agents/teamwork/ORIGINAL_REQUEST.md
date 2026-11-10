# Original User Request

## Initial Request — 2026-11-08T23:54:47Z

Implement the tenant operating environment stabilization plan (`TNT-001`, `implementation_plan.md`) across `db-portal` and `pg-cell-XX`, ensuring physical cell data plane isolation, unified 3-step onboarding, strict separation between SaaS admin and tenant workspace backoffices, and cell migration tracking with manual execution.

Integrity mode: development

Reference material:
- Plan: `C:/Users/Alejo/.gemini/antigravity/brain/4cad3cf2-ddc3-4764-9c64-ab36c567a567/implementation_plan.md`
- Specifications: `docs/specs/tnt-001-entorno-operativo-inquilino/` (`requirements.md`, `design.md`, `tasks.md`), `docs/specs/adm-001-mocter-admin/`, `docs/specs/auth-001-autenticacion-hibrida/`, `.agents/AGENTS.md`

## Requirements

### R1. Physical Cell Data Plane Isolation, Connection Pool, and Identity Promotion
Establish `CellDatabasePoolManager` to dynamically connect to the PgBouncer endpoint of the tenant's assigned active cell (`pg-cell-XX`), decrypting secrets in memory and enforcing `SELECT set_config('app.current_client_id', clientId, true)` on all cell operations under `FORCE ROW LEVEL SECURITY`. Provision tenant owner records and base configuration in `pg-cell-XX` on manual tenant creation (in state `lifecycle_status = 'alta'`) and self-service registration, promote credentials directly to the cell upon password setup, and execute an idempotent reconciliation routine for existing tenants (`Synergia Market` / `synergiamarket25@gmail.com`) to materialize them in `pg-cell-01`.

### R2. Authoritative Session Dispatch and UI Component Tree Separation
Eliminate default role fallback (`role = 'platform_owner'`) in `apps/admin/app/layout.tsx`. Implement server-side authoritative session resolution (`resolveAuthenticatedPortalContext`) strictly partitioning user scopes: platform operators (`scope = 'platform'`) access `/admin/*` via `AdminShell.tsx`; prospect or pending-onboarding tenants access `/onboarding`; active tenant users (`scope = 'tenant'`) access `/workspace/*` via `TenantWorkspaceShell.tsx`. Intercept unauthorized cross-scope navigations with deterministic server-side redirects.

### R3. Unified 3-Step Onboarding Wizard (`/onboarding`)
Deliver a responsive, mobile-first onboarding assistant at `/onboarding` (`TenantOnboardingWizard.tsx`) supporting both manual registrations (Step 1 pre-populated from `admin.clients`) and self-service signups (Step 1 selecting business name, slug, and plan, allocating cell and routing). Step 2 creates the tenant's first product with AI assistance on the description textarea. Step 3 configures bot customer-service presets and activates the tenant (`lifecycle_status = 'activo'`), redirecting immediately to `/workspace`.

### R4. Tenant Workspace Backoffice, Capability Gating, and Media Pipeline
Implement the tenant backoffice under `/workspace/*` rendered with `TenantWorkspaceShell.tsx`. Provide base modules (dashboard, products, contacts CRM, orders, bot, team, billing) constrained by plan quotas (`plan_limits`). Gate optional modules (conversations/Chatwoot, branding, community, reports) dynamically via `TenantCapabilityGateService` based on plan feature flags. Integrate product media uploads with SeaweedFS S3 storage and serve public media via HMAC-SHA256 signed imgproxy URLs.

### R5. Cell Schema Migration Detection and Controlled Manual Execution
Implement an automated mechanism in the platform administration plane to inspect the status of active cell schemas against `packages/domain/drizzle-cell/` migration journals. Present a visual indicator or badge identifying cells with pending migrations, and provide a secure, controlled manual trigger from the admin portal to execute pending migrations on the selected cell database.

## Acceptance Criteria

### Cell Isolation and Identity Promotion
- [ ] DML queries on `pg-cell-XX` enforce `SET LOCAL app.current_client_id` under `FORCE ROW LEVEL SECURITY`; queries without client context return 0 rows.
- [ ] Tenant credentials Argon2id hashes for cell-promoted users reside exclusively in `pg-cell-XX` (`admin.users`), with `password_hash = NULL` in `db-portal`.
- [ ] Existing tenant `Synergia Market` (`synergiamarket25@gmail.com`) is reconciled in `pg-cell-01` with `identity_location = 'cell-01'` and reflected as `tenant_owner` in `/admin/users`.

### Shell Separation and Access Guards
- [ ] Non-platform users attempting to access `/admin/*` or `/` are blocked and redirected to `/onboarding` or `/workspace`.
- [ ] Platform operators accessing `/admin/*` render `AdminShell.tsx`; active tenants accessing `/workspace/*` render `TenantWorkspaceShell.tsx` without layout or navigation leakage.
- [ ] Post-authentication redirects from `apps/web` direct deterministically to `/onboarding`, `/workspace`, or `/admin` according to user scope and lifecycle status.

### Onboarding Flow
- [ ] Both manual and self-service tenants complete the 3 onboarding steps in under 5 minutes without technical errors.
- [ ] Completing Step 3 transitions `admin.clients.lifecycle_status` from `alta` to `activo` and persists business settings to `pg-cell-XX`.

### Workspace Modules and Media Delivery
- [ ] Base workspace pages allow management of products, contacts, and bot settings backed by live queries to `pg-cell-XX`.
- [ ] Optional modules appear in navigation only when permitted by tenant plan feature flags.
- [ ] Uploaded product images persist in SeaweedFS bucket `media` and render with HTTP 200 via HMAC-signed imgproxy URLs.

### Cell Migration Operations
- [ ] Active cells in `/admin/cells` automatically display their migration status and indicate whether schema updates are pending.
- [ ] Manual migration trigger successfully applies pending `drizzle-cell` migrations to the target cell database and updates migration status.

### Verification and Operational Health
- [ ] Automated domain test suite (`pnpm --filter @mocter/domain test`) and code linting (`pnpm lint`) pass with zero errors.
- [ ] Docker services (`mocter-core-admin-portal-1`, `mocter-core-web-portal-1`) compile, restart, and return HTTP 200 on `/api/health` without exceptions in logs (AGENTS.md §4.18).
- [ ] End-to-end verification scenarios A through D from the implementation plan pass with verified database state.
