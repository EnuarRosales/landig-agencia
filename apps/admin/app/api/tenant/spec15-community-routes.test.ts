import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveTenantSession = vi.fn();
const mockAssertCapability = vi.fn();

const mockGovernanceService = {
  getTenantOverview: vi.fn(),
  requestLeaderAuthorization: vi.fn(),
  createOrganization: vi.fn(),
  joinByInviteCode: vi.fn(),
  inviteTenant: vi.fn(),
  resendInvitationNotification: vi.fn(),
  revokeInvitation: vi.fn(),
};

const mockFeedService = {
  getTenantWallPosts: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  uploadWallImage: vi.fn(),
  pinPost: vi.fn(),
  unpinPost: vi.fn(),
  deletePost: vi.fn(),
  createReply: vi.fn(),
  updateSharingProfile: vi.fn(),
};

const mockCloningService = {
  listCommunityFeedCatalog: vi.fn(),
  publishShareFromCellProduct: vi.fn(),
  checkAdoptionEligibility: vi.fn(),
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
import { GET as getAdoptEligibility, POST as postAdoptShare } from "./community/shares/[shareId]/adopt/route";
import { PATCH as patchAdoptionPolicies } from "./community/adoptions/[adoptionId]/policies/route";
import { GET as getLeadershipMetrics } from "./community/leadership-metrics/route";
import { POST as postWallPost } from "./community/posts/route";
import { DELETE as deleteWallPost, PATCH as patchWallPost } from "./community/posts/[id]/route";
import { POST as postPinWallPost } from "./community/posts/[id]/pin/route";
import { POST as postWallReply } from "./community/posts/[id]/replies/route";
import { POST as postOrgInvite } from "./community/organizations/[orgId]/invite/route";
import { DELETE as deleteInvitation } from "./community/invitations/[id]/route";
import { POST as postResendInvitation } from "./community/invitations/[id]/resend/route";
import { PUT as putSharingProfile, PATCH as patchSharingProfile } from "./community/sharing-profile/route";

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

  it("permite publicar post enriquecido, fijar, responder con emojis (incluyendo tenant_agent) y eliminar liberando cuota", async () => {
    const postId = "66666666-6666-4666-8666-666666666666";
    const mediaId = "77777777-7777-4777-8777-777777777777";
    mockFeedService.createPost.mockResolvedValueOnce({
      ok: true,
      data: { postId, status: "published" },
    });

    const createRes = await postWallPost(
      new NextRequest("http://localhost:3003/api/tenant/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          body: "<p><strong>Hola</strong></p>",
          bodyFormat: "html",
          mediaId,
          videoUrl: "https://youtu.be/dQw4w9WgXcQ",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    expect(mockFeedService.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyFormat: "html",
        mediaId,
        videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
    );

    mockFeedService.pinPost.mockResolvedValueOnce({
      ok: true,
      data: { postId, isPinned: true },
    });
    const pinRes = await postPinWallPost(
      new NextRequest(`http://localhost:3003/api/tenant/community/posts/${postId}/pin`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(pinRes.status).toBe(200);

    // tenant_agent puede responder con texto + emojis
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
    mockFeedService.createReply.mockResolvedValueOnce({
      ok: true,
      data: {
        id: "reply-1",
        postId,
        authorClientId: "11111111-1111-1111-1111-111111111111",
        authorDisplayName: "Tienda",
        body: "¡Excelente! 🎉",
        createdAt: new Date().toISOString(),
      },
    });
    const replyRes = await postWallReply(
      new NextRequest(`http://localhost:3003/api/tenant/community/posts/${postId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "¡Excelente! 🎉" }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(replyRes.status).toBe(201);

    mockFeedService.deletePost.mockResolvedValueOnce({
      ok: true,
      data: { deleted: true, freedBytes: 102400 },
    });
    const delRes = await deleteWallPost(
      new NextRequest(`http://localhost:3003/api/tenant/community/posts/${postId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(delRes.status).toBe(200);

    mockFeedService.updatePost.mockResolvedValueOnce({
      ok: true,
      data: { postId, status: "published", freedBytes: 0 },
    });
    const patchRes = await patchWallPost(
      new NextRequest(`http://localhost:3003/api/tenant/community/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: '<p>Actualizado <a href="https://mocter.co">Ver</a></p>',
          bodyFormat: "html",
          mediaId: null,
          videoUrl: null,
        }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(patchRes.status).toBe(200);
    expect(mockFeedService.updatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        postId,
        bodyFormat: "html",
        mediaId: null,
      }),
    );

    mockFeedService.updatePost.mockResolvedValueOnce({
      ok: false,
      error: "Solo el comercio autor puede editar su publicación del muro.",
      code: "FORBIDDEN_AUTHOR_ONLY",
    });
    const forbiddenPatch = await patchWallPost(
      new NextRequest(`http://localhost:3003/api/tenant/community/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "<p>Otro</p>", bodyFormat: "html" }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(forbiddenPatch.status).toBe(403);
  });

  it("T-12 · mantiene invitación vigente sin duplicar (200), reenvía notificación y permite cancelar invitación", async () => {
    const invitationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mockGovernanceService.inviteTenant.mockResolvedValueOnce({
      ok: true,
      data: {
        invitationId,
        targetClientId: "22222222-2222-4222-8222-222222222222",
        inviteCode: "MCT-1234",
        reusedExisting: true,
        expiresAt: "2026-11-26T00:00:00.000Z",
      },
    });

    const reusedRes = await postOrgInvite(
      new NextRequest(`http://localhost:3003/api/tenant/community/organizations/${orgId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetClientSlugOrEmail: "vitality-force", role: "member" }),
      }),
      { params: Promise.resolve({ orgId }) },
    );
    expect(reusedRes.status).toBe(200);
    const reusedJson = await reusedRes.json();
    expect(reusedJson.data.reusedExisting).toBe(true);

    mockGovernanceService.resendInvitationNotification.mockResolvedValueOnce({
      ok: true,
      data: { invitationId, resentAt: "2026-11-20T00:00:00.000Z" },
    });
    const resendRes = await postResendInvitation(
      new NextRequest(`http://localhost:3003/api/tenant/community/invitations/${invitationId}/resend`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: invitationId }) },
    );
    expect(resendRes.status).toBe(200);

    mockGovernanceService.revokeInvitation.mockResolvedValueOnce({
      ok: true,
      data: { invitationId, status: "revoked" },
    });
    const revokeRes = await deleteInvitation(
      new NextRequest(`http://localhost:3003/api/tenant/community/invitations/${invitationId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: invitationId }) },
    );
    expect(revokeRes.status).toBe(200);
    const revokeJson = await revokeRes.json();
    expect(revokeJson.data.status).toBe("revoked");
  });

  it("permite guardar preferencias de privacidad vía PUT y PATCH con todas las opciones activadas", async () => {
    const payload = {
      shareEmail: true,
      sharePhone: true,
      shareAddress: true,
      shareSocialLinks: true,
    };
    mockFeedService.updateSharingProfile.mockResolvedValue({
      ok: true,
      data: { clientId: "11111111-1111-1111-1111-111111111111", ...payload },
    });

    const putRes = await putSharingProfile(
      new NextRequest("http://localhost:3003/api/tenant/community/sharing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(putRes.status).toBe(200);

    const patchRes = await patchSharingProfile(
      new NextRequest("http://localhost:3003/api/tenant/community/sharing-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(patchRes.status).toBe(200);
    expect(mockFeedService.updateSharingProfile).toHaveBeenCalledTimes(2);
  });

  it("T-13 · evalúa elegibilidad GET y devuelve 422 con issues explícitos cuando excede límites del plan", async () => {
    mockCloningService.checkAdoptionEligibility.mockResolvedValueOnce({
      ok: true,
      data: {
        allowed: false,
        includeMediaMode: "all_compatible",
        violations: [
          {
            dimension: "products",
            currentUsed: 1,
            requiredDelta: 1,
            projectedTotal: 2,
            limitValue: 1,
          },
        ],
        summary: {
          productsUsed: 1,
          productsNeeded: 1,
          productsLimit: 1,
          storageUsedBytes: 0,
          storageNeededBytes: 0,
          storageLimitBytes: 104857600,
        },
      },
    });

    const eligRes = await getAdoptEligibility(
      new NextRequest(
        `http://localhost:3003/api/tenant/community/shares/${shareId}/adopt?includeMediaMode=all_compatible`,
      ),
      { params: Promise.resolve({ shareId }) },
    );
    expect(eligRes.status).toBe(200);
    const eligJson = await eligRes.json();
    expect(eligJson.data.allowed).toBe(false);
    expect(eligJson.data.violations[0].dimension).toBe("products");

    mockCloningService.adoptShareToTenant.mockResolvedValueOnce({
      ok: false,
      code: "PRODUCT_QUOTA_EXCEEDED",
      error: "No es posible clonar porque supera la capacidad de tu plan: Productos en Catálogo (products): usas 1 de 1 permitido(s), requiere +1.",
      issues: [{ dimension: "products", currentUsed: 1, requiredDelta: 1, projectedTotal: 2, limitValue: 1 }],
    });

    const blockedPost = await postAdoptShare(
      new NextRequest(`http://localhost:3003/api/tenant/community/shares/${shareId}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customSalePriceCents: 15000000 }),
      }),
      { params: Promise.resolve({ shareId }) },
    );
    expect(blockedPost.status).toBe(422);
    const blockedJson = await blockedPost.json();
    expect(blockedJson.code).toBe("PRODUCT_QUOTA_EXCEEDED");
    expect(blockedJson.issues[0].dimension).toBe("products");
  });
});
