import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveTenantSession = vi.fn();
const mockAssertCapability = vi.fn();

const mockGovernanceService = {
  getTenantOverview: vi.fn(),
  requestLeaderAuthorization: vi.fn(),
  createOrganization: vi.fn(),
  joinByInviteCode: vi.fn(),
};

const mockFeedService = {
  getTenantWallPosts: vi.fn(),
  createPost: vi.fn(),
};

const mockCloningService = {
  listCommunityFeedCatalog: vi.fn(),
  publishShareFromCellProduct: vi.fn(),
  adoptShareToTenant: vi.fn(),
  updateAdoptionPolicies: vi.fn(),
};

const mockMetricsService = {
  getCommunityAttributedMetrics: vi.fn(),
};

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: (...args: unknown[]) => mockResolveTenantSession(...args),
}));

vi.mock("@mocter/domain", async () => {
  const actual = await vi.importActual<typeof import("@mocter/domain")>("@mocter/domain");
  return {
    ...actual,
    TenantCapabilityGateService: class {
      assertCapability = (...args: unknown[]) => mockAssertCapability(...args);
    },
    getCommunitiesGovernanceService: () => mockGovernanceService,
    getCommunityFeedService: () => mockFeedService,
    getProductCloningService: () => mockCloningService,
    getCommunityLeadershipMetricsService: () => mockMetricsService,
  };
});

import { GET as getOverview } from "./community/overview/route";
import { POST as postLeaderRequest } from "./community/leader-request/route";
import { POST as postCreateOrg } from "./community/organizations/route";
import { GET as getFeed } from "./community/feed/route";
import { POST as postAdoptShare } from "./community/shares/[shareId]/adopt/route";
import { PATCH as patchAdoptionPolicies } from "./community/adoptions/[adoptionId]/policies/route";
import { GET as getLeadershipMetrics } from "./community/leadership-metrics/route";

describe("SPEC-15 · /api/tenant/community/*", () => {
  const orgId = "33333333-3333-4333-8333-333333333333";
  const shareId = "44444444-4444-4444-8444-444444444444";
  const adoptionId = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertCapability.mockResolvedValue({ ok: true, data: true });
    mockResolveTenantSession.mockResolvedValue({
      ok: true,
      clientId: "11111111-1111-1111-1111-111111111111",
      context: {
        scope: "tenant",
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        user: { id: "99999999-9999-9999-9999-999999999999", email: "owner@tienda.co" },
      },
    });
  });

  it("bloquea con 403 Problem Details si el plan no incluye community_feed", async () => {
    mockAssertCapability.mockResolvedValueOnce({
      ok: false,
      error: "Tu plan no incluye esta funcionalidad.",
      code: "CAPABILITY_NOT_INCLUDED",
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/community/overview");
    const res = await getOverview(req);
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const json = await res.json();
    expect(json.code).toBe("CAPABILITY_NOT_INCLUDED");
  });

  it("bloquea mutaciones y métricas agregadas para tenant_agent (403 FORBIDDEN_OWNER_ONLY)", async () => {
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "11111111-1111-1111-1111-111111111111",
      context: {
        scope: "tenant",
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
        user: { id: "88888888-8888-8888-8888-888888888888", email: "agent@tienda.co" },
      },
    });

    const req = new NextRequest(
      `http://localhost:3003/api/tenant/community/leadership-metrics?organizationId=${orgId}`,
    );
    const res = await getLeadershipMetrics(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("FORBIDDEN_OWNER_ONLY");

    // Y permite lectura de catálogo feed si tiene community_feed
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "11111111-1111-1111-1111-111111111111",
      context: {
        scope: "tenant",
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
        user: { id: "88888888-8888-8888-8888-888888888888", email: "agent@tienda.co" },
      },
    });
    mockCloningService.listCommunityFeedCatalog.mockResolvedValueOnce({
      ok: true,
      data: { items: [], pendingModerationItems: [], categories: [], total: 0, page: 1, limit: 12, totalPages: 0 },
    });
    const feedRes = await getFeed(new NextRequest("http://localhost:3003/api/tenant/community/feed"));
    expect(feedRes.status).toBe(200);
  });

  it("permite solicitar liderazgo y retorna 422 Problem Details cuando un líder excede cuota o adoptante viola minResale", async () => {
    mockGovernanceService.requestLeaderAuthorization.mockResolvedValueOnce({
      ok: true,
      data: { status: "pending" },
    });

    const leaderRes = await postLeaderRequest(
      new NextRequest("http://localhost:3003/api/tenant/community/leader-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedCommunityName: "Red Calzado Valle",
          businessModel: "Red mayorista de distribuidores regionales.",
        }),
      }),
    );
    expect(leaderRes.status).toBe(201);

    mockGovernanceService.createOrganization.mockResolvedValueOnce({
      ok: false,
      error: "Cuota excedida",
      code: "LEADER_QUOTA_EXCEEDED",
    });

    const orgRes = await postCreateOrg(
      new NextRequest("http://localhost:3003/api/tenant/community/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Extra Comunidad" }),
      }),
    );
    expect(orgRes.status).toBe(422);

    mockCloningService.adoptShareToTenant.mockResolvedValueOnce({
      ok: true,
      data: {
        adoptionId,
        cloneProductId: "clone-1",
        cloneCellId: "cell-01",
        createdProductsCount: 1,
        copiedMediaCount: 2,
        skippedMedia: [],
        version: 1,
      },
    });

    const adoptRes = await postAdoptShare(
      new NextRequest(`http://localhost:3003/api/tenant/community/shares/${shareId}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customSalePriceCents: 15000000, includeMediaMode: "all_compatible" }),
      }),
      { params: Promise.resolve({ shareId }) },
    );
    expect(adoptRes.status).toBe(201);

    mockCloningService.updateAdoptionPolicies.mockResolvedValueOnce({
      ok: false,
      error: "Protegido",
      code: "FORBIDDEN_PROTECTED_ATTRIBUTE_AUTOSYNC",
    });
    const policyRes = await patchAdoptionPolicies(
      new NextRequest(`http://localhost:3003/api/tenant/community/adoptions/${adoptionId}/policies`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSyncAttributes: ["priceCents"] }),
      }),
      { params: Promise.resolve({ adoptionId }) },
    );
    expect(policyRes.status).toBe(403);
  });
});
