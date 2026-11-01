import { describe, it, expect, vi } from "vitest";
import {
  CommunityLeadershipMetricsService,
  type ILeadershipMetricsRepository,
  type ICellClientMetricsProvider,
} from "./community-leadership-metrics.service";

describe("ADM-001 T-23 · CommunityLeadershipMetricsService (Métricas del Liderazgo)", () => {
  const mockRepo: ILeadershipMetricsRepository = {
    findOrganizationById: vi.fn(),
    findActiveMembership: vi.fn(),
    findActiveMembersByOrg: vi.fn(),
  };

  const mockCellProvider: ICellClientMetricsProvider = {
    getClientPerformance: vi.fn(),
  };

  const service = new CommunityLeadershipMetricsService(mockRepo, mockCellProvider);

  it("permite al tenant_owner del inquilino originador ver las métricas agregadas y desglose de la comunidad", async () => {
    vi.mocked(mockRepo.findActiveMembership).mockResolvedValueOnce({
      organizationId: "org-1",
      role: "originator",
      status: "active",
    });

    vi.mocked(mockRepo.findOrganizationById).mockResolvedValueOnce({
      id: "org-1",
      name: "Comunidad Belleza y Salud",
    });

    vi.mocked(mockRepo.findActiveMembersByOrg).mockResolvedValueOnce([
      {
        clientId: "client-leader",
        role: "originator",
        cellId: "cell-bogota-1",
        displayName: "Distribuidora Principal",
      },
      {
        clientId: "client-member-1",
        role: "member",
        cellId: "cell-medellin-1",
        displayName: "Tienda Aliada 1",
      },
      {
        clientId: "client-member-2",
        role: "member",
        cellId: "cell-cali-1",
        displayName: "Tienda Aliada 2",
      },
    ]);

    vi.mocked(mockCellProvider.getClientPerformance)
      .mockResolvedValueOnce({
        activeProductsCount: 10,
        unitsSold: 50,
        revenueCents: 5000000,
        currency: "COP",
      })
      .mockResolvedValueOnce({
        activeProductsCount: 5,
        unitsSold: 20,
        revenueCents: 2000000,
        currency: "COP",
      })
      .mockResolvedValueOnce({
        activeProductsCount: 8,
        unitsSold: 30,
        revenueCents: 3000000,
        currency: "COP",
      });

    const res = await service.getCommunityAggregatedMetrics({
      organizationId: "org-1",
      requestingClientId: "client-leader",
      userRole: "tenant_owner",
      periodType: "monthly",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.organizationId).toBe("org-1");
    expect(res.data.organizationName).toBe("Comunidad Belleza y Salud");
    expect(res.data.totalMembers).toBe(3);
    expect(res.data.totalActiveProducts).toBe(23); // 10 + 5 + 8
    expect(res.data.totalUnitsSold).toBe(100); // 50 + 20 + 30
    expect(res.data.totalRevenueCents).toBe(10000000); // 5M + 2M + 3M
    expect(res.data.membersBreakdown).toHaveLength(3);
    expect(res.data.membersBreakdown[0].clientDisplayName).toBe("Distribuidora Principal");

    // Verificación de privacidad: El objeto no contiene chats ni clientes finales
    expect(res.data).not.toHaveProperty("chats");
    expect(res.data).not.toHaveProperty("customers");
  });

  it("permite al tenant_owner de un co-líder consultar las métricas agregadas de la comunidad", async () => {
    vi.mocked(mockRepo.findActiveMembership).mockResolvedValueOnce({
      organizationId: "org-1",
      role: "co_leader",
      status: "active",
    });

    vi.mocked(mockRepo.findOrganizationById).mockResolvedValueOnce({
      id: "org-1",
      name: "Comunidad Belleza y Salud",
    });

    vi.mocked(mockRepo.findActiveMembersByOrg).mockResolvedValueOnce([
      {
        clientId: "client-co-leader",
        role: "co_leader",
        cellId: "cell-bogota-1",
        displayName: "Co-Líder Regional",
      },
    ]);

    vi.mocked(mockCellProvider.getClientPerformance).mockResolvedValueOnce({
      activeProductsCount: 15,
      unitsSold: 40,
      revenueCents: 4000000,
      currency: "COP",
    });

    const res = await service.getCommunityAggregatedMetrics({
      organizationId: "org-1",
      requestingClientId: "client-co-leader",
      userRole: "tenant_owner",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.totalActiveProducts).toBe(15);
    expect(res.data.totalUnitsSold).toBe(40);
  });

  it("rechaza la consulta de métricas agregadas si la realiza un tenant_agent", async () => {
    const res = await service.getCommunityAggregatedMetrics({
      organizationId: "org-1",
      requestingClientId: "client-leader",
      userRole: "tenant_agent",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("FORBIDDEN_AGENT_CANNOT_VIEW_AGGREGATED");
  });

  it("rechaza la consulta de métricas agregadas a un inquilino con rol 'member' ordinario", async () => {
    vi.mocked(mockRepo.findActiveMembership).mockResolvedValueOnce({
      organizationId: "org-1",
      role: "member",
      status: "active",
    });

    const res = await service.getCommunityAggregatedMetrics({
      organizationId: "org-1",
      requestingClientId: "client-regular-member",
      userRole: "tenant_owner",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("FORBIDDEN_COMMUNITY_METRICS_REQUIRES_LEADERSHIP");
  });

  it("rechaza si el inquilino solicitante no pertenece a la organización solicitada", async () => {
    vi.mocked(mockRepo.findActiveMembership).mockResolvedValueOnce({
      organizationId: "org-diferente",
      role: "member",
      status: "active",
    });

    const res = await service.getCommunityAggregatedMetrics({
      organizationId: "org-1",
      requestingClientId: "client-ajeno",
      userRole: "tenant_owner",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("FORBIDDEN_NOT_COMMUNITY_MEMBER");
  });

  it("permite a un miembro ordinario o agente consultar exclusivamente las métricas de su propio negocio", async () => {
    vi.mocked(mockRepo.findActiveMembership).mockResolvedValueOnce({
      organizationId: "org-1",
      role: "member",
      status: "active",
    });

    vi.mocked(mockRepo.findActiveMembersByOrg).mockResolvedValueOnce([
      {
        clientId: "client-regular-member",
        role: "member",
        cellId: "cell-cali-1",
        displayName: "Mi Propia Tienda",
      },
    ]);

    vi.mocked(mockCellProvider.getClientPerformance).mockResolvedValueOnce({
      activeProductsCount: 6,
      unitsSold: 12,
      revenueCents: 1200000,
      currency: "COP",
    });

    const res = await service.getMyBusinessMetrics({
      organizationId: "org-1",
      requestingClientId: "client-regular-member",
      userRole: "tenant_owner",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.clientId).toBe("client-regular-member");
    expect(res.data.clientDisplayName).toBe("Mi Propia Tienda");
    expect(res.data.activeProductsCount).toBe(6);
    expect(res.data.unitsSold).toBe(12);
    expect(res.data.revenueCents).toBe(1200000);
  });
});
