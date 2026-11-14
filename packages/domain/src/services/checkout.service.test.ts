import { describe, expect, it, vi, beforeEach } from "vitest";
import { CheckoutService } from "./checkout.service";
import type { IBillingRepository } from "../repositories/billing.repository.interface";

describe("BILL-001 T-06 · CheckoutService", () => {
  let mockRepo: IBillingRepository;
  let service: CheckoutService;

  beforeEach(() => {
    mockRepo = {
      getBillingProfile: vi.fn(),
      upsertBillingProfile: vi.fn(),
      getPaymentMethods: vi.fn(),
      getDefaultPaymentMethod: vi.fn(),
      createPaymentMethod: vi.fn(),
      setDefaultPaymentMethod: vi.fn(),
      getSubscriptionByClientId: vi.fn(),
      createSubscription: vi.fn(),
      updateSubscriptionStatus: vi.fn(),
      getInvoiceById: vi.fn(),
      getInvoiceByNumber: vi.fn(),
      listInvoicesByClientId: vi.fn(),
      createInvoice: vi.fn().mockImplementation((inv) => Promise.resolve({ ...inv, id: "inv-gen-123" })),
      updateInvoiceStatus: vi.fn(),
      getPaymentByGatewayReference: vi.fn(),
      createPayment: vi.fn(),
      createReceipt: vi.fn(),
      getReceiptByPaymentId: vi.fn(),
      updateReceiptEmailStatus: vi.fn(),
      recordSubscriptionChange: vi.fn(),
      updateSubscriptionTrial: vi.fn(),
      listAllSubscriptions: vi.fn(),
      getBillingOverviewMetrics: vi.fn(),
      listAllInvoices: vi.fn(),
      listAllReceipts: vi.fn(),
      listPaymentGatewaysConfig: vi.fn().mockResolvedValue([]),
      getPaymentGatewayConfig: vi.fn().mockResolvedValue(null),
      upsertPaymentGatewayConfig: vi.fn(),
      getClientBillingSummary: vi.fn(),
      getPlanById: vi.fn().mockResolvedValue(null),
      getPendingManualReportByClientId: vi.fn().mockResolvedValue(null),
    };
    service = new CheckoutService(mockRepo, "pub_test_wompi", "pk_test_stripe");
  });

  it("crea sesión de Wompi para moneda COP con URL de checkout", async () => {
    const res = await service.createCheckoutSession({
      clientId: "client-co-1",
      planId: "00000000-0000-7000-8000-000000000001",
      planCode: "starter",
      amountCents: 15000000,
      currency: "COP",
      customerEmail: "admin@empresa.co",
      executedBy: "user.checkout",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.gateway).toBe("wompi");
    expect(res.data.currency).toBe("COP");
    expect(res.data.amountCents).toBe(15000000);
    expect(res.data.invoiceId).toBe("inv-gen-123");
    if (res.data.gateway === "wompi") {
      expect(res.data.checkoutUrl).toContain("https://checkout.wompi.co/p/");
      expect(res.data.checkoutUrl).toContain("currency=COP");
    }

    expect(mockRepo.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-co-1",
        status: "issued",
        subtotalCents: 15000000,
        currency: "COP",
      }),
    );
  });

  it("crea sesión de Stripe para moneda USD con clientSecret", async () => {
    const res = await service.createCheckoutSession({
      clientId: "client-us-1",
      planId: "00000000-0000-7000-8000-000000000002",
      planCode: "pro",
      amountCents: 4900,
      currency: "USD",
      customerEmail: "admin@global.com",
      executedBy: "user.checkout",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.gateway).toBe("stripe");
    expect(res.data.currency).toBe("USD");
    expect(res.data.amountCents).toBe(4900);
    expect(res.data.invoiceId).toBe("inv-gen-123");
    if (res.data.gateway === "stripe") {
      expect(res.data.clientSecret).toBeDefined();
      expect(res.data.publishableKey).toBe("pk_test_stripe");
    }
  });

  it("filtra canales habilitados excluyendo Bre-B fuera de Colombia o en USD", async () => {
    (mockRepo.listPaymentGatewaysConfig as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "wompi",
        displayName: "Wompi",
        isEnabled: false,
        supportedCountries: ["CO"],
      },
      {
        id: "stripe",
        displayName: "Stripe",
        isEnabled: true,
        supportedCountries: ["*"],
      },
      {
        id: "bre_b",
        displayName: "Bre-B",
        isEnabled: true,
        supportedCountries: ["CO"],
        breBKeyType: "email",
        breBKeyValue: "cobros@mocter.co",
        breBRecipientName: "MOCTER SAS",
      },
    ]);

    const coCop = await service.listAvailableChannelsForTenant("CO", "COP");
    expect(coCop.ok).toBe(true);
    if (coCop.ok) {
      expect(coCop.data.map((c) => c.id)).toEqual(["stripe", "bre_b"]);
    }

    const mxCop = await service.listAvailableChannelsForTenant("MX", "COP");
    expect(mxCop.ok).toBe(true);
    if (mxCop.ok) {
      expect(mxCop.data.map((c) => c.id)).toEqual(["stripe"]);
    }

    const coUsd = await service.listAvailableChannelsForTenant("CO", "USD");
    expect(coUsd.ok).toBe(true);
    if (coUsd.ok) {
      expect(coUsd.data.map((c) => c.id)).toEqual(["stripe"]);
    }
  });

  it("crea sesión Bre-B con QR Dinámico exacto en COP para Colombia", async () => {
    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      displayName: "Bre-B",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "phone",
      breBKeyValue: "3001234567",
      breBRecipientName: "MOCTER SAS",
      breBQrPayloadTemplate: null,
    });
    (mockRepo.getClientBillingSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "client-co-1",
      country: "CO",
      currency: "COP",
    });

    const res = await service.createCheckoutSession({
      clientId: "client-co-1",
      planId: "00000000-0000-7000-8000-000000000001",
      planCode: "growth",
      amountCents: 19900000,
      currency: "COP",
      gateway: "bre_b",
      customerEmail: "owner@colombia.co",
      executedBy: "owner-1",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.gateway).toBe("bre_b");
    if (res.data.gateway === "bre_b") {
      expect(res.data.keyValue).toBe("3001234567");
      expect(res.data.qrSvgDataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
      expect(res.data.qrPayload).toContain("5406199000");
    }
  });

  it("rechaza GATEWAY_DISABLED si la pasarela está apagada", async () => {
    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "wompi",
      isEnabled: false,
    });

    const res = await service.createCheckoutSession({
      clientId: "client-co-1",
      planId: "00000000-0000-7000-8000-000000000001",
      planCode: "starter",
      amountCents: 15000000,
      currency: "COP",
      gateway: "wompi",
      customerEmail: "a@b.co",
      executedBy: "u1",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("GATEWAY_DISABLED");
    expect(mockRepo.createInvoice).not.toHaveBeenCalled();
  });

  it("rechaza BRE_B_COLOMBIA_ONLY sin crear factura si cliente es internacional o USD", async () => {
    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
    });

    const res = await service.createCheckoutSession({
      clientId: "client-us-1",
      planId: "00000000-0000-7000-8000-000000000001",
      planCode: "starter",
      amountCents: 4900,
      currency: "USD",
      gateway: "bre_b",
      country: "US",
      customerEmail: "a@us.com",
      executedBy: "u1",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BRE_B_COLOMBIA_ONLY");
    expect(mockRepo.createInvoice).not.toHaveBeenCalled();
  });

  it("bloquea nueva orden Bre-B con PENDING_BRE_B_REVIEW_EXISTS si ya hay reporte en revisión", async () => {
    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
    });
    (mockRepo.getPendingManualReportByClientId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rep-pending-1",
      status: "pending_review",
    });

    const res = await service.createCheckoutSession({
      clientId: "client-co-1",
      planId: "00000000-0000-7000-8000-000000000001",
      planCode: "starter",
      amountCents: 15000000,
      currency: "COP",
      gateway: "bre_b",
      country: "CO",
      customerEmail: "a@b.co",
      executedBy: "u1",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PENDING_BRE_B_REVIEW_EXISTS");
    expect(mockRepo.createInvoice).not.toHaveBeenCalled();
  });

  it("resuelve autoritativamente precio fijo en COP para CO y en USD para internacional (RN-SPEC-04-02)", async () => {
    (mockRepo.getPlanById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan-start-1",
      code: "custom-start",
      priceMonthlyCents: 12000000,
      priceAnnualCents: 120000000,
      priceMonthlyUsdCents: 3000,
      priceAnnualUsdCents: 30000,
      currency: "COP",
    });

    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "phone",
      breBKeyValue: "3208292559",
      breBRecipientName: "ALEJANDRO HERRERA",
    });
    (mockRepo.getClientBillingSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "client-co-1",
      country: "CO",
      currency: "COP",
    });

    // Cliente enviando erróneamente monto USD o currency USD desde CO: el dominio corrige a COP fijo
    const coRes = await service.createCheckoutSession({
      clientId: "client-co-1",
      planId: "plan-start-1",
      planCode: "custom-start",
      amountCents: 3000,
      currency: "USD",
      cycle: "monthly",
      gateway: "bre_b",
      customerEmail: "co@tenant.co",
      executedBy: "u-co",
    });

    expect(coRes.ok).toBe(true);
    if (coRes.ok && coRes.data.gateway === "bre_b") {
      expect(coRes.data.amountCents).toBe(12000000);
      expect(coRes.data.currency).toBe("COP");
      expect(coRes.data.qrPayload).toContain("5406120000");
    }

    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "stripe",
      isEnabled: true,
    });
    (mockRepo.getClientBillingSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "client-us-1",
      country: "US",
      currency: "USD",
    });

    const usRes = await service.createCheckoutSession({
      clientId: "client-us-1",
      planId: "plan-start-1",
      planCode: "custom-start",
      amountCents: 12000000,
      currency: "COP",
      cycle: "annual",
      gateway: "stripe",
      customerEmail: "us@tenant.com",
      executedBy: "u-us",
    });

    expect(usRes.ok).toBe(true);
    if (usRes.ok && usRes.data.gateway === "stripe") {
      expect(usRes.data.amountCents).toBe(30000);
      expect(usRes.data.currency).toBe("USD");
    }
  });
});

