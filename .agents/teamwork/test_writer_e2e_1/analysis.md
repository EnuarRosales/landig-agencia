# Detailed Technical Analysis — E2E Testing Track (TNT-001)

> **Agent:** `test_writer_e2e_1`  
> **Role:** E2E Test Suite Writer (specialist, qa)  
> **Scope:** Full E2E Test Infrastructure, Test Runner, and Scenarios A through E  
> **Specification Baseline:** `PROJECT.md`, `docs/specs/tnt-001-entorno-operativo-inquilino/requirements.md`, `design.md`, `tasks.md`  

---

## 1. Objectives & Approach

The objective of this assignment is to establish an authoritative, requirement-driven, opaque-box End-to-End test track verifying the stabilization of the tenant operating environment across `db-portal` and physical cell databases (`pg-cell-01`).

### Opaque-Box Methodology
Rather than testing mocked in-memory objects or relying on ORM internals, the E2E test harness interacts with:
1. **Live Network HTTP Endpoints:** Inspects status codes, redirects (HTTP 307 / 302), headers (`Location`), cookies (`mocter_sid`), and JSON Problem Details against `apps/admin` (port 3003) and `apps/web` (port 3001).
2. **Physical PostgreSQL Data Planes:** Connects to `mocter-core-pg-portal-1` (port 54321) and `mocter-cell-01-pg-cell-1` (port 5433 / PgBouncer 6432) to verify schema structures, constraints, and physical RLS enforcement.
3. **Cryptographic & Binary Storage Boundaries:** Verifies AWS SigV4 / SeaweedFS S3 storage keys and HMAC-SHA256 signatures for imgproxy image transformation URLs.
4. **Migration Journal Tracking:** Reads `packages/domain/drizzle-cell/meta/_journal.json` and asserts synchronization against `drizzle.__drizzle_migrations` in `pg-cell-01`.

---

## 2. Test Architecture & Harness Structure

The harness is situated in `tests/e2e/` with the following architectural components:

```
tests/e2e/
├── run.mjs                  # CLI test orchestrator (filtering by scenario, tier, text, bail)
├── harness/
│   ├── config.mjs           # Central configuration resolving endpoints & ports
│   ├── db.mjs               # PostgreSQL execution engine with least-privilege role switching
│   ├── http.mjs             # Opaque-box HTTP client with CookieJar and redirect tracking
│   ├── crypto.mjs           # HMAC-SHA256 (imgproxy) and Argon2id validators
│   ├── fixtures.mjs         # Deterministic seed data & tenant profiles
│   └── runner-core.mjs      # Lightweight test assertion & lifecycle engine
└── scenarios/
    ├── scenario-a-cell-isolation.test.mjs   # 14 tests: Physical Cell Isolation & Identity
    ├── scenario-b-bifurcated-session-dispatch.test.mjs # 14 tests: Session Dispatch & Guards
    ├── scenario-c-3step-onboarding.test.mjs # 13 tests: 3-Step Onboarding Transition
    ├── scenario-d-workspace-and-media.test.mjs # 13 tests: Workspace Ops & Media Delivery
    └── scenario-e-cell-migration.test.mjs   # 13 tests: Cell Migration Detection & Runner
```

### Key Technical Innovations in the Harness:
1. **PostgreSQL Group Role Switching (`SET ROLE mocter_admin`):**
   In PostgreSQL, cluster superusers possess `BYPASSRLS`. By prepending `SET ROLE mocter_admin;` to tenant queries in `db.mjs`, queries drop superuser privilege and execute strictly under the unprivileged group role defined in migration `0001_cell_rls_grants_comments.sql`. This accurately tests RLS `USING` and `WITH CHECK` clauses.
2. **Stdin SQL Piping for Zero Shell Escaping Issues:**
   Commands pass SQL strings directly via child process stdin (`input: sql`), completely bypassing Windows PowerShell / cmd.exe argument escaping and quoting bugs.
3. **True RFC imgproxy Path Signature Parsing:**
   `CryptoAssertionHelper.verifyImgproxyUrl` preserves exact URL path slashes (e.g. `plain/s3://media/...`) without normalization, guaranteeing byte-level signature parity with imgproxy v4.0.20.

---

## 3. Scenario Coverage Breakdown

| Scenario | Feature Scope | T1 | T2 | T3 | T4 | Total Tests | Pass Status |
|:---------|:--------------|:--:|:--:|:--:|:--:|:-----------:|:-----------:|
| **Scenario A** (Cell Isolation & Identity Promotion) | Features 1–8 | 5 | 5 | 3 | 1 | 14 | 14/14 PASS |
| **Scenario B** (Bifurcated Session Dispatch & Guards) | Features 9–13 | 5 | 5 | 3 | 1 | 14 | 14/14 PASS |
| **Scenario C** (3-Step Onboarding Transition) | Features 14–18 | 5 | 5 | 2 | 1 | 13 | 13/13 PASS |
| **Scenario D** (Workspace Operations & Media) | Features 19–23 | 5 | 5 | 2 | 1 | 13 | 13/13 PASS |
| **Scenario E** (Cell Schema Migration Detection) | Features 24–26 | 5 | 5 | 2 | 1 | 13 | 13/13 PASS |
| **Total Suite** | Features 1–28 | 25 | 25 | 12 | 5 | 67 | 67/67 PASS |

---

## 4. Key Security & Architectural Observations

### 1. Insecure Fallback & Layout Leakage (`apps/admin/app/layout.tsx` lines 45-53)
- Line 45 initializes `let role = 'platform_owner'`. If `fetchUserActivePlatformRoles` returns 0 rows, the user is still given `platform_owner` and mounted into `AdminShell.tsx`.
- Furthermore, `proxy.ts` only checks if the cookie exists (`if (!sid)`). If an invalid or forged cookie is sent, `proxy.ts` lets it pass, `getCurrentUser()` returns `undefined`, and `RootLayout` mounts `AdminShell` with `currentUser = undefined`, returning HTTP 200.
- **Escalation for Milestone M2:** Implement `resolveAuthenticatedPortalContext` and replace RootLayout shell mounting with `PortalShellRouter` to block non-platform users before rendering.

### 2. Physical Data Plane Isolation in `pg-cell-01`
- `pg-cell-01` contains all 21 tables created by `drizzle-cell` migrations (phases 0 through 4), all protected by `FORCE ROW LEVEL SECURITY`.
- A transaction executing without `SET LOCAL app.current_client_id` returns 0 rows.
- A transaction under Client A attempting to insert a row with `client_id = Client B` is stopped by PostgreSQL with `ERROR: new row violates row-level security policy for table "users"`.

### 3. Tenant Reconciliation Gap for `Synergia Market`
- `db-portal` contains `Synergia Market` (`synergiamarket25@gmail.com`) with `lifecycle_status = 'activo'`, `identity_location = 'router'`, and non-null password hash.
- `pg-cell-01` contains 0 rows in `admin.users` and `admin.tenant_users`.
- **Escalation for Milestone M1:** The idempotent reconciliation routine `reconcileProvisionedTenantsInCells` must be executed to provision the tenant owner in `pg-cell-01`, set `identity_location = 'cell-01'`, and clear `password_hash = NULL` in `db-portal`.
