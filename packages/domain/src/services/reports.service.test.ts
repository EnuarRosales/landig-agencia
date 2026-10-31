import { describe, expect, it, vi } from "vitest";
import { ReportsService, type IAnalyticsDataProvider } from "./reports.service";

describe("REP-001 T-04 · ReportsService", () => {
  const mockDataProvider: IAnalyticsDataProvider = {
    getOrdersCount: vi.fn().mockImplementation((_, start) => {
      // Si el año es el actual retorna 50, anterior 40
      return Promise.resolve(start.getFullYear() === new Date().getFullYear() ? 50 : 40);
    }),
    getRevenueCents: vi.fn().mockResolvedValue(10000000), // 100.000 COP
    getLeadsCount: vi.fn().mockResolvedValue(100),
    getQualifiedLeadsCount: vi.fn().mockResolvedValue(25),
    getBotConversationsCount: vi.fn().mockResolvedValue(80),
    getHumanHandoffsCount: vi.fn().mockResolvedValue(10),
    getAiTokensConsumed: vi.fn().mockResolvedValue(45000),
  };

  const service = new ReportsService(mockDataProvider);

  it("calcula métricas de dashboard en caliente con deltas y tasas de conversión", async () => {
    const res = await service.getTenantDashboardMetrics(
      "client-dash-1",
      "monthly",
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = res.data;
    expect(data.orders.totalOrders.current).toBe(50);
    expect(data.orders.revenueCents.current).toBe(10000000);
    expect(data.leads.totalLeads.current).toBe(100);
    expect(data.leads.qualifiedLeads.current).toBe(25);
    expect(data.leads.conversionRatePercent.current).toBe(25); // 25 / 100 * 100
    expect(data.bot.conversationsHandled.current).toBe(80);
    expect(data.bot.humanHandoffs.current).toBe(10);
    expect(data.bot.aiTokensConsumed.current).toBe(45000);
  });
});

