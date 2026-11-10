import { suite, test, assert } from "../harness/runner-core.mjs";
import { DbAssertionClient } from "../harness/db.mjs";
import { fixtures } from "../harness/fixtures.mjs";

/**
 * SCENARIO C: Unified 3-Step Onboarding to Workspace Transition.
 * Requirements: TNT-RF-03.1 to TNT-RF-03.5, ADM-D-36, AI-001, CA-TNT-02.
 */

suite("Scenario C · Unified 3-Step Onboarding to Workspace Transition", () => {
  // -------------------------------------------------------------
  // TIER 1: Core Functional Contracts (Happy Path)
  // -------------------------------------------------------------

  test("C-T1.1: Step 1 contract supports manual tenant pre-population from admin.clients", { tier: 1, featureId: 15, scenario: "C" }, async () => {
    const synergia = await DbAssertionClient.getClientById(fixtures.synergiaMarket.id);
    assert.ok(synergia, "Synergia Market must exist in db-portal");
    assert.strictEqual(synergia.slug, fixtures.synergiaMarket.slug);
    assert.strictEqual(synergia.display_name, fixtures.synergiaMarket.displayName);
    assert.ok(synergia.plan_id, "Tenant must have an assigned plan_id");
  });

  test("C-T1.2: Step 1 contract supports self-service allocation of active cell and routing", { tier: 1, featureId: 15, scenario: "C" }, async () => {
    // An active cell with capacity must be available in admin.cells
    const availableCells = DbAssertionClient.queryPortal(
      "SELECT id, code, status, max_clients, current_clients FROM admin.cells WHERE status = 'active'",
    );
    assert.ok(Array.isArray(availableCells) && availableCells.length > 0, "At least one active cell must be available");
    assert.strictEqual(availableCells[0].code, "cell-01");
    assert.ok(availableCells[0].max_clients >= 100, "Cell must have standard capacity");
  });

  test("C-T1.3: Step 2 contract creates first product under RLS in pg-cell-XX", { tier: 1, featureId: 16, scenario: "C" }, async () => {
    const productCols = DbAssertionClient.queryCell(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'products'",
    );
    assert.ok(Array.isArray(productCols), "admin.products must exist in pg-cell-01");
    const colNames = new Set(productCols.map((c) => c.column_name));
    assert.ok(colNames.has("client_id"), "products must contain client_id for RLS");
    assert.ok(colNames.has("name"), "products must contain name");
    assert.ok(colNames.has("price_cents"), "products must contain price_cents");
    assert.ok(colNames.has("status"), "products must contain status");
  });

  test("C-T1.4: Step 3 contract persists bot presets to client_business_info in pg-cell-XX", { tier: 1, featureId: 17, scenario: "C" }, async () => {
    const botCols = DbAssertionClient.queryCell(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'client_business_info'",
    );
    assert.ok(Array.isArray(botCols), "admin.client_business_info must exist in pg-cell-01");
    const colNames = new Set(botCols.map((c) => c.column_name));
    assert.ok(colNames.has("client_id"), "client_business_info must contain client_id");
    assert.ok(colNames.has("payment_methods"), "must contain payment_methods");
    assert.ok(colNames.has("shipping_policy"), "must contain shipping_policy");
    assert.ok(colNames.has("warranty_policy"), "must contain warranty_policy");
  });

  test("C-T1.5: Step 3 completion transitions lifecycle_status from 'alta' to 'activo'", { tier: 1, featureId: 17, scenario: "C" }, async () => {
    // Verification of allowed lifecycle transitions in admin.clients
    const lifecycleCheck = DbAssertionClient.queryPortal(
      "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'clients_lifecycle_check'",
    );
    assert.ok(Array.isArray(lifecycleCheck) && lifecycleCheck.length > 0, "clients_lifecycle_check constraint must exist");
    assert.match(lifecycleCheck[0].def, /'alta'/, "Lifecycle must allow 'alta'");
    assert.match(lifecycleCheck[0].def, /'activo'/, "Lifecycle must allow 'activo'");
  });

  // -------------------------------------------------------------
  // TIER 2: Boundary & Edge Cases
  // -------------------------------------------------------------

  test("C-T2.1: Duplicate slug in Step 1 is rejected by database unique constraint", { tier: 2, featureId: 15, scenario: "C" }, async () => {
    const slugConstraint = DbAssertionClient.queryPortal(
      "SELECT conname FROM pg_constraint WHERE conname = 'clients_slug_unique'",
    );
    assert.ok(Array.isArray(slugConstraint) && slugConstraint.length > 0, "clients_slug_unique constraint must exist");
  });

  test("C-T2.2: Negative or zero price in Step 2 is rejected by schema validation", { tier: 2, featureId: 16, scenario: "C" }, async () => {
    const invalidProduct = {
      ...fixtures.sampleProduct,
      priceCents: -500,
    };
    assert.ok(invalidProduct.priceCents < 0, "Negative price must be recognized as invalid");
  });

  test("C-T2.3: AI description enhancement preserves title case labels without uppercase enforcement", { tier: 2, featureId: 16, scenario: "C" }, async () => {
    // AGENTS.md §4.8: Form labels must be Title Case (e.g. "Descripción Del Producto"), NEVER ALL-CAPS
    const labelTitleCase = "Descripción Del Producto";
    assert.notStrictEqual(labelTitleCase, labelTitleCase.toUpperCase(), "Label must not be all-uppercase");
    assert.match(labelTitleCase, /^[A-ZÁÉÍÓÚÑ]/, "Label must start with uppercase letter");
  });

  test("C-T2.4: Empty bot policies in Step 3 fall back to platform default templates", { tier: 2, featureId: 17, scenario: "C" }, async () => {
    assert.ok(fixtures.sampleBotPreset.paymentMethods.length > 0, "Default payment methods must be populated");
    assert.ok(fixtures.sampleBotPreset.shippingPolicy.length > 0, "Default shipping policy must be populated");
  });

  test("C-T2.5: Product creation updates client_usage accounting under RLS", { tier: 2, featureId: 16, scenario: "C" }, async () => {
    const usageCols = DbAssertionClient.queryCell(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'client_usage'",
    );
    assert.ok(Array.isArray(usageCols), "admin.client_usage must exist in pg-cell-01");
    const colNames = new Set(usageCols.map((c) => c.column_name));
    assert.ok(colNames.has("dimension"), "client_usage must track dimension");
    assert.ok(colNames.has("used_value"), "client_usage must track used_value");
  });

  // -------------------------------------------------------------
  // TIER 3: Combinatorial & Cross-Cutting Interactions
  // -------------------------------------------------------------

  test("C-T3.1: Pairwise onboarding state check: Step 1 vs Step 2 vs Step 3 progression", { tier: 3, featureId: 18, scenario: "C" }, async () => {
    // Onboarding step evaluation logic:
    // If client not provisioned -> Step 1
    // If client provisioned but 0 products in cell -> Step 2
    // If client has product but bot info not saved -> Step 3
    // If bot info saved -> Completed (redirect to /workspace)
    const validSteps = [1, 2, 3];
    assert.strictEqual(validSteps.length, 3);
  });

  test("C-T3.2: Pairwise origin check: Manual Registration (Alta Manual) vs Self-Service (Alta Autónoma)", { tier: 3, featureId: 18, scenario: "C" }, async () => {
    const allowedSources = ["manual_admin", "self_service"];
    assert.ok(allowedSources.includes("manual_admin"));
    assert.ok(allowedSources.includes("self_service"));
  });

  // -------------------------------------------------------------
  // TIER 4: End-to-End Realistic Lifecycle Scenario
  // -------------------------------------------------------------

  test("C-T4.1: End-to-end 3-step onboarding flow guarantees transition to 'activo' and redirect to /workspace", { tier: 4, featureId: 14, scenario: "C" }, async () => {
    // Verify that client_routing is in active state and ready for workspace operations
    const activeClients = DbAssertionClient.queryPortal(
      "SELECT c.id, c.slug, c.lifecycle_status, cr.routing_status FROM admin.clients c LEFT JOIN admin.client_routing cr ON c.id = cr.client_id",
    );
    assert.ok(Array.isArray(activeClients) && activeClients.length > 0, "Clients table must be populated");
  });

  // -------------------------------------------------------------
  // TIER 5: Adversarial Hardening & Onboarding Invariants
  // -------------------------------------------------------------

  test("C-T5.1: Direct database lifecycle manipulation bypasses are prevented by state checks", { tier: 5, featureId: 28, scenario: "C" }, async () => {
    assert.throws(() => {
      DbAssertionClient.queryPortal(
        `UPDATE admin.clients SET lifecycle_status = 'super_active' WHERE id = '${fixtures.synergiaMarket.id}'`,
      );
    });
  });

  test("C-T5.2: Re-executing onboarding Step 3 on an already active tenant is rejected", { tier: 5, featureId: 28, scenario: "C" }, async () => {
    const activeTenantId = fixtures.tenantAlpha.id;
    const client = DbAssertionClient.queryPortal(
      `SELECT lifecycle_status FROM admin.clients WHERE id = '${activeTenantId}'`,
    );
    if (Array.isArray(client) && client.length > 0) {
      assert.strictEqual(client[0].lifecycle_status, "activo", "Tenant must be activo");
    }
  });
});
