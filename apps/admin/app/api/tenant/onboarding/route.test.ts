import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as domain from "@mocter/domain";
import { ok } from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    tenantOnboardingService: {
      getOnboardingState: vi.fn(),
      saveBusinessStep: vi.fn(),
      completeStep1Business: vi.fn(),
      savePlanStep: vi.fn(),
      saveFirstProductStep: vi.fn(),
      completeStep2FirstProduct: vi.fn(),
      saveAssistantAndPaymentsStep: vi.fn(),
      completeOnboardingStep: vi.fn(),
      completeStep3BotAndActivate: vi.fn(),
    },
    appLogger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
});

const prospectAuth = {
  user: { id: "user-1", email: "prospect@test.com", displayName: "Prospect", status: "active", emailVerifiedAt: null },
  session: { id: "sess-1" },
  scope: "onboarding_prospect" as const,
  role: "onboarding_prospect" as const,
  effectiveRoles: [],
  lifecycleStatus: null,
  activeClientId: null,
  activeClient: null,
  activeCellId: null,
  activeCellCode: null,
  planName: null,
  capabilities: {},
};

const tenantAuth = {
  user: { id: "user-1", email: "owner@test.com", displayName: "Owner", status: "active", emailVerifiedAt: null },
  session: { id: "sess-1" },
  scope: "tenant" as const,
  role: "tenant_owner" as const,
  effectiveRoles: ["tenant_owner"],
  lifecycleStatus: "alta" as const,
  activeClientId: "client-123",
  activeClient: null,
  activeCellId: "cell-1",
  activeCellCode: "cell-01",
  planName: "Pro",
  capabilities: {},
};

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

    it("returns 200 with 5-step onboarding state and passes ?plan preselection", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(tenantAuth);

      vi.mocked(domain.tenantOnboardingService.getOnboardingState).mockResolvedValueOnce(
        ok({
          step: 2,
          stepKey: "plan",
          client: {
            id: "client-123",
            displayName: "Synergia Market",
            slug: "synergia-market",
            commercialEmail: "ventas@synergia.com",
            phone: "+573001234567",
            websiteUrl: "https://synergia.com",
            logoMediaId: null,
            logoUrl: null,
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
          botCatalog: { tones: [], presets: [], objectives: [] },
          paymentChannels: [],
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding?plan=pro", {
        headers: { cookie: "mocter_sid=valid-sid" },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(domain.tenantOnboardingService.getOnboardingState).toHaveBeenCalledWith("user-1", {
        preselectedPlanCode: "pro",
      });
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.step).toBe(2);
      expect(json.data.stepKey).toBe("plan");
    });
  });

  describe("POST", () => {
    it("returns 400 when body does not match step schemas", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(prospectAuth);

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
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(prospectAuth);

      vi.mocked(domain.tenantOnboardingService.saveBusinessStep).mockResolvedValueOnce(
        ok({
          clientId: "client-123",
          slug: "tienda-nueva",
          displayName: "Tienda Nueva",
          locale: "es",
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
          commercialEmail: "ventas@tiendanueva.co",
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

    it("executes step2_plan and returns nextStep: 3", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(tenantAuth);

      vi.mocked(domain.tenantOnboardingService.savePlanStep).mockResolvedValueOnce(
        ok({
          planId: "plan-pro",
          planCode: "custom-start",
          cycle: "monthly",
          nextStep: 3,
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({
          action: "step2_plan",
          planCode: "custom-start",
          cycle: "monthly",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.nextStep).toBe(3);
    });

    it("executes step3_product with costPriceCents and returns nextStep: 4", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(tenantAuth);

      vi.mocked(domain.tenantOnboardingService.saveFirstProductStep).mockResolvedValueOnce(
        ok({
          productId: "prod-456",
          name: "Camisa Oxford",
          profitability: { profitCents: 60000, marginPct: 50, markupPct: 100, isNegative: false },
          nextStep: 4,
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({
          action: "step3_product",
          name: "Camisa Oxford",
          description: "Camisa de algodón de alta calidad.",
          costPriceCents: 60000,
          salePriceCents: 120000,
          currency: "COP",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.nextStep).toBe(4);
      expect(json.data.profitability.marginPct).toBe(50);
    });

    it("executes step4_assistant_payments and returns nextStep: 5", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(tenantAuth);

      vi.mocked(domain.tenantOnboardingService.saveAssistantAndPaymentsStep).mockResolvedValueOnce(
        ok({
          botId: "bot-1",
          chatwootLabelsInitialized: true,
          nextStep: 5,
        }),
      );

      const req = new NextRequest("http://localhost:3003/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "mocter_sid=valid-sid" },
        body: JSON.stringify({
          action: "step4_assistant_payments",
          botObjective: "Vender productos y cerrar pedidos por chat",
          paymentChannels: [
            { channelCode: "nequi", displayName: "Nequi", accountIdentifier: "3001234567" },
          ],
          orderConfirmationMessage: "¡Gracias por tu pedido!",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.nextStep).toBe(5);
      expect(json.data.chatwootLabelsInitialized).toBe(true);
    });

    it("executes step5_complete and returns redirectTo: /workspace", async () => {
      vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(tenantAuth);

      vi.mocked(domain.tenantOnboardingService.completeOnboardingStep).mockResolvedValueOnce(
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
          action: "step5_complete",
          completionMode: "trial",
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
