import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminBillingPage from "./page";
import { BillingTabsView } from "./billing-tabs-view";

vi.mock("@mocter/domain", () => ({
  fetchAdminPlans: vi.fn().mockResolvedValue([
    {
      id: "plan-1",
      code: "crecimiento",
      name: { es: "Crecimiento", en: "Growth" },
      priceMonthlyCents: 14900000,
      priceAnnualCents: 149000000,
      currency: "COP",
      trialDays: 14,
      isPublic: true,
      isPopular: true,
      status: "active",
    },
  ]),
  getBillingService: vi.fn().mockReturnValue({
    getAdminBillingOverview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        metrics: {
          mrrCents: 14900000,
          activeCount: 1,
          trialingCount: 2,
          pastDueCount: 0,
          totalInvoicesCount: 5,
        },
        subscriptions: [
          {
            id: "sub-1",
            clientId: "cli-1",
            clientName: "Empresa Uno",
            clientSlug: "empresa-uno",
            planId: "plan-1",
            planCode: "crecimiento",
            planName: { es: "Crecimiento", en: "Growth" },
            planPriceMonthlyCents: 14900000,
            planPriceAnnualCents: 149000000,
            currency: "COP",
            status: "active",
            cycle: "monthly",
            trialEndsAt: null,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(),
            createdAt: new Date(),
            billingProfile: {
              companyName: "Empresa Uno SAS",
              dni: "900123456-1",
              email: "facturacion@empresauno.com",
            },
          },
        ],
        recentInvoices: [],
        recentReceipts: [],
      },
    }),
    listPaymentGatewaysPublicConfig: vi.fn().mockResolvedValue({
      ok: true,
      data: [
        {
          id: "wompi",
          displayName: "Wompi (Colombia / COP)",
          isEnabled: true,
          environment: "sandbox",
          publicKey: "pub_test_123",
          hasSecretKey: true,
          hasWebhookSecret: true,
          webhookUrl: "/api/webhooks/wompi",
          updatedAt: new Date(),
        },
        {
          id: "stripe",
          displayName: "Stripe (Internacional / USD)",
          isEnabled: false,
          environment: "sandbox",
          publicKey: null,
          hasSecretKey: false,
          hasWebhookSecret: false,
          webhookUrl: "/api/webhooks/stripe",
          updatedAt: new Date(),
        },
      ],
    }),
  }),
}));

describe("BILL-001 · Facturación Y Suscripciones SaaS (Backoffice)", () => {
  it("renderiza el Server Component y pasa overview y gateways a BillingTabsView", async () => {
    const page = await AdminBillingPage({ searchParams: Promise.resolve({ tab: "subscriptions" }) });
    expect(page.type).toBe(BillingTabsView);
    expect(page.props.initialTab).toBe("subscriptions");
    expect(page.props.plansList.length).toBe(1);
    expect(page.props.gateways.length).toBe(2);
    expect(page.props.overview.metrics.activeCount).toBe(1);
  });
});

