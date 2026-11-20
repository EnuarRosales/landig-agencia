import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePlatformAdmin = vi.fn();
const mockGovernanceService = {
  getAdminOverview: vi.fn(),
  reviewLeaderAuthorization: vi.fn(),
  setOrganizationPlatformStatus: vi.fn(),
};
const mockFeedService = {
  updateRetentionSettings: vi.fn(),
  purgeExpiredPosts: vi.fn(),
};

vi.mock("@/lib/billing-route-auth", () => ({
  requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
}));

vi.mock("@mocter/domain", async () => {
  const actual = await vi.importActual<typeof import("@mocter/domain")>("@mocter/domain");
  return {
    ...actual,
    getCommunitiesGovernanceService: () => mockGovernanceService,
    getCommunityFeedService: () => mockFeedService,
  };
});

import { GET, POST } from "./route";

describe("SPEC-15 · /api/admin/communities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAdmin.mockResolvedValue({
      scope: "platform",
      role: "platform_admin",
      effectiveRoles: ["platform_admin"],
      user: { id: "11111111-1111-1111-1111-111111111111", email: "admin@mocter.co" },
    });
  });

  it("GET retorna vista global de solicitudes de líderes y organizaciones", async () => {
    mockGovernanceService.getAdminOverview.mockResolvedValueOnce({
      ok: true,
      data: { authorizations: [], organizations: [] },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/communities");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockGovernanceService.getAdminOverview).toHaveBeenCalledTimes(1);
  });

  it("POST review_leader aprueba líder con cupo maxOwnedCommunities", async () => {
    const targetClientId = "22222222-2222-4222-8222-222222222222";
    mockGovernanceService.reviewLeaderAuthorization.mockResolvedValueOnce({
      ok: true,
      data: { clientId: targetClientId, status: "approved", maxOwnedCommunities: 5 },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review_leader",
        clientId: targetClientId,
        decision: "approve",
        maxOwnedCommunities: 5,
        reviewNotes: "Verificado como distribuidor",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGovernanceService.reviewLeaderAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: targetClientId,
        action: "approve",
        maxOwnedCommunities: 5,
      }),
    );
  });

  it("POST update_retention_settings y run_retention_purge gestionan la retención del muro", async () => {
    mockFeedService.updateRetentionSettings.mockResolvedValueOnce({
      ok: true,
      data: {
        feedRetentionDays: 60,
        lastRetentionPurgeAt: null,
        lastRetentionPurgedCount: 0,
        eligibleToPurgeCount: 2,
      },
    });

    const updateRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_retention_settings",
          feedRetentionDays: 60,
        }),
      }),
    );
    expect(updateRes.status).toBe(200);
    expect(mockFeedService.updateRetentionSettings).toHaveBeenCalledWith({
      feedRetentionDays: 60,
      actorUserId: "11111111-1111-1111-1111-111111111111",
    });

    mockFeedService.purgeExpiredPosts.mockResolvedValueOnce({
      ok: true,
      data: {
        purgedPostsCount: 2,
        releasedMediaCount: 1,
        releasedBytesTotal: 512000,
        skippedQuotaReleasesCount: 0,
        executedAt: "2026-11-20T00:00:00.000Z",
      },
    });

    const purgeRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_retention_purge" }),
      }),
    );
    expect(purgeRes.status).toBe(200);
    expect(mockFeedService.purgeExpiredPosts).toHaveBeenCalledTimes(1);
  });
});
