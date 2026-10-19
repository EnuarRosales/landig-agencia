import { describe, it, expect } from "vitest";
import { getOpenApiSpec } from "./openapi";

describe("OpenAPI Specification Generator", () => {
  it("debe generar un documento OpenAPI válido con versión 3.1.0", () => {
    const spec = getOpenApiSpec();

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe("Mocter API");
    expect(spec.info.version).toBe("1.0.0");
  });

  it("debe registrar y documentar el endpoint GET /api/health", () => {
    const spec = getOpenApiSpec();
    const healthPath = spec.paths?.["/api/health"];

    expect(healthPath).toBeDefined();
    expect(healthPath?.get).toBeDefined();
    expect(healthPath?.get?.summary).toContain("Monitoreo de salud");
    expect(healthPath?.get?.responses?.["200"]).toBeDefined();
    expect(healthPath?.get?.responses?.["503"]).toBeDefined();
  });

  it("debe registrar y documentar el endpoint POST /api/leads", () => {
    const spec = getOpenApiSpec();
    const leadsPath = spec.paths?.["/api/leads"];

    expect(leadsPath).toBeDefined();
    expect(leadsPath?.post).toBeDefined();
    expect(leadsPath?.post?.summary).toContain("solicitud de demostración");
    expect(leadsPath?.post?.requestBody).toBeDefined();
    expect(leadsPath?.post?.responses?.["201"]).toBeDefined();
    expect(leadsPath?.post?.responses?.["400"]).toBeDefined();
    expect(leadsPath?.post?.responses?.["429"]).toBeDefined();
    expect(leadsPath?.post?.responses?.["500"]).toBeDefined();
  });
});
