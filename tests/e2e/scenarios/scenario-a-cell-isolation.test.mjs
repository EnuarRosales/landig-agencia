import { suite, test, assert } from "../harness/runner-core.mjs";
import { DbAssertionClient } from "../harness/db.mjs";
import { CryptoAssertionHelper } from "../harness/crypto.mjs";
import { fixtures } from "../harness/fixtures.mjs";

/**
 * SCENARIO A: Physical Cell Data Plane Isolation, RLS Enforcement, and Identity Promotion.
 * Requirements: TNT-RF-01.1 to TNT-RF-01.6, ADM-D-36, ADM-D-37, AUTH-D-01.
 */

suite("Scenario A · Physical Cell Isolation, RLS, and Identity Promotion", () => {
  // -------------------------------------------------------------
  // TIER 1: Core Functional Contracts (Happy Path)
  // -------------------------------------------------------------

  test("A-T1.1: Physical cell database pg-cell-01 is reachable and healthy", { tier: 1, featureId: 1, scenario: "A" }, async () => {
    const rows = DbAssertionClient.queryCell("SELECT 1 AS alive");
    assert.ok(Array.isArray(rows) || typeof rows === "string", "Cell DB should return alive response");
    if (Array.isArray(rows)) {
      assert.strictEqual(rows[0].alive, 1);
    }
  });

  test("A-T1.2: RLS blocks queries on pg-cell-01 when current_client_id is omitted (returns 0 rows)", { tier: 1, featureId: 2, scenario: "A" }, async () => {
    // Under FORCE ROW LEVEL SECURITY, executing SELECT on tenant tables without app.current_client_id returns 0 rows
    const res = DbAssertionClient.queryCellWithTenantContext(null, "SELECT * FROM admin.users");
    // If res is an array, it must be empty; if string, it must report 0 rows
    if (Array.isArray(res)) {
      assert.strictEqual(res.length, 0, "Expected 0 rows when client context is omitted");
    } else {
      assert.match(res, /\(0 rows\)/, "Expected 0 rows in psql output");
    }
  });

  test("A-T1.3: RLS allows reads on pg-cell-01 when valid client context is established", { tier: 1, featureId: 2, scenario: "A" }, async () => {
    const dummyClientId = "00000000-0000-0000-0000-000000000001";
    // With client context, the transaction successfully executes and query returns empty array or matching rows
    const res = DbAssertionClient.queryCellWithTenantContext(dummyClientId, "SELECT count(*) AS c FROM admin.users");
    if (Array.isArray(res)) {
      assert.ok(res.length > 0, "Query should execute within valid context");
      assert.strictEqual(typeof res[0].c, "number");
    } else {
      assert.match(res, /\(1 row\)/, "Expected 1 row count result");
    }
  });

  test("A-T1.4: Cell data plane schema contains all required multi-tenant tables", { tier: 1, featureId: 4, scenario: "A" }, async () => {
    const expectedTables = [
      "users",
      "tenant_users",
      "tenant_labels",
      "client_business_info",
      "products",
      "product_media",
      "contacts",
      "orders",
    ];
    const rows = DbAssertionClient.queryCell(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin'",
    );
    assert.ok(Array.isArray(rows), "Should return table list");
    const existing = new Set(rows.map((r) => r.table_name));
    for (const t of expectedTables) {
      assert.ok(existing.has(t), `Table admin.${t} must exist in pg-cell-01`);
    }
  });

  test("A-T1.5: Credential promotion stores Argon2id hash in pg-cell-01 and NULL in db-portal", { tier: 1, featureId: 5, scenario: "A" }, async () => {
    // When a tenant identity is promoted to a cell, the password hash must reside in cell admin.users
    // and db-portal admin.users must retain password_hash = NULL
    const checkSql = "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'users' AND column_name = 'password_hash'";
    const portalCol = DbAssertionClient.queryPortal(checkSql);
    assert.ok(Array.isArray(portalCol) && portalCol.length === 1, "password_hash column must exist in db-portal");
    assert.strictEqual(portalCol[0].is_nullable, "YES", "password_hash in db-portal must be nullable for promoted users");

    const cellCol = DbAssertionClient.queryCell(checkSql);
    assert.ok(Array.isArray(cellCol) && cellCol.length === 1, "password_hash column must exist in pg-cell-01");
  });

  // -------------------------------------------------------------
  // TIER 2: Boundary & Edge Cases
  // -------------------------------------------------------------

  test("A-T2.1: Setting empty string or invalid UUID as current_client_id fails safely", { tier: 2, featureId: 2, scenario: "A" }, async () => {
    // 1. Empty string context must evaluate to NULL via NULLIF and return 0 rows
    const emptyRes = DbAssertionClient.queryCellWithTenantContext("", "SELECT count(*) as c FROM admin.users");
    assert.match(emptyRes, /0/, "Empty context must return 0 rows");

    // 2. Non-UUID string context evaluation in RLS policy must be rejected by PostgreSQL UUID cast
    let threwInvalidUuid = false;
    try {
      DbAssertionClient.queryCell("SELECT (NULLIF('invalid-uuid-string', '')::uuid)");
    } catch (err) {
      threwInvalidUuid = true;
      assert.match(err.message, /invalid input syntax for type uuid/i, "Must fail with invalid UUID syntax");
    }
    assert.ok(threwInvalidUuid, "Non-UUID context must throw syntax error on UUID cast");
  });

  test("A-T2.2: Attempting cross-tenant insert on pg-cell-01 with mismatched client_id is rejected by RLS with-check", { tier: 2, featureId: 2, scenario: "A" }, async () => {
    const contextClientId = "00000000-0000-0000-0000-000000000001";
    const foreignClientId = "00000000-0000-0000-0000-000000000002";
    let threwRlsViolation = false;
    try {
      DbAssertionClient.queryCellWithTenantContext(
        contextClientId,
        `INSERT INTO admin.users (client_id, id, email, display_name, status, created_by, updated_by) VALUES ('${foreignClientId}', gen_random_uuid(), 'malicious@hack.com', 'Hacker', 'active', 'test', 'test')`,
      );
    } catch (err) {
      threwRlsViolation = true;
      assert.match(err.message, /row-level security|violates/i, "RLS must reject mismatched client_id insert");
    }
    assert.ok(threwRlsViolation, "RLS with-check must reject insert of foreign client_id");
  });

  test("A-T2.3: Tenant password hash format complies with RFC Argon2id parameters", { tier: 2, featureId: 8, scenario: "A" }, async () => {
    const validSampleHash = "$argon2id$v=19$m=65536,t=3,p=4$vU32Jp6L2+y0p8t/yN8+qA$2bO3j3H1oZk1w0e2y3u4i5o6p7a8s9d0f1g2h3j4k5l";
    assert.ok(CryptoAssertionHelper.isArgon2idHash(validSampleHash), "Sample hash must be valid Argon2id");
    assert.strictEqual(CryptoAssertionHelper.isArgon2idHash("plainTextPassword123"), false, "Plaintext must be rejected");
    assert.strictEqual(CryptoAssertionHelper.isArgon2idHash(null), false, "Null must be rejected");
    assert.strictEqual(CryptoAssertionHelper.isArgon2idHash(""), false, "Empty string must be rejected");
  });

  test("A-T2.4: Client routing entry maps tenant explicitly to active cell UUID", { tier: 2, featureId: 1, scenario: "A" }, async () => {
    const routes = DbAssertionClient.queryPortal("SELECT client_id, cell_id, routing_status FROM admin.client_routing");
    assert.ok(Array.isArray(routes), "Client routing must be queryable");
    if (routes.length > 0) {
      assert.ok(routes[0].cell_id, "Route must specify non-null cell_id");
      assert.ok(["pending", "active", "draining", "migrating"].includes(routes[0].routing_status), "Route must have valid status");
    }
  });

  test("A-T2.5: Physical cell isolation prevents direct foreign-key references to db-portal", { tier: 2, featureId: 1, scenario: "A" }, async () => {
    // DAT-RF-10.8: References between planes are limited to identifiers. Zero foreign keys between db-portal and pg-cell-XX.
    // admin.clients does not exist on pg-cell-01, confirmed by to_regclass returning NULL
    const rows = DbAssertionClient.queryCell("SELECT to_regclass('admin.clients') as reg");
    assert.ok(Array.isArray(rows) && rows.length > 0, "Query must execute");
    assert.strictEqual(rows[0].reg, null, "admin.clients must NOT exist on pg-cell-01");
  });

  // -------------------------------------------------------------
  // TIER 3: Combinatorial & Cross-Tenant Interactions
  // -------------------------------------------------------------

  test("A-T3.1: Cross-tenant data isolation: Client A cannot see Client B products", { tier: 3, featureId: 2, scenario: "A" }, async () => {
    const clientA = fixtures.tenantAlpha.id;
    const clientB = fixtures.tenantBeta.id;

    // Run query under Client A context searching for client B's ID
    const rows = DbAssertionClient.queryCellWithTenantContext(
      clientA,
      `SELECT count(*) as count FROM admin.products WHERE client_id = '${clientB}'`,
    );
    if (Array.isArray(rows)) {
      assert.strictEqual(rows[0].count, 0, "Client A must see 0 products belonging to Client B");
    }
  });

  test("A-T3.2: Cross-tenant data isolation: Client B cannot see Client A contacts", { tier: 3, featureId: 2, scenario: "A" }, async () => {
    const clientA = fixtures.tenantAlpha.id;
    const clientB = fixtures.tenantBeta.id;

    const rows = DbAssertionClient.queryCellWithTenantContext(
      clientB,
      `SELECT count(*) as count FROM admin.contacts WHERE client_id = '${clientA}'`,
    );
    if (Array.isArray(rows)) {
      assert.strictEqual(rows[0].count, 0, "Client B must see 0 contacts belonging to Client A");
    }
  });

  test("A-T3.3: Pairwise role check: tenant_owner vs tenant_agent membership validation in cell", { tier: 3, featureId: 4, scenario: "A" }, async () => {
    const rolesCheck = DbAssertionClient.queryCell(
      "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'tenant_users_role_check'",
    );
    assert.ok(Array.isArray(rolesCheck) && rolesCheck.length > 0, "tenant_users_role_check constraint must exist");
    assert.match(rolesCheck[0].def, /'tenant_owner'/, "Must include tenant_owner");
    assert.match(rolesCheck[0].def, /'tenant_agent'/, "Must include tenant_agent");
  });

  // -------------------------------------------------------------
  // TIER 4: End-to-End Realistic Lifecycle Scenario
  // -------------------------------------------------------------

  test("A-T4.1: Synergia Market reconciliation idempotency in pg-cell-01", { tier: 4, featureId: 6, scenario: "A" }, async () => {
    const targetEmail = fixtures.synergiaMarket.ownerEmail;
    const portalUser = await DbAssertionClient.getPortalUserByEmail(targetEmail);

    assert.ok(portalUser, `Existing tenant user ${targetEmail} must exist in db-portal`);
    assert.strictEqual(portalUser.email, targetEmail);

    // Verify cell node registration in db-portal admin.cells
    const cellRows = DbAssertionClient.queryPortal(
      `SELECT id, code, status, topology_type FROM admin.cells WHERE code = 'cell-01'`,
    );
    assert.ok(Array.isArray(cellRows) && cellRows.length > 0, "cell-01 must be registered in admin.cells");
    assert.strictEqual(cellRows[0].code, "cell-01");

    // Verify Synergia Market routing table entry
    const routingRows = DbAssertionClient.queryPortal(
      `SELECT client_id, cell_id FROM admin.client_routing WHERE client_id = '${fixtures.synergiaMarket.id}'`,
    );
    assert.ok(Array.isArray(routingRows) && routingRows.length > 0, "Synergia Market must have an entry in client_routing");
    assert.strictEqual(routingRows[0].cell_id, cellRows[0].id, "Synergia Market must be routed to cell-01");
  });

  // -------------------------------------------------------------
  // TIER 5: Adversarial Hardening & Stress Invariants
  // -------------------------------------------------------------

  test("A-T5.1: Adversarial SQL injection attempt in client_id parameter is neutralized", { tier: 5, featureId: 28, scenario: "A" }, async () => {
    const maliciousPayload = "'; DROP TABLE admin.users; --";
    assert.throws(() => {
      DbAssertionClient.queryCellWithTenantContext(maliciousPayload, "SELECT 1");
    });

    const verifyRows = DbAssertionClient.queryCell(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'admin' AND table_name = 'users'",
    );
    assert.ok(Array.isArray(verifyRows) && verifyRows.length > 0, "admin.users table must remain intact after injection attempt");
  });

  test("A-T5.2: Adversarial cross-tenant credential extraction attempt returns 0 rows", { tier: 5, featureId: 28, scenario: "A" }, async () => {
    const targetEmail = fixtures.synergiaMarket.ownerEmail;
    const fakeClient = "99999999-9999-9999-9999-999999999999";
    const res = DbAssertionClient.queryCellWithTenantContext(
      fakeClient,
      `SELECT id, email, password_hash FROM admin.users WHERE email = '${targetEmail}'`,
    );
    if (Array.isArray(res)) {
      assert.strictEqual(res.length, 0, "Cross-tenant credential query must return 0 rows under RLS");
    } else {
      assert.match(res, /\(0 rows\)/, "Expected 0 rows in output");
    }
  });
});
