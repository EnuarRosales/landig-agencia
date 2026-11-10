# TEST_INFRA.md — Mocter Core E2E Testing Infrastructure

> **Document Version:** 1.0  
> **Status:** Canonical & Active  
> **Target Scope:** TNT-001 (Tenant Operating Environment Stabilization), ADM-001, AUTH-001, DAT-001, CEL-001  
> **Last Updated:** 2026-11-09  

---

## 1. Test Philosophy

The Mocter Core E2E Testing Track is designed under strict **Opaque-Box, Requirement-Driven** engineering principles:

1. **Zero Dependency on Implementation Internals:**
   Tests interact exclusively with publicly observable boundaries: HTTP Route Handlers, web pages, cookie/session state (`mocter_sid`), database state planes (`db-portal` and physical cell PostgreSQL databases `pg-cell-XX`), object storage (SeaweedFS S3), and media proxies (imgproxy). Tests never import unexported private modules, patch internal variable state, or simulate artificial behaviors.

2. **Authoritative Verification Against Specification Contracts:**
   Every test assertion derives directly from explicit requirements in `PROJECT.md`, `docs/specs/tnt-001-entorno-operativo-inquilino/requirements.md`, `design.md`, and `tasks.md`. No test is designed to fit an ad-hoc implementation shortcut.

3. **Physical Data Plane & RLS Enforcement:**
   Tests strictly verify that multi-tenancy is enforced physically on `pg-cell-XX` under `FORCE ROW LEVEL SECURITY`. Queries executing without `SELECT set_config('app.current_client_id', clientId, true)` MUST return 0 rows. Cross-tenant leakage is tested adversarially.

4. **Deterministic & Isolated Execution:**
   Each test suite creates or references cleanly identified fixtures, does not rely on random network latency, cleans up temporary data, and handles teardown safely.

5. **Layered Verification Tiers:**
   Tests are structured into 5 formalized tiers:
   - **Tier 1 (Happy Path / Core Functionality):** Verifies basic functional contracts with valid inputs.
   - **Tier 2 (Boundary & Edge Cases):** Verifies empty inputs, nulls, invalid formats, unassigned tokens, and quota limits.
   - **Tier 3 (Combinatorial & Cross-Cutting Interactions):** Verifies pairwise combinations of user roles, tenant lifecycle states, and route guards.
   - **Tier 4 (End-to-End Realistic Scenarios):** Multi-step user journeys covering Scenarios A through E.
   - **Tier 5 (Adversarial & Stress Conditions):** Tests privilege escalation attempts, layout tampering, credential forgery, and SQL injection bypass attempts.

---

## 2. Feature Inventory & Coverage Mapping

The following table maps every feature declared in `PROJECT.md` to its corresponding E2E test suites and verification tiers:

| # | Feature Name | Specification Ref | E2E Suite Location | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|--------------|-------------------|--------------------|:------:|:------:|:------:|:------:|
| 1 | Dynamic Cell Connection Pool (`CellDatabasePoolManager`) | TNT-RF-01.1, ADM-D-37 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 2 | Cell RLS Context Injection (`SET LOCAL app.current_client_id`) | TNT-RF-01.2, DAT-RF-10.11 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 3 | Cell Repositories Pool Delegation | TNT-RF-01.1, ADM-001 T-39 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 4 | Cell-side Tenant Provisioning | TNT-RF-01.3, ADM-D-36 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 5 | Identity Promotion & Credential Isolation | TNT-RF-01.4, AUTH-D-01 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 6 | Idempotent Existing Tenant Reconciliation (`Synergia Market`) | TNT-RF-01.6, ADM-001 T-39 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 7 | Tenant Owner Role Recognition in RBAC | TNT-RF-01.5, AUTH-001 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 8 | Password Setup & Reset Routing | TNT-RF-01.4, AUTH-001 §5.1.2 | `tests/e2e/scenarios/scenario-a-cell-isolation.test.mjs` | >=5 | >=5 | Pairwise | Scenario A |
| 9 | Elimination of Role Fallback (`let role = 'platform_owner'`) | TNT-RF-02.2, ADM-D-35 | `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs` | >=5 | >=5 | Pairwise | Scenario B |
| 10 | Authoritative Session Context Resolution | TNT-RF-02.1, ADM-001 T-40 | `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs` | >=5 | >=5 | Pairwise | Scenario B |
| 11 | Mutually Exclusive Shell Bifurcation (`AdminShell` vs `TenantWorkspaceShell`) | TNT-RF-02.3, ADM-D-35 | `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs` | >=5 | >=5 | Pairwise | Scenario B |
| 12 | Server-side Navigation Guards | TNT-RF-02.4, ADM-001 T-40 | `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs` | >=5 | >=5 | Pairwise | Scenario B |
| 13 | Post-Auth Redirect Alignment in `apps/web` | TNT-RF-02.4, AUTH-001 | `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs` | >=5 | >=5 | Pairwise | Scenario B |
| 14 | Responsive 3-Step Onboarding Wizard | TNT-RF-03.1, ADM-D-36 | `tests/e2e/scenarios/scenario-c-3step-onboarding.test.mjs` | >=5 | >=5 | Pairwise | Scenario C |
| 15 | Onboarding Step 1 (Manual & Self-Service) | TNT-RF-03.2, TNT-RF-03.3 | `tests/e2e/scenarios/scenario-c-3step-onboarding.test.mjs` | >=5 | >=5 | Pairwise | Scenario C |
| 16 | Onboarding Step 2 (First Product + AI) | TNT-RF-03.4, AI-001 | `tests/e2e/scenarios/scenario-c-3step-onboarding.test.mjs` | >=5 | >=5 | Pairwise | Scenario C |
| 17 | Onboarding Step 3 (Bot Preset & Activation) | TNT-RF-03.5, ADM-D-36 | `tests/e2e/scenarios/scenario-c-3step-onboarding.test.mjs` | >=5 | >=5 | Pairwise | Scenario C |
| 18 | PostgreSQL-backed Onboarding Service | TNT-RF-03.1, ADM-001 T-41 | `tests/e2e/scenarios/scenario-c-3step-onboarding.test.mjs` | >=5 | >=5 | Pairwise | Scenario C |
| 19 | Tenant Workspace Shell (`TenantWorkspaceShell.tsx`) | TNT-RF-04.1, ADM-D-35 | `tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs` | >=5 | >=5 | Pairwise | Scenario D |
| 20 | Base Workspace Modules (Dashboard, Products, CRM, Orders, Bot, Team, Billing) | TNT-RF-04.1, ADM-001 T-42 | `tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs` | >=5 | >=5 | Pairwise | Scenario D |
| 21 | Dynamic Capability Gating (`TenantCapabilityGateService`) | TNT-RF-04.2, ADM-D-37 | `tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs` | >=5 | >=5 | Pairwise | Scenario D |
| 22 | SeaweedFS S3 Media Storage | TNT-RF-04.3, CEL-RF-016 | `tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs` | >=5 | >=5 | Pairwise | Scenario D |
| 23 | HMAC-SHA256 Signed imgproxy Delivery | TNT-RF-04.3, CEL-RF-019 | `tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs` | >=5 | >=5 | Pairwise | Scenario D |
| 24 | Cell Migration Journal Detection | ADM-RF-10.9, RF-10.10 | `tests/e2e/scenarios/scenario-e-cell-migration.test.mjs` | >=5 | >=5 | Pairwise | Scenario E |
| 25 | Cell Migration UI Status Badges | ADM-RF-10.18, T-10 | `tests/e2e/scenarios/scenario-e-cell-migration.test.mjs` | >=5 | >=5 | Pairwise | Scenario E |
| 26 | Controlled Manual Migration Execution Trigger | ADM-RF-10.18, T-10 | `tests/e2e/scenarios/scenario-e-cell-migration.test.mjs` | >=5 | >=5 | Pairwise | Scenario E |
| 27 | E2E Testing Suite (Tiers 1-4) | E2E Milestone Contract | `tests/e2e/run.mjs` | >=5 | >=5 | Pairwise | Complete |
| 28 | Adversarial Coverage Hardening (Tier 5) | PROJECT.md M6 Scope | `tests/e2e/scenarios/` | >=5 | >=5 | Pairwise | Hardening |

---

## 3. End-to-End Scenarios Inventory

### Scenario A: Cell Isolation, RLS Enforcement, and Identity Promotion
- **Primary Contract:** Physical database isolation between `db-portal` and `pg-cell-01`.
- **Key Verifications:**
  1. `SET LOCAL app.current_client_id` is mandatory: running DML or `SELECT` on `pg-cell-01` without it yields exactly 0 rows.
  2. Setting client A context cannot see or modify records owned by client B.
  3. Cell-promoted users have their Argon2id password hash stored exclusively in `pg-cell-XX` (`admin.users`).
  4. Global control plane (`db-portal` `admin.users`) retains `password_hash = NULL` for promoted identities (`identity_location != 'router'`).
  5. Existing tenant `Synergia Market` (`synergiamarket25@gmail.com`) is reconciled idempotently into `pg-cell-01`, reflected as `tenant_owner` in RBAC, and positioned in `lifecycle_status = 'alta'`.

### Scenario B: Bifurcated Session Dispatch and Navigation Guards
- **Primary Contract:** Server-side authoritative session resolution and physical `.tsx` tree separation.
- **Key Verifications:**
  1. Insecure fallback (`let role = 'platform_owner'`) is eliminated; users without platform roles never receive platform access.
  2. `resolveAuthenticatedPortalContext` partitions users deterministically into `platform`, `tenant`, and `onboarding_prospect`.
  3. Platform operators accessing `/` or `/admin/*` render `AdminShell.tsx`.
  4. Active tenants accessing `/workspace/*` render `TenantWorkspaceShell.tsx` with zero platform layout leakage.
  5. Tenant users attempting to access `/admin/*` are immediately intercepted by server guards and redirected to `/workspace` (or `/onboarding`).
  6. Prospect users with `active_client_id = NULL` or tenants with `lifecycle_status = 'alta'` accessing `/workspace` or `/admin` are redirected to `/onboarding`.

### Scenario C: Unified 3-Step Onboarding to Workspace Transition
- **Primary Contract:** 3-step conversion wizard (`/onboarding`) supporting both Manual and Self-Service paths.
- **Key Verifications:**
  1. **Step 1 (Manual):** Business information is pre-populated from `admin.clients` (`displayName`, `slug`, `plan`, `cellCode`).
  2. **Step 1 (Self-Service):** Fresh prospect selects name, slug, and plan; system allocates an active cell and routing.
  3. **Step 2 (First Product):** Real product record is persisted into `pg-cell-XX` under RLS, updating `admin.client_usage` (`dimension = 'products'`). Description textarea supports AI assist without uppercase labels.
  4. **Step 3 (Bot Preset & Activation):** Bot customer-service configuration is saved to `pg-cell-XX` (`admin.client_business_info`), `admin.clients.lifecycle_status` transitions from `'alta'` to `'activo'`, and client is redirected to `/workspace`.

### Scenario D: Workspace Operations, Capability Gating, and Media Delivery
- **Primary Contract:** Operational tenant backoffice, plan quota enforcement, and media delivery pipeline.
- **Key Verifications:**
  1. Base modules (`/workspace/{dashboard,products,contacts,orders,bot,team,billing}`) operate on live queries against `pg-cell-XX`.
  2. Optional modules (`conversations`/Chatwoot, `branding`, `community`, `reports`) are gated by `TenantCapabilityGateService` based on `plan_feature_values`.
  3. Attempting to navigate to an unpermitted optional module yields an access denial or redirect.
  4. Product media upload transfers binary data to SeaweedFS S3 bucket `media` after magic-byte validation.
  5. imgproxy URLs are generated with HMAC-SHA256 signatures and return HTTP 200 with valid image dimensions.

### Scenario E: Cell Schema Migration Status Detection and Execution
- **Primary Contract:** Schema synchronization tracking against `packages/domain/drizzle-cell/` migration journals.
- **Key Verifications:**
  1. Platform inspection endpoint scans active cells and detects applied vs. pending migrations from `meta/_journal.json`.
  2. UI badge indicates migration health (synchronized vs. update pending).
  3. Controlled manual execution trigger applies pending migrations to the selected cell database.
  4. Execution is idempotent and preserves RLS grants and table comments.

---

## 4. Test Infrastructure Architecture & Harness

The test harness is implemented in `tests/e2e/` as a zero-dependency, standalone TypeScript/Node.js ESM suite:

```
tests/e2e/
├── run.mjs                                  # Canonical test runner & CLI orchestrator
├── harness/
│   ├── config.mjs                           # Environment endpoints & credentials
│   ├── db.mjs                               # Direct PostgreSQL assertion client (db-portal & pg-cell-XX)
│   ├── http.mjs                             # Opaque-box HTTP client with session/cookie jar
│   ├── crypto.mjs                           # HMAC-SHA256 & Argon2id cryptographic verifiers
│   ├── fixtures.mjs                         # Seed data & test user credentials
│   └── runner-core.mjs                      # Lightweight assertion & test grouping engine
└── scenarios/
    ├── scenario-a-cell-isolation.test.mjs   # Scenario A test suite (Features 1-8)
    ├── scenario-b-bifurcated-session-dispatch.test.mjs # Scenario B test suite (Features 9-13)
    ├── scenario-c-3step-onboarding.test.mjs # Scenario C test suite (Features 14-18)
    ├── scenario-d-workspace-and-media.test.mjs # Scenario D test suite (Features 19-23)
    └── scenario-e-cell-migration.test.mjs   # Scenario E test suite (Features 24-26)
```

### Execution Commands

```bash
# Run complete E2E test suite
node tests/e2e/run.mjs

# Run via npm/pnpm script
pnpm test:e2e

# Run specific scenario
node tests/e2e/run.mjs --scenario=A
node tests/e2e/run.mjs --scenario=B
node tests/e2e/run.mjs --scenario=C
node tests/e2e/run.mjs --scenario=D
node tests/e2e/run.mjs --scenario=E

# Run with verbose TAP output
node tests/e2e/run.mjs --reporter=tap
```

### Verification Criteria for CI/CD Gates
- **100% of Scenarios A through E MUST pass.**
- **Zero layout leakage between SaaS admin and tenant backoffice.**
- **Zero cross-tenant data leakage under physical PostgreSQL RLS.**
- **Docker services healthy and returning HTTP 200.**
