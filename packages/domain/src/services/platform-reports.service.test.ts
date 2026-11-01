import { describe, expect, it, vi } from "vitest";
import {
  PlatformReportsService,
  type IPlatformAnalyticsDataProvider,
} from "./platform-reports.service";

describe("REP-001 T-05 · PlatformReportsService", () => {
  const mockDataProvider: IPlatformAnalyticsDataProvider = {
    getTenantsDistribution: vi.fn().mockResolvedValue({
      byPlan: { starter: 15, growth: 25, enterprise: 5 },
      byStatus: { active: 43, suspended: 2 },
      totalActiveTenants: 43,
    }),
    getStorageMetrics: vi.fn().mockResolvedValue({
      totalStorageBytes: 1024 * 1024 * 1024 * 50, // 50 GB
      mediaVariantsBytes: 1024 * 1024 * 1024 * 10, // 10 GB
      deduplicationRatio: 22.5,
    }),
    getPlatformAiMetrics: vi.fn().mockResolvedValue({
      totalTokensConsumed: 1250000,
      totalCostUsdCents: 2500,
      assistTokens: 450000,
      botTokens: 800000,
    }),
    getSystemHealth: vi.fn().mockResolvedValue({
      backupsHealthy: true,
      lastBackupAt: new Date("2026-10-31T03:00:00Z"),
      activeIncidentsCount: 0,
    }),
  };

  const service = new PlatformReportsService(mockDataProvider);

  it("calcula métricas de plataforma globales sin exponer PII", async () => {
    const res = await service.getPlatformDashboardMetrics("monthly");

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = res.data;
    expect(data.tenants.totalActiveTenants).toBe(43);
    expect(data.tenants.byPlan.growth).toBe(25);
    expect(data.storage.deduplicationRatio).toBe(22.5);
    expect(data.ai.totalTokensConsumed).toBe(1250000);
    expect(data.systemHealth.backupsHealthy).toBe(true);
    expect(data.systemHealth.activeIncidentsCount).toBe(0);
  });

  it("retorna error controlado si el proveedor de datos falla", async () => {
    const failingProvider: IPlatformAnalyticsDataProvider = {
      ...mockDataProvider,
      getTenantsDistribution: vi.fn().mockRejectedValue(new Error("Database connection timeout")),
    };

    const failingService = new PlatformReportsService(failingProvider);
    const res = await failingService.getPlatformDashboardMetrics("monthly");

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("PLATFORM_METRICS_ERROR");
    expect(res.error).toContain("Database connection timeout");
  });
});

