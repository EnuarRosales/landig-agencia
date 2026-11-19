import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { ReferralsService } from "@mocter/domain";

const resolveContextMock = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: (...args: unknown[]) => resolveContextMock(...args),
  };
});

import { createTenantReferralsGetHandler } from "./route";

describe("SPEC-16 §9.1 · GET /api/tenant/referrals", () => {
  let mockReferralsService: ReferralsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReferralsService = {
      getTenantReferralsOverview: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          program: {
            id: "prog-1",
            name: "Programa de Referidos Mocter",
            status: "active",
            rewardType: "fixed",
            rewardValue: 5000000,
            currency: "COP",
            attributionDays: 60,
            creditValidityDays: 365,
            capReferralsPerReferrer: null,
          },
          code: "ANDES482",
          referralLink: "http://localhost:3001/r/ANDES482",
          qrSvgDataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
          metrics: {
            totalReferred: 2,
            pendingCount: 1,
            rewardedCount: 1,
            totalEarnedCents: 5000000,
            availableCreditCents: 5000000,
            currency: "COP",
          },
          referrals: {
            items: [
              {
                id: "ref-1",
                referredBusinessMasked: "Tienda Be***",
                status: "rewarded",
                attributedAt: "2026-11-10T10:00:00.000Z",
                qualifiedAt: "2026-11-12T10:00:00.000Z",
                rejectedReason: null,
                rewardAmountCents: 5000000,
                rewardCurrency: "COP",
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
          rewards: [],
          redemptions: [],
        },
      }),
    } as unknown as ReferralsService;
  });

  it("retorna 200 OK con el overview completo para tenant_owner", async () => {
    resolveContextMock.mockResolvedValue({
      scope: "tenant",
      role: "tenant_owner",
      effectiveRoles: ["tenant_owner"],
      activeClientId: "client-1",
      activeClient: { id: "client-1", slug: "cafe-andes", locale: "es" },
      user: { id: "user-1", email: "owner@andes.co" },
    });

    const handler = createTenantReferralsGetHandler(mockReferralsService);
    const req = new NextRequest("http://localhost:3003/api/tenant/referrals?page=1&limit=20", {
      headers: { cookie: "mocter_sid=sid-owner" },
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.code).toBe("ANDES482");
    expect(json.data.referrals.items[0].referredBusinessMasked).toBe("Tienda Be***");
  });

  it("retorna 400 Problem Details cuando limit excede 50 (?limit=999)", async () => {
    resolveContextMock.mockResolvedValue({
      scope: "tenant",
      role: "tenancy_owner",
      effectiveRoles: ["tenancy_owner"],
      activeClientId: "client-1",
      activeClient: { id: "client-1", slug: "cafe-andes", locale: "es" },
      user: { id: "user-1", email: "owner@andes.co" },
    });

    const handler = createTenantReferralsGetHandler(mockReferralsService);
    const req = new NextRequest("http://localhost:3003/api/tenant/referrals?limit=999", {
      headers: { cookie: "mocter_sid=sid-owner" },
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("retorna 403 Forbidden cuando el usuario es tenant_agent", async () => {
    resolveContextMock.mockResolvedValue({
      scope: "tenant",
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
      activeClientId: "client-1",
      activeClient: { id: "client-1", slug: "cafe-andes", locale: "es" },
      user: { id: "user-2", email: "agent@andes.co" },
    });

    const handler = createTenantReferralsGetHandler(mockReferralsService);
    const req = new NextRequest("http://localhost:3003/api/tenant/referrals", {
      headers: { cookie: "mocter_sid=sid-agent" },
    });

    const res = await handler(req);
    expect(res.status).toBe(403);
    expect(mockReferralsService.getTenantReferralsOverview).not.toHaveBeenCalled();
  });
});
