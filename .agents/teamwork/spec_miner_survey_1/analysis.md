# TNT-001 Specification Survey & Feature Analysis Report

**Date:** 2026-11-08  
**Author:** Specification Miner Subagent (`spec_miner_survey_1`)  
**Target:** Tenant Operating Environment Stabilization (`TNT-001`, `ADM-001`, `AUTH-001`, `DAT-001`, `CEL-001`, `AI-001`, `DSN-001`)  
**Working Directory:** `d:\3. Develoment\mocter-system\mocter-core`  
**Integrity Mode:** Development / Zero-Mock Production Parity  

---

## 1. Executive Summary

This report establishes the authoritative specification matrix for the **Tenant Operating Environment Stabilization** (`TNT-001`). During laboratory testing on active cell `cell-01` (`pg-cell-01`), five structural discrepancies were diagnosed between the Control Plane (`db-portal`) and the Cell Data Plane (`pg-cell-XX`):
1. **Uncontrolled SaaS Backoffice Redirection:** `apps/admin/app/layout.tsx` improperly fell back to `role = "platform_owner"` when users lacked platform roles, granting tenant owners illicit access to `AdminShell.tsx` and `AdminHomePage.tsx`.
2. **Absence of UI Tree Separation:** Platform operators and tenant operators shared the same root shell instead of distinct, isolated `.tsx` trees.
3. **Missing Physical Cell Data Provisioning:** `createAdminTenant()` persisted data solely to `db-portal`, leaving `pg-cell-01` with 0 rows in `admin.users`, `admin.tenant_users`, `admin.tenant_labels`, and `admin.client_business_info`, while repositories defaulted to `getDb()` (`db-portal`).
4. **Disconnected Onboarding Flow:** `AdminOnboardingAndLimitsService` was an in-memory stub not connected to PostgreSQL or Next.js routes; manual tenant creation defaulted to `lifecycle_status = 'activo'` instead of `'alta'`.
5. **Incomplete Self-Service Signup:** Users registered via `/es/register` remained with `active_client_id = NULL` and faced broken redirects or 404s.

The stabilization plan resolves these issues through 5 core requirements (`R1` to `R5`), establishing strict data plane isolation under `FORCE ROW LEVEL SECURITY`, authoritative server-side session dispatching, unified 3-step onboarding, a quota-gated tenant backoffice with private S3/HMAC-signed media delivery, and automated cell migration tracking with controlled execution.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Cell Isolation | `CellDatabasePoolManager.getCellDb` | Dynamically obtains or instantiates a Drizzle ORM client connected to the PgBouncer endpoint of an active cell, decrypting secrets in memory. | `cellId: string` | `PostgresJsDatabase<typeof schema>` | Throws `CellUnavailableError` or connection error if cell not found or unreachable. | `TNT-RF-01.1`, `ADM-001 D-37`, `implementation_plan.md §3.1` |
| 2 | Cell Isolation | `CellDatabasePoolManager.withTenantCellTransaction` | Resolves tenant active cell, opens a transaction, and executes `SELECT set_config('app.current_client_id', clientId, true)` prior to executing callback. | `clientId: string`, `callback: (tx, cell) => Promise<T>` | `Promise<T>` | Aborts transaction, rolls back on error, propagates failure. | `TNT-RF-01.2`, `DAT-001 RF-10.11`, `tasks.md TNT-T-01` |
| 3 | Identity Promotion | `provisionTenantInCellDataPlane` | Idempotently provisions tenant base tables in `pg-cell-XX` (`admin.users`, `admin.tenant_users` as `tenant_owner`, 4 reserved `admin.tenant_labels`, `admin.client_business_info`). | `cellId: string`, `clientId: string`, `ownerUser: User`, `actor: string` | `Promise<void>` | Fails closed on database exception; rolls back cell transaction. | `TNT-RF-01.3`, `ADM-001 D-36`, `implementation_plan.md §3.1` |
| 4 | Data Migration | `reconcileProvisionedTenantsInCells` | Scans registered clients in `admin.client_routing`, checks materialization in `pg-cell-XX`, provisions missing rows, updates `identity_location`, and ensures `lifecycle_status = 'alta'` if no products exist (specifically reconciles `Synergia Market`). | None (system startup or audit trigger) | `Promise<{ reconciled: number; errors: string[] }>` | Logs error per tenant, continues reconciliation for remaining tenants. | `TNT-RF-01.6`, `implementation_plan.md §3.1` |
| 5 | Identity & Auth | Cell Credential Persistence in `AuthService.resetPassword` | When setting up or resetting password for tenant users (`purpose = 'setup' \| 'reset'`), hashes password with Argon2id and stores it in `pg-cell-XX` (`admin.users`), keeping `password_hash = NULL` in `db-portal`. | `token: string`, `password: string` | `Result<{ message: string }>` | Returns `err("TOKEN_EXPIRED")`, `err("INVALID_TOKEN")`, or `err("DB_ERROR")`. | `TNT-RF-01.4`, `AUTH-001 AUTH-D-01`, `AUTH-D-09` |
| 6 | Auth & RBAC | `fetchRbacOverview` Cell Role Enrichment | Enriches user overview to display `tenant_owner (<Client Name>)` and cell code (`cell-01 · <uuid>`) instead of `Sin Rol` and `router`. | None | `Promise<RbacOverviewDto>` | Returns empty list or fallback on DB failure. | `TNT-RF-01.5`, `implementation_plan.md §1.2` |
| 7 | Session Dispatch | `resolveAuthenticatedPortalContext` | Authoritatively resolves user profile from session cookie: platform operator (`scope = 'platform'`), prospect (`scope = 'onboarding_prospect'`), or tenant (`scope = 'tenant'`). | `sid: string` | `PortalContextDto` (`scope`, `role`, `clientId`, `lifecycleStatus`, `capabilities`, `limits`, `onboardingRequired`) | Returns `scope: "anonymous"` or redirects to login if session invalid. | `TNT-RF-02.1`, `ADM-001 D-35`, `design.md §2.3` |
| 8 | UI Separation | `PortalShellRouter.tsx` | Server/client component wrapping `mocter-admin` that bifurcates UI rendering into `AdminShell.tsx`, `TenantOnboardingWizard.tsx`, or `TenantWorkspaceShell.tsx`. | `portalContext: PortalContextDto`, `children: ReactNode` | `React.JSX.Element` | Deterministic redirect to `/onboarding` or `/workspace` on unauthorized navigation. | `TNT-RF-02.3`, `ADM-001 D-35`, `requirements.md CA-TNT-01` |
| 9 | UI Guard | `AdminHomePage` Server Guard | Server-side check at `/` (`apps/admin/app/page.tsx`): redirects prospects to `/onboarding`, active tenants to `/workspace`, and platform operators to SaaS dashboard. | HTTP Request (session cookie) | Server Redirect or Dashboard UI | Unauthenticated redirected to `/login`. | `TNT-RF-02.4`, `implementation_plan.md §3.2` |
| 10 | Onboarding Flow | `getOnboardingState` | Retrieves current onboarding step (1, 2, or 3), public plans, pre-populated client metadata (for manual tenant), and cell product status. | `userId: string` | `OnboardingStateDto` | Returns `err("USER_NOT_FOUND")` or `err("DB_ERROR")`. | `TNT-RF-03.1`, `design.md §2.4` |
| 11 | Onboarding Flow | `completeStep1Business` | Step 1: Configures business name, slug, currency, timezone, and plan. For self-service, provisions `admin.clients` (`lifecycle = 'alta'`), routes cell, provisions `pg-cell-01`, promotes credentials. For manual, updates metadata. | `userId: string`, `input: Step1Input` | `Result<{ clientId: string; nextStep: 2 }>` | Returns validation error if slug duplicate or plan invalid. | `TNT-RF-03.2`, `TNT-RF-03.3`, `ADM-001 D-36` |
| 12 | Onboarding Flow | `completeStep2FirstProduct` | Step 2: Creates tenant's first product in `pg-cell-XX` (`admin.products`) under RLS with AI description assistance; updates `admin.client_usage`. | `userId: string`, `input: Step2Input` | `Result<{ productId: string; nextStep: 3 }>` | Fails if client not in state `alta` or quota exceeded. | `TNT-RF-03.4`, `AI-001`, `requirements.md §3.3` |
| 13 | Onboarding Flow | `completeStep3BotAndActivate` | Step 3: Configures bot customer care context in `pg-cell-XX` (`admin.client_business_info`), transitions `admin.clients.lifecycle_status` to `'activo'`, redirects to `/workspace`. | `userId: string`, `input: Step3Input` | `Result<{ redirectUrl: "/workspace" }>` | Fails if Step 1 or Step 2 incomplete. | `TNT-RF-03.5`, `ADM-001 RF-14.13` |
| 14 | Onboarding UI | `TenantOnboardingWizard.tsx` | Mobile-First responsive wizard component rendering at `/onboarding` without admin sidebar; Title Case labels, AI button on description textarea. | Initial state from API | Wizard UI | Inline error banner on validation failure. | `TNT-RF-03.1`, `DSN-001`, `tasks.md TNT-T-03` |
| 15 | Tenant Workspace | `TenantWorkspaceShell.tsx` | Independent `.tsx` shell for tenant backoffice displaying business name, plan badge, cell code (`cell-01`), and navigation. | `tenantContext: TenantPortalContext`, `children: ReactNode` | Backoffice Shell UI | Hides unauthorized modules dynamically. | `TNT-RF-04.1`, `ADM-001 D-35`, `design.md §3` |
| 16 | Capability Gating | `TenantCapabilityGateService` | Evaluates whether optional modules (`conversations`, `branding`, `community`, `reports`) are enabled for the tenant's plan in `plan_feature_values` / `client_feature_overrides`. | `clientId: string`, `featureKey: string` | `boolean` (hasCapability) | Fails closed (returns `false` if unconfigured). | `TNT-RF-04.2`, `ADM-001 D-37`, `requirements.md CA-TNT-05` |
| 17 | Quota Enforcement | `TenantWorkspaceService` Quota Checks | Validates numerical quotas (`products`, `images_per_product`, `contacts`, `tenant_users`, `storage_bytes`) against `plan_limits` before persisting in `pg-cell-XX`. | `clientId: string`, `dimension: string`, `requestedAmount: number` | `Result<{ allowed: boolean }>` | Rejects mutation with `QUOTA_EXCEEDED` error and clear message. | `TNT-RF-04.1`, `ADM-001 RF-04.1–04.3` |
| 18 | Media Pipeline | S3 Upload to SeaweedFS | Validates magic bytes, uploads raw binary to SeaweedFS private bucket `media` via `S3StorageService`, stores metadata in `admin.media_catalog` (`db-portal`) and `admin.product_media` (`pg-cell-XX`). | `file: Buffer \| Blob`, `metadata: MediaMetadata` | `Result<MediaRecordDto>` | Rejects invalid mime types, viruses, or oversized files (> 10MB images, > 100MB videos). | `TNT-RF-04.3`, `CEL-001 §3.5`, `ADM-001 RF-07.12–07.20` |
| 19 | Media Delivery | HMAC-SHA256 imgproxy Signer | Generates authenticated, time-limited imgproxy URLs for public image delivery with authorized resize/crop/format options. | `s3Path: string`, `options: ImgproxyOptions` | `string` (Signed URL) | Returns 403 on signature mismatch; never exposes SeaweedFS S3 to public. | `TNT-RF-04.3`, `CEL-001 CEL-RF-019`, `ADM-001 RF-07.19` |
| 20 | Workspace Modules | Base Workspace Pages | Implements `/workspace`, `/workspace/products`, `/workspace/contacts`, `/workspace/orders`, `/workspace/bot`, `/workspace/team`, `/workspace/billing` backed by live queries to `pg-cell-XX`. | Session Context | Specialized Workspace Pages | 404 or redirect on invalid route/client. | `TNT-RF-04.1`, `tasks.md TNT-T-04` |
| 21 | Workspace Route Handlers | `/api/tenant/*` Handlers | REST endpoints for products, media, contacts, orders, bot settings, and team management running against PgBouncer pool under RLS. | HTTP Request (CRUD JSON / FormData) | JSON Response | Standard RFC 9457 Problem Details error formats. | `TNT-RF-04.1`, `AGENTS.md §4.14` |
| 22 | Cell Migration | Migration Status Inspection | Inspects active cell database schema against `packages/domain/drizzle-cell/meta/_journal.json` to determine pending migrations. | `cellId: string` | `MigrationStatusDto` (`appliedCount`, `totalCount`, `pendingCount`, `hasPendingMigrations`) | Logs warning, marks cell status `migration_error` if connection fails. | `ORIGINAL_REQUEST.md R5`, `CEL-RF-010` |
| 23 | Cell Migration | Cell Migration Badge in `/admin/cells` | Renders a visual status badge in the cell inventory table indicating whether migrations are up to date ("Al Día") or pending ("N Pendientes"). | `migrationStatus: MigrationStatusDto` | Visual Badge UI | Displays warning icon on pending migrations. | `ORIGINAL_REQUEST.md R5` |
| 24 | Cell Migration | Manual Migration Execution Trigger | Controlled action button in `/admin/cells` allowing a platform operator to execute pending `drizzle-cell` migrations against the target cell database. | `cellId: string`, `actor: string` | `Result<{ appliedMigrations: string[] }>` | Fails closed, records error in audit log, leaves cell in current state on failure. | `ORIGINAL_REQUEST.md R5`, `AGENTS.md R-08` |

---

## 3. Edge Cases & Boundary Behaviors

| # | Feature | Input / Condition | Observed / Documented Behavior |
|---|---------|-------------------|--------------------------------|
| 1 | `withTenantCellTransaction` | Query executed without `SET LOCAL app.current_client_id` | Returns `0 rows` because PostgreSQL enforces `FORCE ROW LEVEL SECURITY` across all tenant tables. |
| 2 | `withTenantCellTransaction` | Query executed with `clientId` of Tenant A while attempting to select Tenant B's rows | PostgreSQL RLS filters out all rows belonging to Tenant B; only Tenant A's records returned. |
| 3 | `CellDatabasePoolManager` | Connecting to cell in local Docker Compose environment | Host `host.docker.internal` resolved via `resolveLocalProbeTarget`, connecting to port `6432` on host without DNS failure. |
| 4 | `CellDatabasePoolManager` | Cell secrets ciphertext corrupted or decryption key mismatched | `cellSecretsCryptoService.decrypt` throws decryption error; connection fails closed, preventing unauthenticated access. |
| 5 | `resolveAuthenticatedPortalContext` | User has no entries in `admin.platform_user_roles` and `active_client_id = NULL` | Resolves to `scope = 'onboarding_prospect'`; never defaults to `platform_owner`. |
| 6 | `resolveAuthenticatedPortalContext` | User has platform role `platform_admin` and attempts to navigate to `/workspace` | Server-side guard recognizes platform scope and redirects to `/` or `/admin/*`. |
| 7 | `PortalShellRouter` | Active tenant user (`lifecycle_status = 'activo'`) attempts direct URL access to `/admin/tenants` | Server-side guard intercepts request, returns 302 redirect to `/workspace`. |
| 8 | `TenantOnboardingWizard` | Manual tenant accesses `/onboarding` | Step 1 renders pre-populated with data from `admin.clients` (`displayName`, `slug`, `plan`, `cellCode`); tenant can adjust or proceed to Step 2 immediately. |
| 9 | `TenantOnboardingWizard` | Self-service prospect accesses `/onboarding` | Step 1 renders empty; user selects business name, custom slug, and public plan; creating Step 1 triggers atomic client and cell allocation. |
| 10 | `completeStep1Business` | Self-service prospect submits existing/taken slug | Returns `400 Bad Request` with message that slug is already in use; does not provision client or cell. |
| 11 | `completeStep1Business` | No cells with status `active` and `current_clients < max_clients` | Returns `err("NO_AVAILABLE_CELL")`; does not create orphaned client. |
| 12 | `completeStep2FirstProduct` | Tenant attempts to create first product with price <= 0 | Input validation rejects non-positive price; ensures ERP attributes are valid. |
| 13 | `AuthService.resetPassword` | Tenant owner sets up password via `/password/setup` | Hash Argon2id written to `pg-cell-XX` (`admin.users`); `db-portal`'s `password_hash` remains `NULL`; `identity_location` updated to cell UUID. |
| 14 | `TenantWorkspaceShell` | Tenant on Free plan accesses `/workspace/conversations` (Chatwoot) | `TenantCapabilityGateService` evaluates plan features; menu item hidden; direct navigation returns 403 or redirects to `/workspace`. |
| 15 | Media Upload | Tenant uploads an `.exe` renamed to `.jpg` | Magic bytes inspection detects binary mismatch; upload rejected with `400 Bad Request`. |
| 16 | Media Quota | Tenant exceeds `storage_bytes` limit of their plan | `TenantWorkspaceService` rejects S3 upload with `QUOTA_EXCEEDED`; storage usage in `admin.client_usage` remains unchanged. |
| 17 | imgproxy Delivery | Client requests media URL with tampered width/height or without HMAC signature | imgproxy returns `403 Forbidden`; unauthorized transformations blocked. |
| 18 | Cell Migration | Operator clicks "Ejecutar Migraciones" on a cell that is already up to date | Service reports `0 migraciones pendientes`; no DDL executed; cell remains active. |
| 19 | Cell Migration | Migration fails mid-execution on target cell | Postgres transaction rolls back; cell migration status marked error; audit record created. |
| 20 | Reconciliation | Existing tenant `Synergia Market` already exists in `db-portal` with `identity_location = 'router'` | Routine provisions `pg-cell-01`, links `identity_location = '6ae5619b-7ca3-4764-baae-1b8950a8e534'`, sets role `tenant_owner`, sets `lifecycle_status = 'alta'`. Re-running routine is completely idempotent. |

---

## 4. Architectural Contracts and Security Invariants

### 4.1 Physical Cell Data Plane Isolation & Connection Pool
- **Contract:** All tenant business operations (`products`, `product_media`, `contacts`, `orders`, `client_business_info`, `tenant_labels`, `tenant_users`) execute strictly on the cell assigned in `admin.client_routing`.
- **Invariants:**
  1. No foreign keys exist between `db-portal` and `pg-cell-XX`, nor between different cells (`DAT-001 RF-03.8`, `CEL-001 §2`).
  2. Connection pooling uses PgBouncer in `transaction` mode; all clients must set `prepare: false` in postgres.js options.
  3. Cell secrets (`cell_secrets_ciphertext`) are decrypted strictly in memory using AES-256-GCM (`cellSecretsCryptoService`) and never leaked to logs, client responses, or disk.
  4. Docker Compose service reachability uses `resolveLocalProbeTarget`: inside container network, target resolves `host.docker.internal:6432` for `local_compose`.

### 4.2 Row-Level Security (RLS) Enforcement Contract
- **Contract:** All tables in `pg-cell-XX` under schema `tenant` (or `admin` cellular projection) have `FORCE ROW LEVEL SECURITY` enabled.
- **Invariants:**
  1. Every query transaction MUST invoke `SELECT set_config('app.current_client_id', clientId, true)`.
  2. The application database user (`mocter_app`) does NOT possess `BYPASSRLS` or superuser privileges (`DAT-001 RF-10.11`).
  3. Any query executed without setting `app.current_client_id` or with an unassigned client ID returns `0 rows`.

### 4.3 Argon2id Storage Location & Identity Promotion Lifecycle
- **Contract:** Strict partitioning of user credentials by location (`identity_location`):
  1. **Platform Operators (`identity_location = 'router'`):** Credentials stored in `db-portal` (`admin.users.password_hash`).
  2. **Active Tenant Users (`identity_location = '<cell_uuid>'`):** Credentials stored **exclusively** in `pg-cell-XX` (`admin.users.password_hash`). In `db-portal`, `password_hash` is strictly `NULL`.
  3. **Staging Pre-Onboarding (Prospects from `/register`):** Temporarily stored in `db-portal` with `active_client_id = NULL` and `identity_location = 'router'`. Upon Step 1 completion, credentials are atomicaly promoted to `pg-cell-XX` and erased from `db-portal`. If abandoned for 60 days, purged automatically (`AUTH-001 AUTH-D-01`).

### 4.4 Authoritative Session Dispatching & Zero-Trust Shell Separation
- **Contract:** `mocter-admin` is a single top-level portal that authoritatively bifurcates into mutually exclusive `.tsx` component trees:
  - `AdminShell.tsx` + `AdminHomePage.tsx` for `scope: "platform"`.
  - `TenantOnboardingWizard.tsx` for `scope: "onboarding_prospect"` or `lifecycle_status: "alta"`.
  - `TenantWorkspaceShell.tsx` + `app/workspace/*` for `scope: "tenant"` with `lifecycle_status: "activo"`.
- **Invariants:**
  1. No client-side role fallback: `role = "platform_owner"` fallback is completely eradicated.
  2. Cross-scope navigation is blocked on the server side and deterministically redirected.
  3. UI components, sidebars, and topbars between SaaS and Tenant workspaces share no `.tsx` files.

### 4.5 Media Pipeline Architecture (SeaweedFS S3 + imgproxy HMAC)
- **Contract:** Separation of private storage and public delivery:
  1. SeaweedFS S3 endpoint (`:8333`) is private and never exposed to the public internet (`CEL-001 §3.5`, `ADM-001 RF-07.20`).
  2. Browser uploads route through backend `/api/tenant/media` which validates magic bytes, writes to private bucket `media`, and registers metadata.
  3. Delivery occurs via imgproxy (`:8085` / `media.mocter.co`) using HMAC-SHA256 signatures with platform `IMGPROXY_KEY` and `IMGPROXY_SALT`. Unsigned requests return 403.

### 4.6 Dynamic Capability Gating & Quotas
- **Contract:** Workspace modules are partitioned into base (all plans, quota-limited) and optional (capability-gated):
  - **Base:** Dashboard, Products, CRM Contacts, Orders, Bot, Team, Billing.
  - **Gated:** Chatwoot (`chatwoot_inboxes`), Branding (`white_label`), Community (`community_feed`), Reports (`reports`).

---

## 5. End-to-End Verification Scenarios

### Scenario A: Reconciliación y Onboarding de Inquilino Manual `Synergia Market`
1. **Verification of Reconciliation:**
   - In `/admin/users` (`apps/admin`), user `synergiamarket25@gmail.com` displays role `tenant_owner` and location `cell-01`.
   - In database `pg-cell-01`, table `admin.users` contains the record for `synergiamarket25@gmail.com` with `status = 'active'`, `admin.tenant_users` has `role = 'tenant_owner'`, and `admin.tenant_labels` contains the 4 reserved labels.
2. **Session Dispatch & Onboarding Execution:**
   - Log in with `synergiamarket25@gmail.com` at `/es/login`.
   - Server-side guard recognizes `lifecycle_status = 'alta'` and deterministically redirects to `/onboarding`.
   - Step 1 displays pre-loaded business details (`Synergia Market`, slug `synergia-market`, plan assigned). Tenant confirms details.
   - Step 2 prompts for first product. User creates a product using «Mejorar con AI» on the description textarea. Product is inserted into `pg-cell-01` (`admin.products`).
   - Step 3 prompts for bot settings. Tenant selects bot preset and closing message. Submitting Step 3 transitions `admin.clients.lifecycle_status` to `'activo'`.
   - Tenant is immediately redirected to `/workspace` and renders `TenantWorkspaceShell.tsx`.
3. **Access Guard Enforcement:**
   - With the tenant session active, attempting to navigate to `/admin/cells`, `/admin/tenants`, or `/` results in an immediate redirect back to `/workspace`.

### Scenario B: Aislamiento Físico en `pg-cell-01`
1. **Row Count Verification:**
   - Connect directly to `mocter-cell-01-pg-cell-1` (`pg-cell-01`).
   - Verify rows exist in `admin.users`, `admin.tenant_users`, `admin.products`, `admin.contacts`.
2. **RLS Isolation Test:**
   - Execute query without client context:
     ```sql
     SELECT * FROM admin.products;
     ```
     Result: `0 rows returned` (due to `FORCE ROW LEVEL SECURITY`).
   - Execute query with valid client context:
     ```sql
     SET LOCAL app.current_client_id = '<synergia_client_id>';
     SELECT count(*) FROM admin.products;
     ```
     Result: Count reflects the created product.
   - Execute query with a different/fake client ID:
     ```sql
     SET LOCAL app.current_client_id = '00000000-0000-0000-0000-000000000000';
     SELECT count(*) FROM admin.products;
     ```
     Result: `0 rows returned`.

### Scenario C: Flujo Multimedia Privado/Público SeaweedFS + imgproxy
1. **Product Media Upload:**
   - In `/workspace/products`, upload a valid product image (`.webp` or `.png`).
   - Verify file is sent to `/api/tenant/media` and persisted in SeaweedFS bucket `media`.
2. **Metadata & Usage Persistence:**
   - Verify record created in `admin.media_catalog` (`db-portal`) with SHA-256 hash.
   - Verify record created in `admin.product_media` (`pg-cell-01`) linked to the product.
   - Verify `admin.client_usage` (`storage_bytes`) incremented by the file size in `pg-cell-01`.
3. **Public Signed Delivery:**
   - The rendered image URL points to `http://localhost:8085/...` with valid HMAC-SHA256 signature.
   - Loading the image in browser returns `HTTP 200 OK` with optimized image binary.
   - Modifying any parameter in the URL returns `HTTP 403 Forbidden`.

### Scenario D: Alta Autónoma desde `/es/register`
1. **Self-Service Registration:**
   - Access `/es/register` and register a new tenant account with email and password.
   - Confirm verification email at `/es/verify-email`.
   - Log in at `/es/login`.
2. **Onboarding Staging Promotion:**
   - User has `active_client_id = NULL`; login redirects to `/onboarding`.
   - Step 1 presents empty fields. User enters business name, chooses slug, selects Free plan.
   - On Step 1 confirmation, system creates `admin.clients` (`lifecycle = 'alta'`), assigns `cell-01`, provisions `pg-cell-01`, and promotes credentials (moves Argon2id hash to `pg-cell-01`, zeroes it in `db-portal`).
3. **Workspace Isolation:**
   - User completes Step 2 and Step 3, lands in `/workspace`.
   - Queries to products, contacts, and orders show only this tenant's data. Zero leakage between Tenant 1 (`Synergia Market`) and Tenant 2.

---

## 6. Acceptance Criteria & Dependency Matrix

### 6.1 Requirement Dependencies
```
[R1: Cell Isolation, Connection Pool & Identity Promotion]
       │
       ├──► [R2: Authoritative Session Dispatch & Shell Separation]
       │           │
       │           ├──► [R3: Unified 3-Step Onboarding Wizard]
       │           │           │
       │           └───────────┴──► [R4: Tenant Workspace Backoffice & Media]
       │
       └──► [R5: Cell Schema Migration Inspection & Controlled Manual Execution]
```

### 6.2 Acceptance Criteria Matrix

| ID | Criteria | Governing Requirement | Verification Target |
|---|---|---|---|
| AC-01 | DML and SELECT queries on `pg-cell-XX` enforce `SET LOCAL app.current_client_id` under `FORCE ROW LEVEL SECURITY`; queries without context return 0 rows. | R1 | Database `pg-cell-01` |
| AC-02 | Tenant Argon2id password hashes for promoted users reside exclusively in `pg-cell-XX` (`admin.users`), with `password_hash = NULL` in `db-portal`. | R1 | `db-portal` and `pg-cell-01` |
| AC-03 | Existing tenant `Synergia Market` is reconciled in `pg-cell-01` with `identity_location = '6ae5619b-7ca3-4764-baae-1b8950a8e534'` and appears as `tenant_owner` in `/admin/users`. | R1 | Admin Portal & `pg-cell-01` |
| AC-04 | Non-platform users attempting to access `/admin/*` or `/` are blocked and redirected to `/onboarding` or `/workspace`. | R2 | Next.js server guards |
| AC-05 | Platform operators render `AdminShell.tsx`; active tenants render `TenantWorkspaceShell.tsx` without layout or navigation leakage. | R2 | Admin Portal UI |
| AC-06 | Post-auth redirects from `apps/web` direct deterministically to `/onboarding`, `/workspace`, or `/admin` according to user scope and lifecycle status. | R2 | Auth redirects |
| AC-07 | Both manual and self-service tenants complete 3 onboarding steps in under 5 minutes without errors. | R3 | `/onboarding` wizard |
| AC-08 | Completing Step 3 transitions `admin.clients.lifecycle_status` from `alta` to `activo` and persists business settings to `pg-cell-XX`. | R3 | `db-portal` and `pg-cell-01` |
| AC-09 | Base workspace pages manage products, contacts, and bot settings backed by live queries to `pg-cell-XX`. | R4 | `/workspace/*` routes |
| AC-10 | Optional modules appear in navigation only when permitted by tenant plan feature flags. | R4 | `TenantWorkspaceShell` |
| AC-11 | Uploaded product images persist in SeaweedFS bucket `media` and render with HTTP 200 via HMAC-signed imgproxy URLs. | R4 | SeaweedFS & imgproxy |
| AC-12 | Active cells in `/admin/cells` automatically display their migration status and indicate whether schema updates are pending. | R5 | `/admin/cells` page |
| AC-13 | Manual migration trigger successfully applies pending `drizzle-cell` migrations to target cell database and updates status. | R5 | `/admin/cells` trigger |
| AC-14 | Automated domain test suite (`pnpm --filter @mocter/domain test`) and code linting (`pnpm lint`) pass with zero errors. | Verification | CI / local test runner |
| AC-15 | Docker services compile, restart, and return HTTP 200 on `/api/health` without exceptions in logs (AGENTS.md §4.18). | Operational | Docker runtime |

---

## 7. Current Codebase Diagnostics & File Gap Analysis

| Problem / Missing Component | File Location | Line / Status | Required Remediation |
|---|---|---|---|
| Insecure `platform_owner` fallback | `apps/admin/app/layout.tsx` | Lines 45–53 | Remove fallback; replace with `PortalShellRouter` and authoritative session dispatch. |
| Missing Shell Bifurcation Router | `apps/admin/components/portal-shell-router.tsx` | Missing (Does not exist) | Implement component that branches into `AdminShell.tsx`, `TenantOnboardingWizard.tsx`, or `TenantWorkspaceShell.tsx`. |
| Shared Admin Home Route Guard | `apps/admin/app/page.tsx` | Lines 21–24 | Add server-side check using `resolveAuthenticatedPortalContext` to redirect tenants/prospects away from `/`. |
| Missing Tenant Workspace Shell | `apps/admin/components/tenant-workspace-shell.tsx` | Missing (Does not exist) | Create dedicated `.tsx` shell for tenant backoffice with plan badge and dynamic navigation. |
| In-memory stub Onboarding service | `packages/domain/src/services/onboarding-and-limits.service.ts` | Lines 177–202 | Replace with real PostgreSQL-backed `tenant-onboarding.service.ts`. |
| Missing `/onboarding` Route & Wizard | `apps/admin/app/onboarding/page.tsx`, `tenant-onboarding-wizard.tsx` | Missing (Does not exist) | Implement 3-step wizard UI with Title Case labels, Mobile-First styling, and AI description assistant. |
| Missing Cell Database Pool Manager | `packages/domain/src/db/cell-client.ts` | Missing (Does not exist) | Implement `CellDatabasePoolManager` with `getCellDb` and `withTenantCellTransaction` enforcing `SET LOCAL app.current_client_id`. |
| Cell auth repo connects to `db-portal` | `packages/domain/src/repositories/drizzle-cell-auth.repository.ts` | Lines 37–38 | Wire `defaultCellAuthRepository` to `getCellDb(cellId)` instead of default `getDb()`. |
| Tenant products repo connects to `db-portal` | `packages/domain/src/services/tenant-products-and-media.service.ts` | Lines 260–262 | Refactor to query `pg-cell-XX` via `CellDatabasePoolManager`. |
| Manual tenant creation skips cell provisioning | `packages/domain/src/services/admin-dashboard.service.ts` | Lines 2673, 2680–2720 | Set `lifecycleStatus = 'alta'`, invoke `provisionTenantInCellDataPlane`, and update `identity_location`. |
| RBAC overview ignores tenant owners | `packages/domain/src/services/rbac.service.ts` | Lines 428–452 | Check `clients.owner_user_id` and `tenant_users` to display `tenant_owner (<Client Name>)` and cell code. |
| Missing Tenant Workspace Service | `packages/domain/src/services/tenant-workspace.service.ts` | Missing (Does not exist) | Create service orchestrating workspace queries, SeaweedFS S3 upload, imgproxy signing, and quota checks. |
| Missing Workspace Views & API Handlers | `apps/admin/app/workspace/*`, `apps/admin/app/api/tenant/*` | Missing (Does not exist) | Create 7 base views, 4 gated views, and associated REST handlers. |
| Missing Cell Migration Tracking & Trigger | `apps/admin/app/admin/cells/page.tsx`, `cell-actions.tsx` | Column / action absent | Add migration status inspection against `packages/domain/drizzle-cell/meta/_journal.json`, UI badge, and manual migration execution trigger. |
