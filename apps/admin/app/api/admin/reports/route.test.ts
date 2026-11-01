import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mockReports = {
  kpis: { totalMrrCop: 500000, activeTenants: 2, totalStorageMb: 5, totalTokensConsumed: 10000 },
  tenantsByPlan: [],
  tenantsByStatus: [],
  storage: { originalBytes: 0, variantsBytes: 0, totalBytes: 0, filesCount: 0 },
  aiUsage: { botTokens: 0, assistTokens: 0, totalTokens: 0, totalCostUsdCents: 0 },
};

vi.mock("@mocter/domain", () => ({
  fetchAdminPlatformReports: vi.fn().mockImplementation(() => Promise.resolve(mockReports)),
}));

describe("REP-001 · Route Handler (/api/admin/reports)", () => {
  it("GET responde 200 con el resumen de métricas agregadas globales", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.kpis.totalMrrCop).toBe(500000);
  });
});
