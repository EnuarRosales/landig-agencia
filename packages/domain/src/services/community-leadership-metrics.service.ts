import { and, eq, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { cellDatabasePoolManager, withTenantCellTransaction } from "../db/cell-client";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import {
  organizationMembers,
  organizations,
  productAdoptions,
  productShares,
  productShareVersions,
} from "../db/schemas/admin/communities-and-cloning";
import { cellOrderItems, cellOrders } from "../db/schemas/tenant/orders";
import { cellProducts } from "../db/schemas/tenant/tenancy-catalog";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { PeriodResolver, type ReportPeriodType, type ResolvedPeriod } from "./period-resolver";

/**
 * Estados de pedido excluidos del cálculo de ventas efectivas en comunidad (`SPEC-15-D09`).
 */
const EXCLUDED_METRIC_ORDER_STATUSES = [
  "cancelled",
  "returned",
  "return_in_progress",
] as const;

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
 * Métrica atribuida de impacto de un producto compartido específico en la comunidad (`SPEC-15-D09`).
 */
export interface AttributedProductMetricSummary {
  shareId: string;
  sourceProductId: string;
  productName: string;
  sku: string | null;
  currentVersion: number;
  clonesCount: number;
  outdatedClonesCount: number;
  unitsSold: number;
  revenueCents: number;
  currency: string;
}

/**
 * Métrica atribuida de ventas por adoptante de productos de la comunidad (`SPEC-15-D09`).
 * Incluye únicamente ventas de clones vinculados por `source_share_id` en la comunidad solicitada.
 */
export interface AttributedAdopterMetricSummary {
  clientId: string;
  clientDisplayName: string;
  role: "originator" | "co_leader" | "member";
  clonesCount: number;
  outdatedClonesCount: number;
  unitsSold: number;
  revenueCents: number;
  currency: string;
}

/**
 * Radar de impacto atribuido para líderes y co-líderes de la comunidad (`SPEC-15-D09`).
 */
export interface AttributedCommunityMetrics {
  organizationId: string;
  organizationName: string;
  period: ResolvedPeriod;
  totalMembers: number;
  totalSharedProducts: number;
  totalActiveClones: number;
  outdatedClonesCount: number;
  totalUnitsSold: number;
  totalRevenueCents: number;
  currency: string;
  topSharedProducts: AttributedProductMetricSummary[];
  adoptersBreakdown: AttributedAdopterMetricSummary[];
}

/**
 * Registro de producto compartido enriquecido con metadatos básicos de versión vigente para métricas.
 */
export interface AttributedShareRecord {
  shareId: string;
  sourceProductId: string;
  currentVersion: number;
  productName: string;
  sku: string | null;
}

/**
 * Registro de adopción vinculada para atribución de ventas por clon en celda.
 */
export interface AttributedAdoptionRecord {
  adoptionId: string;
  shareId: string;
  adopterClientId: string;
  cloneProductId: string;
  cloneCellId: string;
  adoptedVersion: number;
}

/**
 * Ventas agregadas por producto clonado obtenidas de una celda sin exponer clientes finales ni conversaciones.
 */
export interface AttributedCloneSalesRow {
  productId: string;
  unitsSold: number;
  revenueCents: number;
  currency?: string;
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
  getAttributedProductsSales?(
    cellId: string,
    clientId: string,
    productIds: string[],
    start: Date,
    end: Date,
  ): Promise<AttributedCloneSalesRow[]>;
}

/**
 * Repositorio de membresías y gobernanza para el cálculo de métricas de liderazgo.
 */
export interface ILeadershipMetricsRepository {
  findOrganizationById(orgId: string): Promise<{ id: string; name: string } | null>;
  findActiveMembership(
    clientId: string,
  ): Promise<{ organizationId: string; role: "originator" | "co_leader" | "member"; status: string } | null>;
  findMembershipInOrg?(
    clientId: string,
    organizationId: string,
  ): Promise<{ organizationId: string; role: "originator" | "co_leader" | "member"; status: string } | null>;
  findActiveMembersByOrg(orgId: string): Promise<
    Array<{
      clientId: string;
      role: "originator" | "co_leader" | "member";
      cellId: string;
      displayName?: string;
    }>
  >;
  findOrgSharesWithLatestVersion?(organizationId: string): Promise<AttributedShareRecord[]>;
  findActiveAdoptionsByShareIds?(shareIds: string[]): Promise<AttributedAdoptionRecord[]>;
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

  /**
   * Calcula métricas de impacto atribuidas estrictamente a productos compartidos por esta comunidad (`SPEC-15-D09`).
   * Nunca mezcla ventas de productos propios ni de otras comunidades, y jamás expone chats ni datos de compradores finales.
   */
  async getCommunityAttributedMetrics(params: {
    organizationId: string;
    requestingClientId: string;
    userRole: string;
    periodType?: ReportPeriodType;
    customRange?: { startDate: string; endDate: string };
    timezone?: string;
  }): Promise<Result<AttributedCommunityMetrics>> {
    try {
      if (params.userRole === "tenant_agent") {
        return err(
          "Un agente operativo no tiene autorización para consultar métricas de impacto de la comunidad.",
          "FORBIDDEN_AGENT_CANNOT_VIEW_AGGREGATED",
        );
      }

      const membership = this.repo.findMembershipInOrg
        ? await this.repo.findMembershipInOrg(params.requestingClientId, params.organizationId)
        : await this.repo.findActiveMembership(params.requestingClientId);

      if (!membership || membership.organizationId !== params.organizationId) {
        return err(
          "El inquilino no pertenece a la organización de comunidad solicitada.",
          "FORBIDDEN_NOT_COMMUNITY_MEMBER",
        );
      }

      if (membership.role !== "originator" && membership.role !== "co_leader") {
        return err(
          "Solo el líder originador o un co-líder pueden consultar el impacto atribuido de la comunidad.",
          "FORBIDDEN_COMMUNITY_METRICS_REQUIRES_LEADERSHIP",
        );
      }

      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org) {
        return err("Organización de comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }

      const resolvedPeriod = PeriodResolver.resolve(
        params.periodType ?? "monthly",
        params.customRange,
        params.timezone ?? "America/Bogota",
      );

      const members = await this.repo.findActiveMembersByOrg(params.organizationId);
      const shares = this.repo.findOrgSharesWithLatestVersion
        ? await this.repo.findOrgSharesWithLatestVersion(params.organizationId)
        : [];

      const shareIds = shares.map((s) => s.shareId);
      const adoptions =
        shareIds.length > 0 && this.repo.findActiveAdoptionsByShareIds
          ? await this.repo.findActiveAdoptionsByShareIds(shareIds)
          : [];

      const shareMap = new Map(shares.map((s) => [s.shareId, s]));
      const memberMap = new Map(members.map((m) => [m.clientId, m]));

      // Agrupar adopciones activas por inquilino adoptante para consultar una vez cada celda
      const adoptionsByClient = new Map<string, AttributedAdoptionRecord[]>();
      for (const adoption of adoptions) {
        const list = adoptionsByClient.get(adoption.adopterClientId) ?? [];
        list.push(adoption);
        adoptionsByClient.set(adoption.adopterClientId, list);
      }

      const productTotals = new Map<
        string,
        {
          share: AttributedShareRecord;
          clonesCount: number;
          outdatedClonesCount: number;
          unitsSold: number;
          revenueCents: number;
          currency: string;
        }
      >();
      for (const share of shares) {
        productTotals.set(share.shareId, {
          share,
          clonesCount: 0,
          outdatedClonesCount: 0,
          unitsSold: 0,
          revenueCents: 0,
          currency: "COP",
        });
      }

      const adopterTotals = new Map<string, AttributedAdopterMetricSummary>();
      let totalOutdatedClones = 0;
      let totalUnitsSold = 0;
      let totalRevenueCents = 0;
      const baseCurrency = "COP";

      for (const [adopterClientId, clientAdoptions] of adoptionsByClient.entries()) {
        const cloneProductIds = Array.from(new Set(clientAdoptions.map((a) => a.cloneProductId)));
        const cellId =
          clientAdoptions[0]?.cloneCellId ||
          memberMap.get(adopterClientId)?.cellId ||
          "cell-01";

        let salesRows: AttributedCloneSalesRow[] = [];
        if (this.cellProvider.getAttributedProductsSales && cloneProductIds.length > 0) {
          try {
            salesRows = await this.cellProvider.getAttributedProductsSales(
              cellId,
              adopterClientId,
              cloneProductIds,
              resolvedPeriod.current.start,
              resolvedPeriod.current.end,
            );
          } catch (cellErr) {
            appLogger.warn(
              "[CommunityLeadershipMetrics] Error al consultar ventas atribuidas en celda de adoptante",
              {
                cellId,
                adopterClientId,
                error: (cellErr as Error).message,
              },
            );
          }
        }

        const salesByProductId = new Map(salesRows.map((row) => [row.productId, row]));
        const memberInfo = memberMap.get(adopterClientId);

        let adopterUnits = 0;
        let adopterRevenue = 0;
        let adopterOutdated = 0;
        let adopterCurrency = baseCurrency;

        for (const adoption of clientAdoptions) {
          const share = shareMap.get(adoption.shareId);
          if (!share) continue;

          const isOutdated = adoption.adoptedVersion < share.currentVersion;
          if (isOutdated) {
            adopterOutdated += 1;
            totalOutdatedClones += 1;
          }

          const rowSales = salesByProductId.get(adoption.cloneProductId);
          const units = rowSales?.unitsSold ?? 0;
          const revenue = rowSales?.revenueCents ?? 0;
          const currency = rowSales?.currency ?? baseCurrency;
          adopterCurrency = currency;

          adopterUnits += units;
          adopterRevenue += revenue;

          const pAgg = productTotals.get(share.shareId);
          if (pAgg) {
            pAgg.clonesCount += 1;
            if (isOutdated) pAgg.outdatedClonesCount += 1;
            pAgg.unitsSold += units;
            pAgg.revenueCents += revenue;
            pAgg.currency = currency;
          }
        }

        totalUnitsSold += adopterUnits;
        totalRevenueCents += adopterRevenue;

        adopterTotals.set(adopterClientId, {
          clientId: adopterClientId,
          clientDisplayName:
            memberInfo?.displayName || `Inquilino ${adopterClientId.slice(0, 8)}`,
          role: memberInfo?.role ?? "member",
          clonesCount: clientAdoptions.length,
          outdatedClonesCount: adopterOutdated,
          unitsSold: adopterUnits,
          revenueCents: adopterRevenue,
          currency: adopterCurrency,
        });
      }

      const topSharedProducts: AttributedProductMetricSummary[] = Array.from(
        productTotals.values(),
      )
        .map((entry) => ({
          shareId: entry.share.shareId,
          sourceProductId: entry.share.sourceProductId,
          productName: entry.share.productName,
          sku: entry.share.sku,
          currentVersion: entry.share.currentVersion,
          clonesCount: entry.clonesCount,
          outdatedClonesCount: entry.outdatedClonesCount,
          unitsSold: entry.unitsSold,
          revenueCents: entry.revenueCents,
          currency: entry.currency,
        }))
        .sort(
          (a, b) =>
            b.revenueCents - a.revenueCents ||
            b.clonesCount - a.clonesCount ||
            b.unitsSold - a.unitsSold,
        );

      const adoptersBreakdown = Array.from(adopterTotals.values()).sort(
        (a, b) => b.revenueCents - a.revenueCents || b.clonesCount - a.clonesCount,
      );

      appLogger.info("[CommunityLeadershipMetrics] Métricas atribuidas por comunidad calculadas", {
        organizationId: params.organizationId,
        requestingClientId: params.requestingClientId,
        totalSharedProducts: shares.length,
        totalActiveClones: adoptions.length,
        totalUnitsSold,
        totalRevenueCents,
      });

      return ok({
        organizationId: org.id,
        organizationName: org.name,
        period: resolvedPeriod,
        totalMembers: members.length,
        totalSharedProducts: shares.length,
        totalActiveClones: adoptions.length,
        outdatedClonesCount: totalOutdatedClones,
        totalUnitsSold,
        totalRevenueCents,
        currency: baseCurrency,
        topSharedProducts,
        adoptersBreakdown,
      });
    } catch (e) {
      appLogger.error(
        "[CommunityLeadershipMetrics] Error al calcular métricas atribuidas de comunidad",
        e as Error,
      );
      return err("Error interno al calcular métricas atribuidas.", "INTERNAL_METRICS_ERROR");
    }
  }
}

/**
 * Implementación Drizzle multi-celda del proveedor de métricas por celda para comunidades (`SPEC-15-D09`).
 */
export class DrizzleCellClientMetricsProvider implements ICellClientMetricsProvider {
  async getClientPerformance(
    _cellId: string,
    clientId: string,
    start: Date,
    end: Date,
  ): Promise<{
    activeProductsCount: number;
    unitsSold: number;
    revenueCents: number;
    currency?: string;
  }> {
    return withTenantCellTransaction(clientId, async (tx) => {
      const [prodAgg] = await tx
        .select({
          activeProductsCount: sql<number>`count(*)::int`,
        })
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            eq(cellProducts.status, "active"),
            isNull(cellProducts.deletedAt),
          ),
        );

      const [salesAgg] = await tx
        .select({
          unitsSold: sql<number>`coalesce(sum(${cellOrderItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${cellOrderItems.lineTotalCents}), 0)::bigint`,
          currency: sql<string>`max(${cellOrders.currency})`,
        })
        .from(cellOrderItems)
        .innerJoin(
          cellOrders,
          and(
            eq(cellOrders.clientId, cellOrderItems.clientId),
            eq(cellOrders.id, cellOrderItems.orderId),
          ),
        )
        .where(
          and(
            eq(cellOrderItems.clientId, clientId),
            notInArray(cellOrders.status, [...EXCLUDED_METRIC_ORDER_STATUSES]),
            gte(cellOrders.createdAt, start),
            lte(cellOrders.createdAt, end),
          ),
        );

      return {
        activeProductsCount: Number(prodAgg?.activeProductsCount ?? 0),
        unitsSold: Number(salesAgg?.unitsSold ?? 0),
        revenueCents: Number(salesAgg?.revenueCents ?? 0),
        currency: salesAgg?.currency ?? "COP",
      };
    });
  }

  async getAttributedProductsSales(
    _cellId: string,
    clientId: string,
    productIds: string[],
    start: Date,
    end: Date,
  ): Promise<AttributedCloneSalesRow[]> {
    if (productIds.length === 0) return [];

    return withTenantCellTransaction(clientId, async (tx) => {
      const rows = await tx
        .select({
          productId: cellOrderItems.productId,
          unitsSold: sql<number>`coalesce(sum(${cellOrderItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${cellOrderItems.lineTotalCents}), 0)::bigint`,
          currency: sql<string>`max(${cellOrders.currency})`,
        })
        .from(cellOrderItems)
        .innerJoin(
          cellOrders,
          and(
            eq(cellOrders.clientId, cellOrderItems.clientId),
            eq(cellOrders.id, cellOrderItems.orderId),
          ),
        )
        .where(
          and(
            eq(cellOrderItems.clientId, clientId),
            inArray(cellOrderItems.productId, productIds),
            notInArray(cellOrders.status, [...EXCLUDED_METRIC_ORDER_STATUSES]),
            gte(cellOrders.createdAt, start),
            lte(cellOrders.createdAt, end),
          ),
        )
        .groupBy(cellOrderItems.productId);

      return rows
        .filter((row): row is typeof row & { productId: string } => Boolean(row.productId))
        .map((row) => ({
          productId: row.productId,
          unitsSold: Number(row.unitsSold ?? 0),
          revenueCents: Number(row.revenueCents ?? 0),
          currency: row.currency ?? "COP",
        }));
    });
  }
}

/**
 * Implementación Drizzle del repositorio de métricas y atribuciones de comunidad en el plano de control (`admin`).
 */
export class DrizzleLeadershipMetricsRepository implements ILeadershipMetricsRepository {
  async findOrganizationById(orgId: string): Promise<{ id: string; name: string } | null> {
    const db = getDb();
    const [row] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row ?? null;
  }

  async findActiveMembership(
    clientId: string,
  ): Promise<{ organizationId: string; role: "originator" | "co_leader" | "member"; status: string } | null> {
    const db = getDb();
    const [row] = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        status: organizationMembers.status,
      })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.clientId, clientId), eq(organizationMembers.status, "active")))
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      role: row.role as "originator" | "co_leader" | "member",
      status: row.status,
    };
  }

  async findMembershipInOrg(
    clientId: string,
    organizationId: string,
  ): Promise<{ organizationId: string; role: "originator" | "co_leader" | "member"; status: string } | null> {
    const db = getDb();
    const [row] = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        status: organizationMembers.status,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      role: row.role as "originator" | "co_leader" | "member",
      status: row.status,
    };
  }

  async findActiveMembersByOrg(orgId: string): Promise<
    Array<{
      clientId: string;
      role: "originator" | "co_leader" | "member";
      cellId: string;
      displayName?: string;
    }>
  > {
    const db = getDb();
    const rows = await db
      .select({
        clientId: organizationMembers.clientId,
        role: organizationMembers.role,
        displayName: clients.displayName,
      })
      .from(organizationMembers)
      .innerJoin(clients, eq(clients.id, organizationMembers.clientId))
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.status, "active")));

    const resolved = await Promise.all(
      rows.map(async (row) => {
        let cellId = "cell-01";
        try {
          cellId = await cellDatabasePoolManager.resolveCellIdForClient(row.clientId);
        } catch {
          cellId = "cell-01";
        }
        return {
          clientId: row.clientId,
          role: row.role as "originator" | "co_leader" | "member",
          cellId,
          displayName: row.displayName,
        };
      }),
    );

    return resolved;
  }

  async findOrgSharesWithLatestVersion(organizationId: string): Promise<AttributedShareRecord[]> {
    const db = getDb();
    const shareRows = await db
      .select({
        id: productShares.id,
        sourceProductId: productShares.sourceProductId,
        currentVersion: productShares.currentVersion,
      })
      .from(productShares)
      .where(
        and(
          eq(productShares.organizationId, organizationId),
          eq(productShares.status, "active"),
          eq(productShares.moderationStatus, "approved"),
        ),
      );

    if (shareRows.length === 0) return [];

    const versionRows = await db
      .select({
        shareId: productShareVersions.shareId,
        version: productShareVersions.version,
        snapshot: productShareVersions.snapshot,
      })
      .from(productShareVersions)
      .where(
        inArray(
          productShareVersions.shareId,
          shareRows.map((s) => s.id),
        ),
      );

    const snapshotMap = new Map<string, Record<string, unknown>>();
    for (const share of shareRows) {
      const match = versionRows.find(
        (v) => v.shareId === share.id && v.version === share.currentVersion,
      );
      if (match) snapshotMap.set(share.id, match.snapshot);
    }

    return shareRows.map((share) => {
      const snap = snapshotMap.get(share.id) ?? {};
      const name = typeof snap.name === "string" && snap.name.trim().length > 0 ? snap.name : "Producto";
      const sku = typeof snap.sku === "string" && snap.sku.trim().length > 0 ? snap.sku : null;
      return {
        shareId: share.id,
        sourceProductId: share.sourceProductId,
        currentVersion: share.currentVersion,
        productName: name,
        sku,
      };
    });
  }

  async findActiveAdoptionsByShareIds(shareIds: string[]): Promise<AttributedAdoptionRecord[]> {
    if (shareIds.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select({
        adoptionId: productAdoptions.id,
        shareId: productAdoptions.shareId,
        adopterClientId: productAdoptions.adopterClientId,
        cloneProductId: productAdoptions.cloneProductId,
        cloneCellId: productAdoptions.cloneCellId,
        adoptedVersion: productAdoptions.adoptedVersion,
      })
      .from(productAdoptions)
      .where(
        and(inArray(productAdoptions.shareId, shareIds), eq(productAdoptions.linkActive, true)),
      );

    return rows;
  }
}

let cachedLeadershipMetricsService: CommunityLeadershipMetricsService | null = null;

/**
 * Retorna la instancia singleton del servicio de métricas de liderazgo de comunidades (`SPEC-15`).
 */
export function getCommunityLeadershipMetricsService(): CommunityLeadershipMetricsService {
  if (!cachedLeadershipMetricsService) {
    cachedLeadershipMetricsService = new CommunityLeadershipMetricsService(
      new DrizzleLeadershipMetricsRepository(),
      new DrizzleCellClientMetricsProvider(),
    );
  }
  return cachedLeadershipMetricsService;
}

