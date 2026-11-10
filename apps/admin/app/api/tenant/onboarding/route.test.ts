import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as domain from "@mocter/domain";
import { ok, err } from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    tenantOnboardingService: {
      getOnboardingState: vi.fn(),
      completeStep1Business: vi.fn(),
      completeStep2FirstProduct: vi.fn(),
      completeStep3BotAndActivate: vi.fn(),
    },
    appLogger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe("/api/tenant/onboarding Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        headers: { cookie: "mocter_sid=invalid-or-expired-sid" },
      });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.title).toBe("Unauthorized");
    });

    it("returns 200 with onboarding state for authenticated user", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
        user: { id: "user-1", email: "owner@synergia.com", displayName: "Owner", status: "active", emailVerifiedAt: null },
        session: { id: "sess-1" },
        scope: "tenant",
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        lifecycleStatus: "alta",
        activeClientId: "client-1",
        activeClient: null,
        activeCellId: "cell-1",
        activeCellCode: "cell-01",
        planName: "Pro",
        capabilities: {},
      });

      vi.mocked(domain.tenantOnboardingService.getOnboardingState).mockResolvedValueOnce(
        ok({
          step: 2,
          client: {
            id: "client-1",
            displayName: "Synergia Market",
            slug: "synergia-market",
            locale: "es",
            currency: "COP",
            timezone: "America/Bogota",
            lifecycleStatus: "alta",
            planId: "p1",
            planCode: "pro",
            cellCode: "cell-01",
          },
          draft: {},
          availablePlans: [],
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        headers: { cookie: "mocter_sid=valid-sid" },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.step).toBe(2);
      expect(json.data.client.slug).toBe("synergia-market");
    });
  });

  describe("POST", () => {
    it("returns 400 when body does not match step schemas", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
        user: { id: "user-1", email: "owner@test.com", displayName: "Owner", status: "active", emailVerifiedAt: null },
        session: { id: "sess-1" },
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: [],
        lifecycleStatus: null,
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
      });

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({ action: "invalid_step" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.title).toBe("Validation Error");
    });

    it("executes step1_business and returns nextStep: 2", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
        user: { id: "user-1", email: "prospect@test.com", displayName: "Prospect", status: "active", emailVerifiedAt: null },
        session: { id: "sess-1" },
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: [],
        lifecycleStatus: null,
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
      });

      vi.mocked(domain.tenantOnboardingService.completeStep1Business).mockResolvedValueOnce(
        ok({
          clientId: "client-123",
          slug: "tienda-nueva",
          displayName: "Tienda Nueva",
          nextStep: 2,
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({
          action: "step1_business",
          displayName: "Tienda Nueva",
          slug: "tienda-nueva",
          currency: "COP",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.nextStep).toBe(2);
      expect(json.data.clientId).toBe("client-123");
    });

    it("executes step2_product and returns nextStep: 3", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
        user: { id: "user-1", email: "owner@test.com", displayName: "Owner", status: "active", emailVerifiedAt: null },
        session: { id: "sess-1" },
        scope: "tenant",
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        lifecycleStatus: "alta",
        activeClientId: "client-123",
        activeClient: null,
        activeCellId: "cell-1",
        activeCellCode: "cell-01",
        planName: "Pro",
        capabilities: {},
      });

      vi.mocked(domain.tenantOnboardingService.completeStep2FirstProduct).mockResolvedValueOnce(
        ok({
          productId: "prod-456",
          name: "Camisa Oxford",
          nextStep: 3,
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({
          action: "step2_product",
          name: "Camisa Oxford",
          description: "Camisa de algodón de alta calidad.",
          priceCents: 120000,
          currency: "COP",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.nextStep).toBe(3);
      expect(json.data.productId).toBe("prod-456");
    });

    it("executes step3_activate and returns redirectTo: /workspace", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
        user: { id: "user-1", email: "owner@test.com", displayName: "Owner", status: "active", emailVerifiedAt: null },
        session: { id: "sess-1" },
        scope: "tenant",
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        lifecycleStatus: "alta",
        activeClientId: "client-123",
        activeClient: null,
        activeCellId: "cell-1",
        activeCellCode: "cell-01",
        planName: "Pro",
        capabilities: {},
      });

      vi.mocked(domain.tenantOnboardingService.completeStep3BotAndActivate).mockResolvedValueOnce(
        ok({
          clientId: "client-123",
          lifecycleStatus: "activo",
          redirectTo: "/workspace",
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({
          action: "step3_activate",
          botPreset: "friendly_sales",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.lifecycleStatus).toBe("activo");
      expect(json.data.redirectTo).toBe("/workspace");
    });
  });
});
