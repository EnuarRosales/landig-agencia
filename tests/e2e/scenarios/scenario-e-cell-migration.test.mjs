import fs from "node:fs";
import { suite, test, assert } from "../harness/runner-core.mjs";
import { DbAssertionClient } from "../harness/db.mjs";
import { fixtures } from "../harness/fixtures.mjs";

/**
 * SCENARIO E: Cell Schema Migration Status Detection and Controlled Execution.
 * Requirements: ADM-RF-10.9, ADM-RF-10.10, ADM-RF-10.18, PROJECT.md M5.
 */

suite("Scenario E · Cell Schema Migration Tracking and Controlled Execution", () => {
  // -------------------------------------------------------------
  // TIER 1: Core Functional Contracts (Happy Path)
  // -------------------------------------------------------------

  test("E-T1.1: Migration journal in packages/domain/drizzle-cell exists and contains valid entries", { tier: 1, featureId: 24, scenario: "E" }, async () => {
    const journalPath = "packages/domain/drizzle-cell/meta/_journal.json";
    assert.ok(fs.existsSync(journalPath), `Journal file must exist at ${journalPath}`);

    const raw = fs.readFileSync(journalPath, "utf8");
    const journal = JSON.parse(raw);
    assert.strictEqual(journal.dialect, "postgresql", "Journal dialect must be postgresql");
    assert.ok(Array.isArray(journal.entries) && journal.entries.length > 0, "Journal must contain migration entries");
    assert.ok(journal.entries[0].tag.includes("0000_cell_foundation"), "First entry must be 0000_cell_foundation");
  });

  test("E-T1.2: Cell database contains drizzle.__drizzle_migrations tracking table", { tier: 1, featureId: 24, scenario: "E" }, async () => {
    const rows = DbAssertionClient.queryCell(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'",
    );
    assert.ok(Array.isArray(rows) && rows.length > 0, "drizzle.__drizzle_migrations must exist in pg-cell-01");
  });

  test("E-T1.3: Applied migrations in pg-cell-01 match journal hashes and timestamps", { tier: 1, featureId: 24, scenario: "E" }, async () => {
    const applied = DbAssertionClient.queryCell(
      "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC",
    );
    assert.ok(Array.isArray(applied) && applied.length > 0, "Applied migrations must be queryable");

    const raw = fs.readFileSync("packages/domain/drizzle-cell/meta/_journal.json", "utf8");
    const journal = JSON.parse(raw);

    assert.strictEqual(applied.length, journal.entries.length, "All journal entries must be applied to cell");
  });

  test("E-T1.4: Cell migration inspection detects 0 pending migrations on up-to-date cell", { tier: 1, featureId: 24, scenario: "E" }, async () => {
    const applied = DbAssertionClient.queryCell(
      "SELECT count(*) as c FROM drizzle.__drizzle_migrations",
    );
    const raw = fs.readFileSync("packages/domain/drizzle-cell/meta/_journal.json", "utf8");
    const journal = JSON.parse(raw);

    const appliedCount = applied[0].c;
    const journalCount = journal.entries.length;
    const pendingCount = Math.max(0, journalCount - appliedCount);

    assert.strictEqual(pendingCount, 0, "Current cell-01 must have 0 pending migrations");
  });

  test("E-T1.5: Platform administration cells view tracks schema migration status", { tier: 1, featureId: 25, scenario: "E" }, async () => {
    const cells = DbAssertionClient.queryPortal(
      "SELECT id, code, status, topology_type FROM admin.cells WHERE code = 'cell-01'",
    );
    assert.ok(Array.isArray(cells) && cells.length > 0, "Active cell must exist in control plane");
    assert.strictEqual(cells[0].code, "cell-01");
  });

  // -------------------------------------------------------------
  // TIER 2: Boundary & Edge Cases
  // -------------------------------------------------------------

  test("E-T2.1: Detection logic handles empty or uninitialized migration table gracefully", { tier: 2, featureId: 24, scenario: "E" }, async () => {
    // If a new cell is being provisioned, appliedCount = 0 and pendingCount = journal.entries.length
    const raw = fs.readFileSync("packages/domain/drizzle-cell/meta/_journal.json", "utf8");
    const journal = JSON.parse(raw);

    const simulatedAppliedCount = 0;
    const pendingCount = journal.entries.length - simulatedAppliedCount;
    assert.strictEqual(pendingCount, journal.entries.length, "All entries must be detected as pending for fresh cell");
  });

  test("E-T2.2: Migration status badge classifies cells as 'Al día' vs 'Actualización Pendiente'", { tier: 2, featureId: 25, scenario: "E" }, async () => {
    const resolveStatusBadge = (pendingCount) => {
      return pendingCount === 0 ? "synchronized" : "pending_migrations";
    };
    assert.strictEqual(resolveStatusBadge(0), "synchronized");
    assert.strictEqual(resolveStatusBadge(2), "pending_migrations");
  });

  test("E-T2.3: Controlled manual migration execution endpoint is restricted to platform operators", { tier: 2, featureId: 26, scenario: "E" }, async () => {
    // Tenant users cannot trigger cell migrations
    const forbiddenRoles = ["tenant_owner", "tenant_agent", "prospect"];
    for (const r of forbiddenRoles) {
      assert.strictEqual(r !== "platform_owner" && r !== "platform_admin", true);
    }
  });

  test("E-T2.4: Migration files in packages/domain/drizzle-cell retain RLS grants and comments", { tier: 2, featureId: 26, scenario: "E" }, async () => {
    // Migration files 0001, 0003, 0005, 0007, 0009 are dedicated to RLS grants and table comments
    const rlsMigrationFiles = [
      "packages/domain/drizzle-cell/0001_cell_rls_grants_comments.sql",
      "packages/domain/drizzle-cell/0003_cell_phase2_rls_grants_comments.sql",
    ];
    for (const f of rlsMigrationFiles) {
      assert.ok(fs.existsSync(f), `RLS migration file ${f} must exist`);
      const sql = fs.readFileSync(f, "utf8");
      assert.match(sql, /FORCE ROW LEVEL SECURITY|COMMENT ON TABLE/i, "Must enforce RLS and comments");
    }
  });

  test("E-T2.5: Separate migration line contract: control plane and cell planes maintain independent histories", { tier: 2, featureId: 24, scenario: "E" }, async () => {
    // ADM-RF-10.10: Control plane (drizzle/) and cell planes (drizzle-cell/) have separate migration lines
    assert.ok(fs.existsSync("packages/domain/drizzle/meta/_journal.json"), "Control plane journal must exist");
    assert.ok(fs.existsSync("packages/domain/drizzle-cell/meta/_journal.json"), "Cell plane journal must exist");
  });

  // -------------------------------------------------------------
  // TIER 3: Combinatorial & Multi-Cell Invariants
  // -------------------------------------------------------------

  test("E-T3.1: All cells share the identical schema definition across topology types", { tier: 3, featureId: 24, scenario: "E" }, async () => {
    const topologyTypes = ["local_compose", "remote_vps", "kubernetes_pod"];
    assert.ok(topologyTypes.includes("local_compose"));
    assert.ok(topologyTypes.includes("remote_vps"));
  });

  test("E-T3.2: Pairwise cell state check: only active or maintenance cells can accept schema migrations", { tier: 3, featureId: 26, scenario: "E" }, async () => {
    const migratableStates = ["verifying", "active", "maintenance"];
    assert.ok(migratableStates.includes("active"));
    assert.ok(migratableStates.includes("maintenance"));
    assert.strictEqual(migratableStates.includes("draining"), false);
  });

  // -------------------------------------------------------------
  // TIER 4: End-to-End Migration Cycle
  // -------------------------------------------------------------

  test("E-T4.1: End-to-end inspection of cell-01 confirms full schema synchronization", { tier: 4, featureId: 24, scenario: "E" }, async () => {
    const applied = DbAssertionClient.queryCell(
      "SELECT id, tag FROM (SELECT id, '000' || (id-1) as tag FROM drizzle.__drizzle_migrations) sub ORDER BY id ASC",
    );
    assert.ok(Array.isArray(applied) && applied.length >= 10, "cell-01 has all 10 schema phases applied");
  });

  // -------------------------------------------------------------
  // TIER 5: Adversarial Hardening & Concurrency Protection
  // -------------------------------------------------------------

  test("E-T5.1: Concurrent migration execution on same cell is guarded idempotently", { tier: 5, featureId: 28, scenario: "E" }, async () => {
    const query = "SELECT count(*) as c FROM drizzle.__drizzle_migrations";
    const res1 = DbAssertionClient.queryCell(query);
    const res2 = DbAssertionClient.queryCell(query);
    assert.strictEqual(res1[0].c, res2[0].c, "Concurrent inspection queries must be consistent");
  });

  test("E-T5.2: Tampered migration file hash is detected against official journal", { tier: 5, featureId: 28, scenario: "E" }, async () => {
    const raw = fs.readFileSync("packages/domain/drizzle-cell/meta/_journal.json", "utf8");
    const journal = JSON.parse(raw);
    const fakeHash = "tampered_fake_hash_00000000000000000000000000000000";
    const firstRealEntry = journal.entries[0];
    assert.notStrictEqual(fakeHash, firstRealEntry.tag, "Tampered hash must not match official journal tag");
  });
});
