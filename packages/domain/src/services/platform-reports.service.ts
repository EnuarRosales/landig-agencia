import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { PeriodResolver, type ReportPeriodType, type ResolvedPeriod } from "./period-resolver";

export interface PlatformTenantDistribution {
  byPlan: Record<string, number>;
  byStatus: Record<string, number>;
  totalActiveTenants: number;
}

export interface PlatformStorageMetrics {
  totalStorageBytes: number;
  mediaVariantsBytes: number;
  deduplicationRatio: number; // Porcentaje de ahorro
}

export interface PlatformAiMetrics {
  totalTokensConsumed: number;
  totalCostUsdCents: number;
  assistTokens: number;
  botTokens: number;
}

export interface PlatformDashboardMetrics {
  period: ResolvedPeriod;
  tenants: PlatformTenantDistribution;
  storage: PlatformStorageMetrics;
  ai: PlatformAiMetrics;
  systemHealth: {
    backupsHealthy: boolean;
    lastBackupAt?: Date;
    activeIncidentsCount: number;
  };
}

export interface IPlatformAnalyticsDataProvider {
  getTenantsDistribution(): Promise<PlatformTenantDistribution>;
  getStorageMetrics(): Promise<PlatformStorageMetrics>;
  getPlatformAiMetrics(start: Date, end: Date): Promise<PlatformAiMetrics>;
  getSystemHealth(): Promise<{ backupsHealthy: boolean; lastBackupAt?: Date; activeIncidentsCount: number }>;
}

/**
 * Servicio de métricas agregadas globales para la SaaS (REP-001 §2, T-05).
 * Cero exposición de PII: únicamente expone totales agregados y salud operativa.
 */
export class PlatformReportsService {
  constructor(private readonly dataProvider: IPlatformAnalyticsDataProvider) {}

  async getPlatformDashboardMetrics(
    periodType: ReportPeriodType,
    customRange?: { startDate: string; endDate: string },
    timezone: string = "America/Bogota",
  ): Promise<Result<PlatformDashboardMetrics>> {
    try {
      const resolvedPeriod = PeriodResolver.resolve(periodType, customRange, timezone);
      const { current } = resolvedPeriod;

      const [tenants, storage, ai, systemHealth] = await Promise.all([
        this.dataProvider.getTenantsDistribution(),
        this.dataProvider.getStorageMetrics(),
        this.dataProvider.getPlatformAiMetrics(current.start, current.end),
        this.dataProvider.getSystemHealth(),
      ]);

      const metrics: PlatformDashboardMetrics = {
        period: resolvedPeriod,
        tenants,
        storage,
        ai,
        systemHealth,
      };

      appLogger.info("[PlatformReportsService] Métricas globales de plataforma computadas", {
        periodType,
        totalActiveTenants: tenants.totalActiveTenants,
        totalStorageBytes: storage.totalStorageBytes,
      });

      return ok(metrics);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[PlatformReportsService] Error al obtener métricas de plataforma: ${msg}`, error);
      return err(msg, "PLATFORM_METRICS_ERROR");
    }
  }
}

