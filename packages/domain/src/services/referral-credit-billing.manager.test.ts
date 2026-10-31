import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ReferralCreditBillingManager,
  type IReferralRewardsProvider,
} from "./referral-credit-billing.manager";
import type { IBillingRepository } from "../repositories/billing.repository.interface";
import type { Invoice, PaymentReceipt, Payment } from "../db/schemas/admin/billing";

describe("BILL-001 T-10 · ReferralCreditBillingManager", () => {
  let mockBillingRepo: IBillingRepository;
  let mockReferralProvider: IReferralRewardsProvider;
  let manager: ReferralCreditBillingManager;

  beforeEach(() => {
    mockBillingRepo = {
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
      createInvoice: vi.fn().mockImplementation((inv) => Promise.resolve({ ...inv, id: "inv-cred-100" })),
      updateInvoiceStatus: vi.fn(),
      getPaymentByGatewayReference: vi.fn(),
      createPayment: vi.fn().mockImplementation((pay) => Promise.resolve({ ...pay, id: "pay-symb-1" })),
      createReceipt: vi.fn().mockImplementation((rec) => Promise.resolve({ ...rec, id: "rec-symb-1" })),
      getReceiptByPaymentId: vi.fn(),
      recordSubscriptionChange: vi.fn(),
    };

    mockReferralProvider = {
      getAvailableCredits: vi.fn().mockResolvedValue([
        {
          id: "rew-1",
          remainingCents: 5000000, // 50.000 COP
          currency: "COP",
          expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
        },
      ]),
      deductCredit: vi.fn().mockResolvedValue(undefined),
    };

    manager = new ReferralCreditBillingManager(mockBillingRepo, mockReferralProvider);
  });

  it("aplica descuento parcial de créditos y emite factura en estado 'issued' para saldo remanente", async () => {
    const res = await manager.issueInvoiceWithCredits({
      clientId: "client-ref-1",
      subtotalCents: 15000000, // 150.000 COP
      currency: "COP",
      executedBy: "billing.cycle",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.creditsAppliedCents).toBe(5000000);
    expect(res.data.appliedCreditId).toBe("rew-1");
    expect(res.data.paidWithoutGateway).toBe(false);
    expect(res.data.invoice.status).toBe("issued");
    expect(res.data.invoice.totalCents).toBe(10000000); // 100.000 COP a pagar

    expect(mockReferralProvider.deductCredit).toHaveBeenCalledWith(
      "rew-1",
      5000000,
      "inv-cred-100",
    );
  });

  it("cubre el 100% con créditos de referidos marcando factura 'paid' y emitiendo recibo sin pasarela", async () => {
    (mockReferralProvider.getAvailableCredits as any).mockResolvedValue([
      {
        id: "rew-big",
        remainingCents: 20000000, // 200.000 COP
        currency: "COP",
        expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      },
    ]);

    const res = await manager.issueInvoiceWithCredits({
      clientId: "client-ref-2",
      subtotalCents: 15000000, // 150.000 COP
      currency: "COP",
      executedBy: "billing.cycle",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.creditsAppliedCents).toBe(15000000);
    expect(res.data.paidWithoutGateway).toBe(true);
    expect(res.data.invoice.status).toBe("paid");
    expect(res.data.invoice.totalCents).toBe(0);
    expect(res.data.receipt).toBeDefined();

    expect(mockBillingRepo.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayReference: "credit_inv-cred-100",
        amountCents: 0,
        status: "approved",
      }),
    );
  });
});

