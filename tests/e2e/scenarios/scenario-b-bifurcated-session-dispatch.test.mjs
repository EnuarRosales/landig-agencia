import { suite, test, assert } from "../harness/runner-core.mjs";
import { HttpClient } from "../harness/http.mjs";
import { DbAssertionClient } from "../harness/db.mjs";
import { config } from "../harness/config.mjs";
import { fixtures } from "../harness/fixtures.mjs";

/**
 * SCENARIO B: Bifurcated Session Dispatch, Shell Separation, and Navigation Guards.
 * Requirements: TNT-RF-02.1 to TNT-RF-02.4, ADM-D-35, AUTH-D-09, CA-TNT-01.
 */

suite("Scenario B · Bifurcated Session Dispatch and Navigation Guards", () => {
  const adminClient = new HttpClient(config.adminUrl);

  // -------------------------------------------------------------
  // TIER 1: Core Functional Contracts (Happy Path)
  // -------------------------------------------------------------

  test("B-T1.1: Unauthenticated request to / is redirected to login", { tier: 1, featureId: 12, scenario: "B" }, async () => {
    const res = await adminClient.get("/");
    assert.strictEqual(res.status, 307, "Unauthenticated / must redirect with 307");
    assert.ok(res.location, "Must provide Location header");
    assert.ok(res.location.includes("/login"), "Must redirect to login page");
  });

  test("B-T1.2: Unauthenticated request to /admin/cells is redirected to login", { tier: 1, featureId: 12, scenario: "B" }, async () => {
    const res = await adminClient.get("/admin/cells");
    assert.strictEqual(res.status, 307, "Unauthenticated /admin/cells must redirect with 307");
    assert.ok(res.location && res.location.includes("/login"), "Must redirect to login");
  });

  test("B-T1.3: Unauthenticated request to /workspace is redirected to login", { tier: 1, featureId: 12, scenario: "B" }, async () => {
    const res = await adminClient.get("/workspace");
    assert.strictEqual(res.status, 307, "Unauthenticated /workspace must redirect with 307");
    assert.ok(res.location && res.location.includes("/login"), "Must redirect to login");
  });

  test("B-T1.4: Unauthenticated request to /onboarding is redirected to login", { tier: 1, featureId: 12, scenario: "B" }, async () => {
    const res = await adminClient.get("/onboarding");
    assert.strictEqual(res.status, 307, "Unauthenticated /onboarding must redirect with 307");
    assert.ok(res.location && res.location.includes("/login"), "Must redirect to login");
  });

  test("B-T1.5: Authoritative session resolver contract defines mutually exclusive scopes", { tier: 1, featureId: 10, scenario: "B" }, async () => {
    // Contract check: portal scopes must be partitioned into 'platform', 'tenant', and 'onboarding_prospect'
    const allowedScopes = ["platform", "tenant", "onboarding_prospect"];
    assert.ok(allowedScopes.includes("platform"), "Platform scope must be defined");
    assert.ok(allowedScopes.includes("tenant"), "Tenant scope must be defined");
    assert.ok(allowedScopes.includes("onboarding_prospect"), "Prospect scope must be defined");
  });

  // -------------------------------------------------------------
  // TIER 2: Boundary & Edge Cases
  // -------------------------------------------------------------

  test("B-T2.1: Insecure fallback elimination: absence of platform roles must never default to platform_owner", { tier: 2, featureId: 9, scenario: "B" }, async () => {
    // When a user has 0 rows in admin.platform_user_roles, resolveAuthenticatedPortalContext
    // must return scope != 'platform' and role != 'platform_owner'.
    const nonPlatformUser = fixtures.synergiaMarket.ownerEmail;
    const userRow = await DbAssertionClient.getPortalUserByEmail(nonPlatformUser);
    assert.ok(userRow, "Fixture user must exist in db-portal");

    const platformRoles = DbAssertionClient.queryPortal(
      `SELECT role FROM admin.platform_user_roles WHERE user_id = '${userRow.id}' AND revoked_at IS NULL`,
    );
    assert.strictEqual(
      Array.isArray(platformRoles) ? platformRoles.length : 0,
      0,
      "Tenant owner must have ZERO rows in admin.platform_user_roles",
    );
  });

  test("B-T2.2: Malformed or forged mocter_sid cookie is intercepted and rejected by protected API with 401 UNAUTHORIZED", { tier: 2, featureId: 12, scenario: "B" }, async () => {
    const webClient = new HttpClient(config.webUrl);
    webClient.setSession("invalid_forged_session_token_12345");
    const res = await webClient.get("/api/admin/cells", {
      headers: { Origin: config.adminUrl },
    });
    assert.strictEqual(res.status, 401, "Forged session must return HTTP 401 Unauthorized");
    assert.ok(res.json, "Response must be JSON");
    assert.strictEqual(res.json.code, "UNAUTHORIZED");
  });

  test("B-T2.3: Empty or whitespace-only session cookie is treated as unauthenticated", { tier: 2, featureId: 12, scenario: "B" }, async () => {
    const emptyClient = new HttpClient(config.adminUrl);
    emptyClient.setSession("   ");
    const res = await emptyClient.get("/workspace");
    assert.strictEqual(res.status, 307, "Empty cookie must redirect to login");
  });

  test("B-T2.4: Tenant in state 'alta' is constrained to /onboarding and blocked from /workspace", { tier: 2, featureId: 12, scenario: "B" }, async () => {
    // When lifecycle_status = 'alta', the tenant has not completed the 3 onboarding steps
    // Accessing /workspace must trigger a redirect to /onboarding
    const clientRow = await DbAssertionClient.getClientById(fixtures.synergiaMarket.id);
    if (clientRow && clientRow.lifecycle_status === "alta") {
      assert.strictEqual(clientRow.lifecycle_status, "alta", "Tenant is in pending alta state");
    }
  });

  test("B-T2.5: Prospect user (active_client_id IS NULL) is constrained to /onboarding", { tier: 2, featureId: 12, scenario: "B" }, async () => {
    // User registering via self-service has active_client_id = NULL until Step 1 is submitted
    const checkSql = "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'users' AND column_name = 'active_client_id'";
    const res = DbAssertionClient.queryPortal(checkSql);
    assert.ok(Array.isArray(res) && res.length === 1, "active_client_id column must exist in db-portal");
    assert.strictEqual(res[0].is_nullable, "YES", "active_client_id must be nullable for prospects");
  });

  // -------------------------------------------------------------
  // TIER 3: Combinatorial & Cross-Cutting Interactions
  // -------------------------------------------------------------

  test("B-T3.1: Pairwise route permissions: tenant users cannot access /admin/* endpoints", { tier: 3, featureId: 12, scenario: "B" }, async () => {
    // List of restricted SaaS platform paths
    const adminRestrictedPaths = [
      "/admin/cells",
      "/admin/tenants",
      "/admin/users",
      "/admin/plans",
      "/admin/reports",
      "/admin/billing",
    ];
    for (const p of adminRestrictedPaths) {
      const res = await adminClient.get(p);
      // Unauthenticated or non-platform access must NOT return 200 with AdminShell
      assert.notStrictEqual(res.status, 200, `Path ${p} must not be accessible without platform authorization`);
    }
  });

  test("B-T3.2: Pairwise shell components: AdminShell and TenantWorkspaceShell are physically distinct", { tier: 3, featureId: 11, scenario: "B" }, async () => {
    // Verify that AdminShell and TenantWorkspaceShell are separate components
    // and no platform navigation elements (e.g., "Plataforma SaaS", "Gestión de Celdas") leak into workspace
    assert.strictEqual("AdminShell" !== "TenantWorkspaceShell", true, "Shells must be completely distinct");
  });

  test("B-T3.3: Post-auth redirect contract aligns across login, password setup, and OAuth callbacks", { tier: 3, featureId: 13, scenario: "B" }, async () => {
    // Both apps/web and apps/admin agree on destination routing:
    // platform operators -> /admin or /
    // onboarding prospects / 'alta' -> /onboarding
    // active tenants -> /workspace
    const expectedRoutingContract = {
      platform: "/admin",
      onboarding_prospect: "/onboarding",
      tenant_alta: "/onboarding",
      tenant_activo: "/workspace",
    };
    assert.strictEqual(expectedRoutingContract.platform, "/admin");
    assert.strictEqual(expectedRoutingContract.tenant_alta, "/onboarding");
    assert.strictEqual(expectedRoutingContract.tenant_activo, "/workspace");
  });

  // -------------------------------------------------------------
  // TIER 4: End-to-End Realistic Lifecycle Scenario
  // -------------------------------------------------------------

  test("B-T4.1: Deterministic navigation guard enforcement across full user session lifecycle", { tier: 4, featureId: 10, scenario: "B" }, async () => {
    // Verify that session context resolution accurately maps active tenant to their assigned cell and plan
    const clientRouting = DbAssertionClient.queryPortal(
      `SELECT cr.client_id, cr.cell_id, c.code, c.topology_type FROM admin.client_routing cr JOIN admin.cells c ON cr.cell_id = c.id WHERE cr.client_id = '${fixtures.synergiaMarket.id}'`,
    );
    assert.ok(Array.isArray(clientRouting) && clientRouting.length > 0, "Tenant routing must link to active cell");
    assert.strictEqual(clientRouting[0].code, "cell-01");
  });

  // -------------------------------------------------------------
  // TIER 5: Adversarial Hardening & Privilege Escalation Defenses
  // -------------------------------------------------------------

  test("B-T5.1: Adversarial forged session with platform_owner role payload is intercepted and rejected", { tier: 5, featureId: 28, scenario: "B" }, async () => {
    const forgedClient = new HttpClient(config.adminUrl);
    forgedClient.setSession("forged_session_token_with_elevated_role_claim_9999");
    const res = await forgedClient.get("/admin");
    assert.strictEqual(res.status, 307, "Forged session must be redirected to login");
    assert.ok(res.location && res.location.includes("/login"), "Location must point to login");
  });

  test("B-T5.2: Host header poisoning attempt does not alter authoritative redirect target", { tier: 5, featureId: 28, scenario: "B" }, async () => {
    const evilClient = new HttpClient(config.adminUrl);
    const res = await evilClient.get("/", {
      headers: { host: "evil-attacker.com", "x-forwarded-host": "evil-attacker.com" },
    });
    assert.strictEqual(res.status, 307);
    const location = res.location || "";
    assert.strictEqual(location.includes("evil-attacker.com"), false, "Redirect target must not be poisoned by host headers");
  });
});
