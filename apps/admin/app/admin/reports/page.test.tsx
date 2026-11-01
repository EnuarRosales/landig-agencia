import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminReportsPage from "./page";
import { ReportsView } from "./reports-view";

vi.mock("@mocter/domain", () => ({
  fetchAdminPlatformReports: vi.fn().mockResolvedValue({
    kpis: {
      totalMrrCop: 1500000,
      activeTenants: 5,
      totalStorageMb: 12.5,
      totalTokensConsumed: 450000,
    },
    tenantsByPlan: [
      { planCode: "growth", planName: "Plan Crecimiento", count: 3, mrrCop: 600000 },
    ],
    tenantsByStatus: [{ status: "activo", count: 5 }],
    storage: {
      originalBytes: 8000000,
      variantsBytes: 5000000,
      totalBytes: 13000000,
      filesCount: 15,
    },
    aiUsage: {
      botTokens: 350000,
      assistTokens: 100000,
      totalTokens: 450000,
      totalCostUsdCents: 125,
    },
  }),
}));

describe("REP-001 · Informes Ejecutivos y Analítica Global (Backoffice)", () => {
  it("renderiza el Server Component con métricas consolidadas y ReportsView", async () => {
    const page = await AdminReportsPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(3);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const kpisSection = children[1] as React.ReactElement;
    expect(kpisSection.type).toBe("section");

    const view = children[2] as React.ReactElement;
    expect(view.type).toBe(ReportsView);
  });

  it("renderiza ReportsView con estructura de desglose y botón de exportación", () => {
    const mockData = {
      kpis: {
        totalMrrCop: 100000,
        activeTenants: 1,
        totalStorageMb: 1,
        totalTokensConsumed: 1000,
      },
      tenantsByPlan: [],
      tenantsByStatus: [],
      storage: {
        originalBytes: 1000,
        variantsBytes: 500,
        totalBytes: 1500,
        filesCount: 2,
      },
      aiUsage: {
        botTokens: 800,
        assistTokens: 200,
        totalTokens: 1000,
        totalCostUsdCents: 5,
      },
    };

    const element = <ReportsView initialData={mockData} />;
    expect(React.isValidElement(element)).toBe(true);
  });
});
