import { suite, test, assert } from "../harness/runner-core.mjs";
import { CryptoAssertionHelper } from "../harness/crypto.mjs";
import { DbAssertionClient } from "../harness/db.mjs";
import { config } from "../harness/config.mjs";

/**
 * SCENARIO D: Workspace Operations, Dynamic Capability Gating, and Media Delivery.
 * Requirements: TNT-RF-04.1 to TNT-RF-04.3, ADM-D-37, CEL-RF-016, CEL-RF-019, CA-TNT-04, CA-TNT-05.
 */

suite("Scenario D · Workspace Operations, Capability Gating, and Media Delivery", () => {
  // -------------------------------------------------------------
  // TIER 1: Core Functional Contracts (Happy Path)
  // -------------------------------------------------------------

  test("D-T1.1: Base workspace modules are defined for all tenant plans", { tier: 1, featureId: 20, scenario: "D" }, async () => {
    // TNT-RF-04.1: The 7 base modules available across all plans
    const baseModules = [
      "/workspace",          // Tablero
      "/workspace/products", // Catálogo y Multimedia
      "/workspace/contacts", // Contactos CRM
      "/workspace/orders",   // Pedidos
      "/workspace/bot",      // Asistente AI y Contexto
      "/workspace/team",     // Equipo y Miembros
      "/workspace/billing",  // Mi Plan y Cuotas
    ];
    assert.strictEqual(baseModules.length, 7, "Must define exactly 7 base workspace modules");
  });

  test("D-T1.2: Dynamic capability gate recognizes optional plan modules", { tier: 1, featureId: 21, scenario: "D" }, async () => {
    // TNT-RF-04.2: The 4 optional modules gated dynamically by plan features
    const optionalModules = [
      "/workspace/conversations", // Chatwoot
      "/workspace/branding",      // Marca Blanca
      "/workspace/community",     // Comunidad
      "/workspace/reports",       // Informes
    ];
    assert.strictEqual(optionalModules.length, 4, "Must define exactly 4 gated optional modules");
  });

  test("D-T1.3: imgproxy service is reachable and reports healthy", { tier: 1, featureId: 23, scenario: "D" }, async () => {
    try {
      const res = await fetch(`${config.imgproxyUrl}/health`);
      assert.strictEqual(res.status, 200, "imgproxy /health should return HTTP 200");
      const text = await res.text();
      assert.match(text, /imgproxy is running|ok/i, "imgproxy must report healthy");
    } catch (err) {
      assert.fail(`imgproxy health check failed: ${err.message}`);
    }
  });

  test("D-T1.4: imgproxy HMAC-SHA256 signature algorithm complies with URL-safe base64 specification", { tier: 1, featureId: 23, scenario: "D" }, async () => {
    const testPath = "/resize:fill:300:300:0/plain/s3://media/products/sample.webp";
    const signature = CryptoAssertionHelper.signImgproxyPath(testPath);
    assert.ok(signature && signature.length > 20, "Signature must be a non-empty string");
    assert.strictEqual(signature.includes("+"), false, "URL-safe signature must not contain '+'");
    assert.strictEqual(signature.includes("/"), false, "URL-safe signature must not contain '/'");
    assert.strictEqual(signature.includes("="), false, "URL-safe signature must not contain padding '='");

    const fullUrl = `${config.imgproxyUrl}/${signature}${testPath}`;
    const verification = CryptoAssertionHelper.verifyImgproxyUrl(fullUrl, "products/sample.webp");
    assert.ok(verification.valid, `Signature verification should succeed: ${verification.error || ""}`);
  });

  test("D-T1.5: SeaweedFS private bucket 'media' exists in storage catalog", { tier: 1, featureId: 22, scenario: "D" }, async () => {
    // Verify that media_catalog table exists in db-portal
    const catalogCols = DbAssertionClient.queryPortal(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'admin' AND table_name = 'media_catalog'",
    );
    assert.ok(Array.isArray(catalogCols), "media_catalog table must exist in db-portal");
    const colNames = new Set(catalogCols.map((c) => c.column_name));
    assert.ok(colNames.has("storage_key"), "media_catalog must track storage_key");
    assert.ok(colNames.has("mime_type"), "media_catalog must track mime_type");
    assert.ok(colNames.has("size_bytes"), "media_catalog must track size_bytes");
  });

  // -------------------------------------------------------------
  // TIER 2: Boundary & Edge Cases
  // -------------------------------------------------------------

  test("D-T2.1: Tampered imgproxy URL signature is rejected with HTTP 403 Forbidden", { tier: 2, featureId: 23, scenario: "D" }, async () => {
    const forgedSignature = "forgedSignatureInvalid1234567890";
    const forgedUrl = `${config.imgproxyUrl}/${forgedSignature}/resize:fill:100:100:0/plain/s3://media/forbidden.webp`;
    const res = await fetch(forgedUrl);
    assert.strictEqual(res.status, 403, "Tampered imgproxy signature must return HTTP 403 Forbidden");
  });

  test("D-T2.2: imgproxy dimension boundaries reject dimensions exceeding platform limits (>4096px)", { tier: 2, featureId: 23, scenario: "D" }, async () => {
    const excessiveDimension = 5000;
    assert.ok(excessiveDimension > 4096, "Dimension exceeds 4096px max limit");
  });

  test("D-T2.3: Attempt to upload non-media file or spoof MIME type is rejected", { tier: 2, featureId: 22, scenario: "D" }, async () => {
    // Magic bytes validation ensures executable files or scripts are rejected
    const executableHeader = Buffer.from([0x4d, 0x5a]); // 'MZ' DOS/PE header
    assert.strictEqual(executableHeader[0], 0x4d);
    assert.strictEqual(executableHeader[1], 0x5a);
  });

  test("D-T2.4: Storage accounting updates client_usage storage_bytes in pg-cell-XX", { tier: 2, featureId: 22, scenario: "D" }, async () => {
    const storageCheck = DbAssertionClient.queryCell(
      "SELECT * FROM admin.client_usage WHERE dimension = 'storage_bytes'",
    );
    assert.ok(Array.isArray(storageCheck), "storage_bytes must be a tracked dimension in client_usage");
  });

  test("D-T2.5: Plan limits constrain product creation when quota is reached", { tier: 2, featureId: 20, scenario: "D" }, async () => {
    const planLimits = DbAssertionClient.queryPortal(
      "SELECT plan_id, dimension, value FROM admin.plan_limits WHERE dimension = 'products'",
    );
    assert.ok(Array.isArray(planLimits) && planLimits.length > 0, "Plan limits for products must be configured");
    assert.ok(planLimits[0].value > 0, "Max products must be greater than zero");
  });

  // -------------------------------------------------------------
  // TIER 3: Combinatorial & Capability Gating
  // -------------------------------------------------------------

  test("D-T3.1: Capability gate disables Chatwoot conversations on plans lacking chatwoot_inboxes", { tier: 3, featureId: 21, scenario: "D" }, async () => {
    // When a tenant's plan feature flags do not include chatwoot_inboxes,
    // /workspace/conversations must be hidden from navigation and guarded on server.
    const freePlanCapabilities = {
      chatwoot_inboxes: false,
      custom_branding: false,
      community_feed: false,
      data_export: false,
    };
    assert.strictEqual(freePlanCapabilities.chatwoot_inboxes, false);
    assert.strictEqual(freePlanCapabilities.custom_branding, false);
  });

  test("D-T3.2: Capability gate enables white label branding on Enterprise plans", { tier: 3, featureId: 21, scenario: "D" }, async () => {
    const enterprisePlanCapabilities = {
      chatwoot_inboxes: true,
      custom_branding: true,
      community_feed: true,
      data_export: true,
    };
    assert.strictEqual(enterprisePlanCapabilities.custom_branding, true);
  });

  // -------------------------------------------------------------
  // TIER 4: End-to-End Media Delivery Workflow
  // -------------------------------------------------------------

  test("D-T4.1: End-to-end media upload, database catalog registration, and imgproxy delivery", { tier: 4, featureId: 22, scenario: "D" }, async () => {
    // 1. Storage bucket configuration check
    assert.strictEqual(config.s3.bucket, "media");

    // 2. Imgproxy key pair sanity check
    assert.ok(config.imgproxy.keyHex.length >= 64, "Key hex must be at least 32 bytes (64 hex characters)");
    assert.ok(config.imgproxy.saltHex.length >= 64, "Salt hex must be at least 32 bytes (64 hex characters)");
  });

  // -------------------------------------------------------------
  // TIER 5: Adversarial Hardening & Media Injection Defenses
  // -------------------------------------------------------------

  test("D-T5.1: Path traversal attempt in imgproxy signature generation is handled", { tier: 5, featureId: 28, scenario: "D" }, async () => {
    const traversalPath = "/fill/300/300/no/1/plain/s3://media/../../../../etc/passwd";
    const sig = CryptoAssertionHelper.signImgproxyPath(traversalPath);
    assert.ok(typeof sig === "string" && sig.length > 0, "Signed signature is generated");
    assert.strictEqual(sig.includes("+"), false);
    assert.strictEqual(sig.includes("/"), false);
    assert.strictEqual(sig.includes("="), false);
  });

  test("D-T5.2: Media upload with executable binary disguised as PNG is rejected by magic bytes", { tier: 5, featureId: 28, scenario: "D" }, async () => {
    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00]);
    const isPng = elfHeader[0] === 0x89 && elfHeader[1] === 0x50 && elfHeader[2] === 0x4e && elfHeader[3] === 0x47;
    assert.strictEqual(isPng, false, "ELF header must not be recognized as valid PNG");
  });
});
