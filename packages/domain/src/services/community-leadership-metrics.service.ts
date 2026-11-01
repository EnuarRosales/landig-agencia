import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { PeriodResolver, type ReportPeriodType, type ResolvedPeriod } from "./period-resolver";

/**
 * Resumen de métricas de ventas y desempeño de un miembro de la comunidad (ADM-001 RF-08.9, D-19).
 * No contiene chats, clientes finales ni datos operativos privados.
 */
export interface MemberMetricsSummary {
  clientId: string;
  clientDisplayName: string;
  role: "originator" | "co_leader" | "member";
  activeProductsCount: number;
  unitsSold: number;
  revenueCents: number;
  currency: string;
}

/**
 * Métricas agregadas de la comunidad para el liderazgo (originador y co-líderes).
 */
export interface CommunityLeadershipMetrics {
  organizationId: string;
  organizationName: string;
  period: ResolvedPeriod;
  totalMembers: number;
  totalActiveProducts: number;
  totalUnitsSold: number;
  totalRevenueCents: number;
  currency: string;
  membersBreakdown: MemberMetricsSummary[];
}

/**
 * Proveedor de métricas por celda individual (resuelve ventas y catálogo de un inquilino sin cruzar SQL entre celdas).
 */
export interface ICellClientMetricsProvider {
  getClientPerformance(
    cellId: string,
    clientId: string,
    start: Date,
    end: Date,
  ): Promise<{
    activeProductsCount: number;
    unitsSold: number;
    revenueCents: number;
    currency?: string;
  }>;
}

/**
 * Repositorio de membresías y gobernanza para el cálculo de métricas de liderazgo.
 */
export interface ILeadershipMetricsRepository {
  findOrganizationById(orgId: string): Promise<{ id: string; name: string } | null>;
  findActiveMembership(
    clientId: string,
  ): Promise<{ organizationId: string; role: "originator" | "co_leader" | "member"; status: string } | null>;
  findActiveMembersByOrg(orgId: string): Promise<
    Array<{
      clientId: string;
      role: "originator" | "co_leader" | "member";
      cellId: string;
      displayName?: string;
    }>
  >;
}

/**
 * Servicio de métricas estadísticas de liderazgo de comunidades (ADM-001 T-23, RF-08.9, D-19).
 * El liderazgo ve ventas efectivas y desempeño por miembro y agregadas.
 * No accede a chats, clientes del inquilino ni datos operativos.
 */
export class CommunityLeadershipMetricsService {
  constructor(
    private readonly repo: ILeadershipMetricsRepository,
    private readonly cellProvider: ICellClientMetricsProvider,
  ) {}

  /**
   * Obtiene las métricas agregadas de la comunidad con desglose por miembro.
   * Restringido a tenant_owner del inquilino originador o co-líder.
   */
  async getCommunityAggregatedMetrics(params: {
    organizationId: string;
    requestingClientId: string;
    userRole: string; // 'tenant_owner' | 'tenant_agent' | 'platform_admin'
    periodType?: ReportPeriodType;
    customRange?: { startDate: string; endDate: string };
    timezone?: string;
  }): Promise<Result<CommunityLeadershipMetrics>> {
    try {
      // 1. Un agente nunca puede ver métricas agregadas de la comunidad (RF-08.9, D-19)
      if (params.userRole === "tenant_agent") {
        return err(
          "Un agente operativo no tiene autorización para consultar métricas agregadas de la comunidad.",
          "FORBIDDEN_AGENT_CANNOT_VIEW_AGGREGATED",
        );
      }

      // 2. Verificar membresía activa del inquilino solicitante
      const membership = await this.repo.findActiveMembership(params.requestingClientId);
      if (!membership || membership.organizationId !== params.organizationId) {
        return err(
          "El inquilino no pertenece a la organización de comunidad solicitada.",
          "FORBIDDEN_NOT_COMMUNITY_MEMBER",
        );
      }

      // 3. Solo el originador o co-líder puede ver métricas agregadas de la comunidad (RF-08.9, D-19)
      const isLeadership = membership.role === "originator" || membership.role === "co_leader";
      if (!isLeadership) {
        return err(
          "El inquilino miembro no tiene rol de liderazgo (originador o co-líder) para ver métricas agregadas.",
          "FORBIDDEN_COMMUNITY_METRICS_REQUIRES_LEADERSHIP",
        );
      }

      // 4. Verificar existencia de la organización
      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org) {
        return err("Organización de comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }

      // 5. Resolver período temporal
      const resolvedPeriod = PeriodResolver.resolve(
        params.periodType ?? "monthly",
        params.customRange,
        params.timezone ?? "America/Bogota",
      );

      // 6. Obtener miembros activos de la comunidad
      const members = await this.repo.findActiveMembersByOrg(params.organizationId);

      // 7. Consultar métricas de cada miembro en su celda respectiva y agregar en memoria (D-19)
      const membersBreakdown: MemberMetricsSummary[] = [];
      let totalActiveProducts = 0;
      let totalUnitsSold = 0;
      let totalRevenueCents = 0;
      const baseCurrency = "COP";

      for (const member of members) {
        try {
          const stats = await this.cellProvider.getClientPerformance(
            member.cellId,
            member.clientId,
            resolvedPeriod.current.start,
            resolvedPeriod.current.end,
          );

          totalActiveProducts += stats.activeProductsCount;
          totalUnitsSold += stats.unitsSold;
          totalRevenueCents += stats.revenueCents;

          membersBreakdown.push({
            clientId: member.clientId,
            clientDisplayName: member.displayName || `Inquilino ${member.clientId.slice(0, 8)}`,
            role: member.role,
            activeProductsCount: stats.activeProductsCount,
            unitsSold: stats.unitsSold,
            revenueCents: stats.revenueCents,
            currency: stats.currency || baseCurrency,
          });
        } catch (memberErr) {
          appLogger.warn("[CommunityLeadershipMetrics] Error al consultar métricas de celda para miembro", {
            cellId: member.cellId,
            clientId: member.clientId,
            error: (memberErr as Error).message,
          });
        }
      }

      appLogger.info("[CommunityLeadershipMetrics] Métricas agregadas de comunidad calculadas", {
        organizationId: params.organizationId,
        requestingClientId: params.requestingClientId,
        totalMembers: members.length,
        totalUnitsSold,
        totalRevenueCents,
      });

      return ok({
        organizationId: org.id,
        organizationName: org.name,
        period: resolvedPeriod,
        totalMembers: members.length,
        totalActiveProducts,
        totalUnitsSold,
        totalRevenueCents,
        currency: baseCurrency,
        membersBreakdown,
      });
    } catch (e) {
      appLogger.error("[CommunityLeadershipMetrics] Error inesperado al calcular métricas de comunidad", e as Error);
      return err("Error interno al calcular métricas del liderazgo.", "INTERNAL_METRICS_ERROR");
    }
  }

  /**
   * Obtiene las métricas de un único miembro de la comunidad.
   * Permite que un miembro ordinario o un agente consulte exclusivamente el desempeño de su propio negocio.
   */
  async getMyBusinessMetrics(params: {
    organizationId: string;
    requestingClientId: string;
    userRole: string; // 'tenant_owner' | 'tenant_agent'
    periodType?: ReportPeriodType;
    customRange?: { startDate: string; endDate: string };
    timezone?: string;
  }): Promise<Result<MemberMetricsSummary>> {
    try {
      const membership = await this.repo.findActiveMembership(params.requestingClientId);
      if (!membership || membership.organizationId !== params.organizationId) {
        return err(
          "El inquilino no pertenece a la organización de comunidad solicitada.",
          "FORBIDDEN_NOT_COMMUNITY_MEMBER",
        );
      }

      const members = await this.repo.findActiveMembersByOrg(params.organizationId);
      const currentMember = members.find((m) => m.clientId === params.requestingClientId);

      if (!currentMember) {
        return err("No se localizó el perfil activo del miembro.", "MEMBER_NOT_FOUND");
      }

      const resolvedPeriod = PeriodResolver.resolve(
        params.periodType ?? "monthly",
        params.customRange,
        params.timezone ?? "America/Bogota",
      );

      const stats = await this.cellProvider.getClientPerformance(
        currentMember.cellId,
        currentMember.clientId,
        resolvedPeriod.current.start,
        resolvedPeriod.current.end,
      );

      return ok({
        clientId: currentMember.clientId,
        clientDisplayName: currentMember.displayName || `Inquilino ${currentMember.clientId.slice(0, 8)}`,
        role: currentMember.role,
        activeProductsCount: stats.activeProductsCount,
        unitsSold: stats.unitsSold,
        revenueCents: stats.revenueCents,
        currency: stats.currency || "COP",
      });
    } catch (e) {
      appLogger.error("[CommunityLeadershipMetrics] Error al obtener métricas propias", e as Error);
      return err("Error interno al obtener métricas del negocio.", "INTERNAL_METRICS_ERROR");
    }
  }
}

