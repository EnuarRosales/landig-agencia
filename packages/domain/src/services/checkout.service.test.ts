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
});

