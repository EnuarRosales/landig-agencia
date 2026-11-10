# Dispatch for explorer_m1_3
Role: Milestone 1 Explorer — Reconciliation & RBAC Overview
Scope: M1 Synergia Market reconciliation, RBAC Overview, and Password Reset Routing


## 2026-11-09T00:11:44Z
Sender: d9dd6187-8097-406e-a649-0b6a842d2eff
Priority: MESSAGE_PRIORITY_HIGH

You are an Explorer subagent for Milestone 1 (M1: Reconciliation, RBAC Overview & Password Reset).

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_3

MANDATORY FIRST STEPS:
1. Read the user request file at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md
2. Read the project scope file at:
   d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
3. Read the previous survey report at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_survey_2\handoff.md

Scope and Responsibilities:
Investigate and design the technical implementation strategy for Features 6, 7, and 8 of Milestone 1:
1. Idempotent Reconciliation Routine for Existing Tenants (`reconcileProvisionedTenantsInCells`):
   - Locate existing tenants like `Synergia Market` (`id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, `owner_user_id = '01a1bc84-cbec-7a2c-9efe-3a3f55284113'`, `email = 'synergiamarket25@gmail.com'`).
   - Materialize owner in `admin.users` and `admin.tenant_users` in `pg-cell-01` (`id = 6ae5619b-7ca3-4764-baae-1b8950a8e534`).
   - Update `identity_location` in `db-portal` from `'router'` to the cell UUID (`'6ae5619b-7ca3-4764-baae-1b8950a8e534'`).
   - Ensure the routine is fully idempotent (safe to run on every startup or migration).
   - Ensure `Synergia Market` lifecycle_status is set to `'alta'` so it enters onboarding properly if uncompleted.
2. Tenant Owner Role Recognition in RBAC:
   - In `packages/domain/src/services/rbac.service.ts`:
   - Update `fetchRbacOverview` to query `clients.owner_user_id` and user active client membership, so tenant owners are assigned `['tenant_owner']` instead of falling back to `["Sin Rol"]`.
3. Password Setup & Reset Routing:
   - In `packages/domain/src/services/auth.service.ts`:
   - Update `resetPassword` / `consumePasswordResetToken` so that when a tenant user sets their password, the Argon2id hash is saved to `pg-cell-XX` (`admin.users`) and cleared (`NULL`) in `db-portal`.

Deliverables:
- Write `analysis.md` and `handoff.md` in your state folder (`d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\explorer_m1_3\`).
- Recommend the exact implementation blueprint for the Worker.
- Note: You are read-only. Do NOT edit application source code.
- Send a message to the orchestrator when completed.
