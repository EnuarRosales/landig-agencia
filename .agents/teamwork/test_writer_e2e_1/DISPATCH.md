## 2026-11-09T00:11:23Z
You are the E2E Test Suite Writer for the project.

Working directory: d:\3. Develoment\mocter-system\mocter-core
State folder: d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\test_writer_e2e_1

MANDATORY FIRST STEPS:
1. Read the user request file at:
   d:\3. Develoment\mocter-system\mocter-core\.agents\teamwork\ORIGINAL_REQUEST.md
2. Read the project scope file at:
   d:\3. Develoment\mocter-system\mocter-core\PROJECT.md
3. Read the reference material:
   - C:/Users/Alejo/.gemini/antigravity/brain/4cad3cf2-ddc3-4764-9c64-ab36c567a567/implementation_plan.md
   - docs/specs/tnt-001-entorno-operativo-inquilino/requirements.md, design.md, tasks.md
   - .agents/AGENTS.md

Scope and Responsibilities:
You own the E2E Testing Track (requirement-driven, opaque-box).
1. Create `TEST_INFRA.md` at the project root `d:\3. Develoment\mocter-system\mocter-core\TEST_INFRA.md` following the template in Project Pattern:
   - Test Philosophy (opaque-box, requirement-driven, zero dependency on implementation internals)
   - Feature Inventory mapping all features from PROJECT.md
   - Coverage thresholds (Tier 1 >=5 per feature, Tier 2 >=5 per feature, Tier 3 pairwise, Tier 4 realistic scenarios A through D)
2. Implement the comprehensive E2E test harness and test cases in `tests/e2e/` (or package test runner) covering:
   - Scenario A: Cell Isolation and Identity Promotion (RLS enforcement, NULL password in db-portal, Synergia Market reconciliation)
   - Scenario B: Bifurcated Session Dispatch and Navigation Guards (platform vs tenant scope, zero layout leakage)
   - Scenario C: Unified 3-Step Onboarding to Workspace Transition (step 1-3, product creation, bot preset, lifecycle 'activo')
   - Scenario D: Workspace Operations, Dynamic Capability Gating, and Media Delivery (SeaweedFS upload, HMAC imgproxy URL)
   - Scenario E: Cell Schema Migration Status Detection and Manual Execution Trigger
3. Ensure the test runner can be executed reliably via a command (e.g., `pnpm test:e2e` or `node tests/e2e/run.mjs`).
4. Once the test infrastructure and test cases are created, publish `TEST_READY.md` at `d:\3. Develoment\mocter-system\mocter-core\TEST_READY.md`.
5. Write your detailed analysis in `analysis.md` and complete handoff report in `handoff.md` within your state folder.
6. Send a message to the orchestrator when `TEST_READY.md` is published and your handoff report is ready.
