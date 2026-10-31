import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { PeriodResolver, type ReportPeriodType, type ResolvedPeriod } from "./period-resolver";

export interface DashboardKpi {
  current: number;
  previous: number;
  deltaPercent: number;
  unit?: string;
}

export interface TenantDashboardMetrics {
  period: ResolvedPeriod;
  orders: {
    totalOrders: DashboardKpi;
    revenueCents: DashboardKpi;
    averageOrderValueCents: DashboardKpi;
  };
  leads: {
    totalLeads: DashboardKpi;
    qualifiedLeads: DashboardKpi;
    conversionRatePercent: DashboardKpi;
  };
  bot: {
    conversationsHandled: DashboardKpi;
    humanHandoffs: DashboardKpi;
    aiTokensConsumed: DashboardKpi;
  };
}

export interface IAnalyticsDataProvider {
  getOrdersCount(clientId: string, start: Date, end: Date): Promise<number>;
  getRevenueCents(clientId: string, start: Date, end: Date): Promise<number>;
  getLeadsCount(clientId: string, start: Date, end: Date): Promise<number>;
  getQualifiedLeadsCount(clientId: string, start: Date, end: Date): Promise<number>;
  getBotConversationsCount(clientId: string, start: Date, end: Date): Promise<number>;
  getHumanHandoffsCount(clientId: string, start: Date, end: Date): Promise<number>;
  getAiTokensConsumed(clientId: string, start: Date, end: Date): Promise<number>;
}

/**
 * Servicio de métricas y dashboards en caliente sin materialización previa (REP-001 §1, §4, T-04).
 */
export class ReportsService {
  constructor(private readonly dataProvider: IAnalyticsDataProvider) {}

  /**
   * Obtiene las métricas consolidadas del inquilino calculadas en caliente.
   */
  async getTenantDashboardMetrics(
    clientId: string,
    periodType: ReportPeriodType,
    customRange?: { startDate: string; endDate: string },
    timezone: string = "America/Bogota",
  ): Promise<Result<TenantDashboardMetrics>> {
    try {
      const resolvedPeriod = PeriodResolver.resolve(periodType, customRange, timezone);
      const { current, previous } = resolvedPeriod;

      // Ejecutar consultas en caliente concurrentemente aprovechando índices (client_id, created_at)
      const [
        currOrders,
        prevOrders,
        currRevenue,
        prevRevenue,
        currLeads,
        prevLeads,
        currQualified,
        prevQualified,
        currBotConvs,
        prevBotConvs,
        currHandoffs,
        prevHandoffs,
        currTokens,
        prevTokens,
      ] = await Promise.all([
        this.dataProvider.getOrdersCount(clientId, current.start, current.end),
        this.dataProvider.getOrdersCount(clientId, previous.start, previous.end),
        this.dataProvider.getRevenueCents(clientId, current.start, current.end),
        this.dataProvider.getRevenueCents(clientId, previous.start, previous.end),
        this.dataProvider.getLeadsCount(clientId, current.start, current.end),
        this.dataProvider.getLeadsCount(clientId, previous.start, previous.end),
        this.dataProvider.getQualifiedLeadsCount(clientId, current.start, current.end),
        this.dataProvider.getQualifiedLeadsCount(clientId, previous.start, previous.end),
        this.dataProvider.getBotConversationsCount(clientId, current.start, current.end),
        this.dataProvider.getBotConversationsCount(clientId, previous.start, previous.end),
        this.dataProvider.getHumanHandoffsCount(clientId, current.start, current.end),
        this.dataProvider.getHumanHandoffsCount(clientId, previous.start, previous.end),
        this.dataProvider.getAiTokensConsumed(clientId, current.start, current.end),
        this.dataProvider.getAiTokensConsumed(clientId, previous.start, previous.end),
      ]);

      const currAov = currOrders > 0 ? Math.round(currRevenue / currOrders) : 0;
      const prevAov = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;

      const currConvRate = currLeads > 0 ? Number(((currQualified / currLeads) * 100).toFixed(1)) : 0;
      const prevConvRate = prevLeads > 0 ? Number(((prevQualified / prevLeads) * 100).toFixed(1)) : 0;

      const metrics: TenantDashboardMetrics = {
        period: resolvedPeriod,
        orders: {
          totalOrders: {
            current: currOrders,
            previous: prevOrders,
            deltaPercent: PeriodResolver.calculateDelta(currOrders, prevOrders),
          },
          revenueCents: {
            current: currRevenue,
            previous: prevRevenue,
            deltaPercent: PeriodResolver.calculateDelta(currRevenue, prevRevenue),
            unit: "cents",
          },
          averageOrderValueCents: {
            current: currAov,
            previous: prevAov,
            deltaPercent: PeriodResolver.calculateDelta(currAov, prevAov),
            unit: "cents",
          },
        },
        leads: {
          totalLeads: {
            current: currLeads,
            previous: prevLeads,
            deltaPercent: PeriodResolver.calculateDelta(currLeads, prevLeads),
          },
          qualifiedLeads: {
            current: currQualified,
            previous: prevQualified,
            deltaPercent: PeriodResolver.calculateDelta(currQualified, prevQualified),
          },
          conversionRatePercent: {
            current: currConvRate,
            previous: prevConvRate,
            deltaPercent: PeriodResolver.calculateDelta(currConvRate, prevConvRate),
            unit: "%",
          },
        },
        bot: {
          conversationsHandled: {
            current: currBotConvs,
            previous: prevBotConvs,
            deltaPercent: PeriodResolver.calculateDelta(currBotConvs, prevBotConvs),
          },
          humanHandoffs: {
            current: currHandoffs,
            previous: prevHandoffs,
            deltaPercent: PeriodResolver.calculateDelta(currHandoffs, prevHandoffs),
          },
          aiTokensConsumed: {
            current: currTokens,
            previous: prevTokens,
            deltaPercent: PeriodResolver.calculateDelta(currTokens, prevTokens),
            unit: "tokens",
          },
        },
      };

      appLogger.info("[ReportsService] Métricas del inquilino calculadas en caliente", {
        clientId,
        periodType,
        totalOrders: currOrders,
        revenueCents: currRevenue,
      });

      return ok(metrics);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReportsService] Error al calcular métricas: ${msg}`, error);
      return err(msg, "REPORTS_METRICS_ERROR");
    }
  }
}

