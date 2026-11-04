import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockReports = {
  kpis: { totalMrrCop: 500000, activeTenants: 2, totalStorageMb: 5, totalTokensConsumed: 10000 },
  tenantsByPlan: [],
  tenantsByStatus: [],
  storage: { originalBytes: 0, variantsBytes: 0, totalBytes: 0, filesCount: 0 },
  aiUsage: { botTokens: 0, assistTokens: 0, totalTokens: 0, totalCostUsdCents: 0 },
};

const mockAssertCapability = vi.fn();

vi.mock("@mocter/domain", () => ({
  fetchAdminPlatformReports: vi.fn().mockImplementation(() => Promise.resolve(mockReports)),
  DrizzleTenantCapabilityGateRepository: class MockRepo {},
  TenantCapabilityGateService: class MockService {
    assertCapability = mockAssertCapability;
  },
}));

describe("REP-001 / CA-008 · Route Handler (/api/admin/reports)", () => {
  it("GET responde 200 con el resumen de métricas agregadas globales cuando no se especifica inquilino", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/reports");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.kpis.totalMrrCop).toBe(500000);
  });

  it("responde 403 con mensaje S10 si el inquilino no tiene contratada la capacidad 'reports' (CA-008, RN-007)", async () => {
    mockAssertCapability.mockResolvedValueOnce({
      ok: false,
      error: "Tu plan no incluye esta funcionalidad.",
      code: "CAPABILITY_NOT_INCLUDED",
    });

    const req = new NextRequest("http://localhost:3003/api/admin/reports?clientId=tenant-no-reports");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Tu plan no incluye esta funcionalidad.");
    expect(mockAssertCapability).toHaveBeenCalledWith("tenant-no-reports", "reports");
  });

  it("responde 200 si el inquilino sí tiene contratada la capacidad 'reports'", async () => {
    mockAssertCapability.mockResolvedValueOnce({
      ok: true,
      data: true,
    });

    const req = new NextRequest("http://localhost:3003/api/admin/reports?clientId=tenant-with-reports");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
