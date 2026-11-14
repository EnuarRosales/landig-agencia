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
      priceMonthlyUsdCents: 3900,
      priceAnnualUsdCents: 39000,
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
          supportedCountries: ["CO"],
          breBKeyType: null,
          breBKeyValue: null,
          breBRecipientName: null,
          breBQrPayloadTemplate: null,
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
          supportedCountries: ["*"],
          breBKeyType: null,
          breBKeyValue: null,
          breBRecipientName: null,
          breBQrPayloadTemplate: null,
          updatedAt: new Date(),
        },
        {
          id: "bre_b",
          displayName: "Bre-B (Colombia / COP)",
          isEnabled: false,
          environment: "production",
          publicKey: null,
          hasSecretKey: false,
          hasWebhookSecret: false,
          webhookUrl: "/api/tenant/billing/bre-b/report",
          supportedCountries: ["CO"],
          breBKeyType: null,
          breBKeyValue: null,
          breBRecipientName: null,
          breBQrPayloadTemplate: null,
          updatedAt: new Date(),
        },
      ],
    }),
    listManualBreBReports: vi.fn().mockResolvedValue({
      ok: true,
      data: [
        {
          id: "rep-1",
          clientId: "cli-1",
          clientName: "Empresa Uno",
          clientSlug: "empresa-uno",
          clientCountry: "CO",
          clientEmail: "owner@empresauno.com",
          clientLocale: "es",
          subscriptionId: "sub-1",
          invoiceId: "inv-1",
          invoiceNumber: "INV-2026-100001",
          invoiceStatus: "issued",
          targetPlanId: "plan-1",
          planCode: "crecimiento",
          planName: { es: "Crecimiento", en: "Growth" },
          targetCycle: "monthly",
          operationKind: "renewal",
          channel: "bre_b",
          expectedAmountCents: 14900000,
          reportedAmountCents: 14900000,
          currency: "COP",
          paymentReference: "BREB-101",
          voucherMediaKey: "billing-vouchers/cli-1/inv-1.png",
          voucherMimeType: "image/png",
          dynamicQrPayload: "000201...",
          breBKeySnapshot: "email:pagos@mocter.co",
          status: "pending_review",
          submittedByUserId: "usr-1",
          reviewedByUserId: null,
          reviewedAt: null,
          rejectionReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "usr-1",
          updatedBy: "usr-1",
        },
      ],
    }),
  }),
}));

describe("BILL-001 & SPEC-04 · Facturación Y Suscripciones SaaS (Backoffice)", () => {
  it("renderiza el Server Component y pasa overview, gateways y manualReports a BillingTabsView", async () => {
    const page = await AdminBillingPage({ searchParams: Promise.resolve({ tab: "subscriptions" }) });
    expect(page.type).toBe(BillingTabsView);
    expect(page.props.initialTab).toBe("subscriptions");
    expect(page.props.plansList.length).toBe(1);
    expect(page.props.gateways.length).toBe(3);
    expect(page.props.manualReports.length).toBe(1);
    expect(page.props.overview.metrics.activeCount).toBe(1);
  });
});

