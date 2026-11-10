# Project: Mocter Tenant Operating Environment Stabilization (TNT-001)

## Architecture
Multi-tenant architecture partitioned into:
1. **Control Plane (`db-portal`)**: Global tenant catalog, cell registry, routing table, platform operators, and unpromoted user records.
2. **Cell Data Planes (`pg-cell-XX`)**: Physical PostgreSQL 18 databases accessed via PgBouncer (`pool_mode = transaction`) under `FORCE ROW LEVEL SECURITY`. Enforces `SELECT set_config('app.current_client_id', clientId, true)`. Holds all tenant operational data (products, contacts, orders, bot, team, and cell-promoted user credentials with Argon2id).
3. **Session Dispatch & Shell Separation**: Server-side authoritative dispatch via `resolveAuthenticatedPortalContext` bifurcating into mutually exclusive trees:
   - SaaS Platform Operators: `/admin/*` wrapped in `AdminShell.tsx`
   - Prospect / Pending Onboarding: `/onboarding` wrapped in `TenantOnboardingWizard.tsx`
   - Active Tenant Operators: `/workspace/*` wrapped in `TenantWorkspaceShell.tsx`
4. **Media Pipeline**: Product assets stored in SeaweedFS S3 (`media` bucket) and served via HMAC-SHA256 signed imgproxy URLs.
5. **Cell Migration Plane**: Schema migration tracking against `packages/domain/drizzle-cell/` journals with controlled manual execution triggers.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dynamic Cell Connection Pool (`CellDatabasePoolManager`) | Dynamic PgBouncer client pool with `prepare: false` and AES-256-GCM secret decryption | M1 | Survey R1 |
| 2 | Cell RLS Context Injection | Enforce `SET LOCAL app.current_client_id` on all cell queries under `FORCE RLS` | M1 | Survey R1 |
| 3 | Cell Repositories Pool Delegation | Update cell repositories (`DrizzleCellAuthRepository`, etc.) to consume `CellDatabasePoolManager` | M1 | Survey R1 |
| 4 | Cell-side Tenant Provisioning | Materialize tenant owner, membership, labels, and business info in `pg-cell-XX` upon tenant creation | M1 | Survey R1 |
| 5 | Identity Promotion & Credential Isolation | Store Argon2id hashes in `pg-cell-XX` (`admin.users`) and clear `password_hash = NULL` in `db-portal` | M1 | Survey R1 |
| 6 | Idempotent Existing Tenant Reconciliation | Routine `reconcileProvisionedTenantsInCells` to materialize `Synergia Market` in `pg-cell-01` | M1 | Survey R1 |
| 7 | Tenant Owner Role Recognition in RBAC | Update `fetchRbacOverview` to recognize tenant owners and assigned cell UUID | M1 | Survey R1 |
| 8 | Password Setup & Reset Routing | Update `AuthService.resetPassword` to persist password hashes to `pg-cell-XX` when `identityLocation !== 'router'` | M1 | Survey R1 |
| 9 | Elimination of Role Fallback | Remove `let role = 'platform_owner'` fallback in `apps/admin/app/layout.tsx` | M2 | Survey R2 |
| 10 | Authoritative Session Context Resolution | Implement `resolveAuthenticatedPortalContext` to compute user scope, active client, and lifecycle | M2 | Survey R2 |
| 11 | Mutually Exclusive Shell Bifurcation | Implement `PortalShellRouter` separating `AdminShell` and `TenantWorkspaceShell` | M2 | Survey R2 |
| 12 | Server-side Navigation Guards | Intercept unauthorized cross-scope routes with deterministic server redirects | M2 | Survey R2 |
| 13 | Post-Auth Redirect Alignment in `apps/web` | Update `login-form.tsx`, OAuth callbacks, and `proxy.ts` to route deterministically by scope | M2 | Survey R2 |
| 14 | Responsive 3-Step Onboarding Wizard | Build `TenantOnboardingWizard.tsx` under `apps/admin/app/onboarding` | M3 | Survey R3 |
| 15 | Onboarding Step 1 (Manual & Self-Service) | Support pre-populated business info for manual tenants and allocation for self-service | M3 | Survey R3 |
| 16 | Onboarding Step 2 (First Product + AI) | Create tenant's first product with `AiEnhanceTextarea` on description | M3 | Survey R3 |
| 17 | Onboarding Step 3 (Bot Preset & Activation) | Configure bot presets, transition `lifecycle_status = 'activo'`, and redirect to `/workspace` | M3 | Survey R3 |
| 18 | PostgreSQL-backed Onboarding Service | Replace in-memory onboarding maps with PostgreSQL persistence | M3 | Survey R3 |
| 19 | Tenant Workspace Shell (`TenantWorkspaceShell.tsx`) | Build dedicated tenant workspace shell with tenant sidebar and profile | M4 | Survey R4 |
| 20 | Base Workspace Modules | Deliver `/workspace/{dashboard,products,contacts,orders,bot,team,billing}` backed by `pg-cell-XX` | M4 | Survey R4 |
| 21 | Dynamic Capability Gating | Gate optional modules (`conversations`, `branding`, `community`, `reports`) via `TenantCapabilityGateService` | M4 | Survey R4 |
| 22 | SeaweedFS S3 Media Storage | Store product media assets in SeaweedFS bucket `media` | M4 | Survey R4 |
| 23 | HMAC-SHA256 Signed imgproxy Delivery | Generate signed imgproxy URLs for public media delivery | M4 | Survey R4 |
| 24 | Cell Migration Journal Detection | Inspect active cell schema versions against `packages/domain/drizzle-cell/` journals | M5 | Survey R5 |
| 25 | Cell Migration UI Status Badges | Present visual indicator/badge in `/admin/cells` identifying pending migrations | M5 | Survey R5 |
| 26 | Controlled Manual Migration Execution | Provide admin trigger button and API endpoint to execute pending migrations on selected cell | M5 | Survey R5 |
| 27 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test suite verifying all features and scenarios A-D | E2E | Survey Specs |
| 28 | Adversarial Coverage Hardening (Tier 5) | White-box stress testing and edge-case boundary hardening | M6 | Survey Specs |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Test harness, runner, and test cases (Tiers 1-4) for scenarios A-D | none | DONE |
| M1 | Cell Isolation, Pooling & Identity Promotion | `packages/domain`: `CellDatabasePoolManager`, RLS, cell repos, provisioning, `Synergia Market` reconciliation, password setup | none | DONE |
| M2 | Authoritative Session Dispatch & Shell Bifurcation | `apps/admin/app/layout.tsx`, `resolveAuthenticatedPortalContext`, `AdminShell`, `TenantWorkspaceShell`, `apps/web` redirects | none | DONE |
| M3 | Unified 3-Step Onboarding Wizard | `apps/admin/app/onboarding/`, `TenantOnboardingWizard.tsx`, `TenantOnboardingService`, AI textarea, bot presets, activation | M1, M2 | DONE |
| M4 | Tenant Workspace Backoffice & Media Pipeline | `apps/admin/app/workspace/*`, capability gating, SeaweedFS upload, HMAC imgproxy signing | M1, M2 | DONE |
| M5 | Cell Schema Migration Tracking & Execution | Migration journal inspector, `/admin/cells` badges, manual trigger endpoint | M1 | DONE |
| M6 | Final Verification, Hardening & Health Protocol | 100% E2E test pass, Tier 5 adversarial hardening, Docker compile/restart/health check (AGENTS.md §4.18) | E2E, M1, M2, M3, M4, M5 | DONE |

## Interface Contracts
### `packages/domain` (`CellDatabasePoolManager`) ↔ Application Services
- `getCellDb(cellId: string): Promise<DrizzleCellDb>`
- `withTenantCellTransaction<T>(clientId: string, callback: (tx: DrizzleCellDb) => Promise<T>): Promise<T>`
  - Guarantees execution of `SET LOCAL app.current_client_id = <clientId>` inside transaction before running callback.
  - Automatically handles connection pooling via PgBouncer with `prepare: false`.

### Session Context Resolution ↔ Layout & Shells
- `resolveAuthenticatedPortalContext(sessionId: string): Promise<PortalContext>`
  - Output: `{ user, scope: 'platform' | 'tenant' | 'prospect', activeClient?, activeCellId?, effectiveRoles, lifecycleStatus }`
  - Platform users (`scope === 'platform'`): route to `/admin/*`, render `AdminShell.tsx`.
  - Pending onboarding users (`scope === 'prospect'` or `lifecycleStatus === 'alta'`): redirect to `/onboarding`.
  - Active tenant operators (`scope === 'tenant'` and `lifecycleStatus === 'activo'`): route to `/workspace/*`, render `TenantWorkspaceShell.tsx`.

### Tenant Capability Gate Service ↔ Workspace Navigation
- `getEffectiveCapabilities(clientId: string): Promise<TenantCapabilities>`
- `filterNavItems(navItems: NavItem[], capabilities: TenantCapabilities): NavItem[]`

### Media Storage ↔ Product Assets
- Upload: `S3StorageService.uploadFile(bucket: 'media', key: string, buffer: Buffer, mimeType: string): Promise<string>`
- URL Generation: `signImgproxyUrl(options: { bucket: 'media', key: string, resizingType?: string, width?: number, height?: number }): string`

### Cell Migration Operations
- Status: `getCellMigrationStatus(cellId: string): Promise<{ appliedCount: number, pendingCount: number, pendingMigrations: string[] }>`
- Trigger: `executeCellMigrations(cellId: string): Promise<{ success: boolean, applied: string[] }>`

## Code Layout
- `packages/domain/src/db/cell-client.ts`: Connection pool manager and tenant cell transaction helper.
- `packages/domain/src/services/session-context.service.ts`: Authoritative session resolution.
- `packages/domain/src/services/tenant-onboarding.service.ts`: PostgreSQL-backed onboarding state machine.
- `packages/domain/src/services/tenant-workspace.service.ts`: Tenant workspace operations (products, CRM, bot, etc.).
- `packages/domain/src/services/cell-migration.service.ts`: Migration journal inspector and runner.
- `apps/admin/components/admin-shell.tsx`: SaaS platform administration shell.
- `apps/admin/components/tenant-workspace-shell.tsx`: Dedicated tenant workspace shell.
- `apps/admin/components/portal-shell-router.tsx`: Top-level bifurcated layout router.
- `apps/admin/app/onboarding/`: Guided 3-step onboarding wizard.
- `apps/admin/app/workspace/`: Tenant backoffice views.
- `apps/admin/app/admin/cells/`: Cells dashboard with migration status badges and trigger.
