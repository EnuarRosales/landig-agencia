import { describe, expect, it, vi, beforeEach } from "vitest";
import { BillingService, type IBillingNotificationDispatcher } from "./billing.service";
import type { IBillingRepository } from "../repositories/billing.repository.interface";
import type {
  Invoice,
  Payment,
  PaymentReceipt,
  Subscription,
  ClientBillingProfile,
} from "../db/schemas/admin/billing";

describe("BILL-001 · BillingService", () => {
  let mockRepo: IBillingRepository;
  let mockDispatcher: IBillingNotificationDispatcher;
  let service: BillingService;

  const mockInvoice: Invoice = {
    id: "inv-123",
    clientId: "client-abc",
    invoiceNumber: "INV-2026-0001",
    status: "issued",
    subtotalCents: 15000000,
    taxCents: 0,
    creditCents: 0,
    appliedReferralCreditId: null,
    prorationCents: 0,
    totalCents: 15000000,
    currency: "COP",
    dueAt: new Date(),
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const mockPayment: Payment = {
    id: "pay-123",
    clientId: "client-abc",
    invoiceId: "inv-123",
    gateway: "wompi",
    gatewayReference: "trans_wompi_999",
    amountCents: 15000000,
    currency: "COP",
    status: "approved",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "webhook",
    updatedBy: "webhook",
  };

  const mockReceipt: PaymentReceipt = {
    id: "rec-123",
    paymentId: "pay-123",
    receiptNumber: "REC-2026-1001",
    pdfUrl: "/receipts/REC-2026-1001.pdf",
    emailedTo: null,
    emailedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "webhook",
    updatedBy: "webhook",
  };

  const mockProfile: ClientBillingProfile = {
    clientId: "client-abc",
    identityDocumentId: 6,
    dni: "901234567-1",
    companyName: "Mi Empresa SAS",
    email: "facturacion@miempresa.com",
    address: "Calle 100 # 15-20",
    cityCode: "11001",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin",
    updatedBy: "admin",
  };

  beforeEach(() => {
    mockRepo = {
      getBillingProfile: vi.fn().mockResolvedValue(mockProfile),
      upsertBillingProfile: vi.fn(),
      getPaymentMethods: vi.fn(),
      getDefaultPaymentMethod: vi.fn(),
      createPaymentMethod: vi.fn(),
      setDefaultPaymentMethod: vi.fn(),
      getSubscriptionByClientId: vi.fn().mockResolvedValue({
        id: "sub-1",
        clientId: "client-abc",
        status: "past_due",
      } as Subscription),
      createSubscription: vi.fn(),
      updateSubscriptionStatus: vi.fn(),
      getInvoiceById: vi.fn().mockResolvedValue(mockInvoice),
      getInvoiceByNumber: vi.fn(),
      listInvoicesByClientId: vi.fn(),
      createInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn().mockResolvedValue({ ...mockInvoice, status: "paid" }),
      getPaymentByGatewayReference: vi.fn().mockResolvedValue(null),
      createPayment: vi.fn().mockResolvedValue(mockPayment),
      createReceipt: vi.fn().mockResolvedValue(mockReceipt),
      getReceiptByPaymentId: vi.fn().mockResolvedValue(mockReceipt),
      updateReceiptEmailStatus: vi.fn().mockImplementation((id, emailedTo, emailedAt) =>
        Promise.resolve({ ...mockReceipt, id, emailedTo, emailedAt }),
      ),
      recordSubscriptionChange: vi.fn(),
    };

    mockDispatcher = {
      dispatchPaymentSucceeded: vi.fn().mockResolvedValue({ dispatched: true }),
    };

    service = new BillingService(mockRepo, mockDispatcher);
  });

  it("calcula prorrateo determinista por días restantes (charge - credit)", () => {
    const res = service.calculateProration({
      currentPriceCents: 100000,
      newPriceCents: 200000,
      cycleDays: 30,
      remainingDays: 15,
    });

    expect(res.creditCents).toBe(50000);
    expect(res.chargeCents).toBe(100000);
    expect(res.netCents).toBe(50000);
  });

  it("procesa pago exitosamente, emite recibo y despacha correo a través de NTF-001 (T-07)", async () => {
    const result = await service.registerPayment({
      clientId: "client-abc",
      invoiceId: "inv-123",
      gateway: "wompi",
      gatewayReference: "trans_wompi_999",
      amountCents: 15000000,
      currency: "COP",
      executedBy: "wompi.webhook",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.alreadyProcessed).toBe(false);
    expect(result.data.payment.id).toBe("pay-123");
    expect(result.data.receipt.receiptNumber).toBe("REC-2026-1001");
    expect(result.data.receipt.emailedTo).toBe("facturacion@miempresa.com");
    expect(result.data.receipt.emailedAt).toBeDefined();

    expect(mockDispatcher.dispatchPaymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantName: "Mi Empresa SAS",
        recipientEmail: "facturacion@miempresa.com",
        currency: "COP",
      }),
    );

    expect(mockRepo.updateReceiptEmailStatus).toHaveBeenCalledWith(
      "rec-123",
      "facturacion@miempresa.com",
      expect.any(Date),
    );
  });

  it("retorna idempotentemente sin duplicar si el pago ya fue registrado previamente", async () => {
    (mockRepo.getPaymentByGatewayReference as any).mockResolvedValue(mockPayment);

    const result = await service.registerPayment({
      clientId: "client-abc",
      invoiceId: "inv-123",
      gateway: "wompi",
      gatewayReference: "trans_wompi_999",
      amountCents: 15000000,
      currency: "COP",
      executedBy: "wompi.webhook",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.alreadyProcessed).toBe(true);
    expect(mockRepo.createPayment).not.toHaveBeenCalled();
    expect(mockRepo.createReceipt).not.toHaveBeenCalled();
    expect(mockDispatcher.dispatchPaymentSucceeded).not.toHaveBeenCalled();
  });
});
