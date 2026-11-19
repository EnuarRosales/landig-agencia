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
      updateSubscriptionTrial: vi.fn(),
      listAllSubscriptions: vi.fn(),
      getBillingOverviewMetrics: vi.fn(),
      listAllInvoices: vi.fn(),
      listAllReceipts: vi.fn(),
      listPaymentGatewaysConfig: vi.fn(),
      getPaymentGatewayConfig: vi.fn(),
      upsertPaymentGatewayConfig: vi.fn(),
      getClientBillingSummary: vi.fn().mockResolvedValue({
        id: "client-abc",
        slug: "mi-empresa",
        displayName: "Mi Empresa SAS",
        contactEmail: "admin@miempresa.com",
        country: "CO",
        currency: "COP",
        planId: "plan-starter",
        locale: "es",
      }),
      getPlanById: vi.fn().mockResolvedValue({
        id: "plan-pro",
        code: "pro",
        name: { es: "Plan Pro", en: "Pro Plan" },
        trialDays: 14,
      } as never),
      upsertTrialSubscription: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: "sub-trial-1",
          clientId: input.clientId,
          planId: input.planId,
          status: "trialing",
          cycle: input.cycle,
          trialEndsAt: input.trialEndsAt,
        } as Subscription),
      ),
      setSubscriptionPendingUpgrade: vi.fn().mockImplementation((subId, planId, cycle) =>
        Promise.resolve({
          id: subId,
          clientId: "client-abc",
          planId: "plan-starter",
          status: "active",
          cycle: "monthly",
          pendingUpgradePlanId: planId,
          pendingUpgradeCycle: cycle,
        } as Subscription),
      ),
      getPendingManualReportByInvoiceId: vi.fn().mockResolvedValue(null),
      getPendingManualReportByClientId: vi.fn().mockResolvedValue(null),
      createManualPaymentReport: vi.fn().mockImplementation((rep) =>
        Promise.resolve({ id: "rep-1", ...rep }),
      ),
      getManualPaymentReportById: vi.fn().mockResolvedValue({
        id: "rep-1",
        clientId: "client-abc",
        clientName: "Mi Empresa SAS",
        clientEmail: "admin@miempresa.com",
        clientLocale: "es",
        planCode: "pro",
        planName: { es: "Plan Pro", en: "Pro Plan" },
        reportedAmountCents: 15000000,
      } as never),
      approveManualPaymentReportTransaction: vi.fn(),
      rejectManualPaymentReportTransaction: vi.fn(),
    };

    mockDispatcher = {
      dispatchPaymentSucceeded: vi.fn().mockResolvedValue({ dispatched: true }),
      dispatchBreBReviewResult: vi.fn().mockResolvedValue({ dispatched: true }),
    };

    const mockStorage = {
      putObject: vi.fn().mockResolvedValue({ ok: true }),
      getObject: vi.fn().mockResolvedValue({ ok: true, buffer: Buffer.from([]), contentType: "image/png" }),
    };

    service = new BillingService(mockRepo, mockDispatcher, undefined, mockStorage);
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

  it("SPEC-04 · exige configuración completa al activar canal bre_b y valida país CO", async () => {
    const missingKeys = await service.upsertPaymentGatewayConfig({
      id: "bre_b",
      isEnabled: true,
      environment: "production",
      actor: "platform_owner",
    });
    expect(missingKeys.ok).toBe(false);
    if (!missingKeys.ok) expect(missingKeys.code).toBe("BRE_B_NOT_CONFIGURED");

    const nonCo = await service.upsertPaymentGatewayConfig({
      id: "bre_b",
      isEnabled: true,
      environment: "production",
      supportedCountries: ["US"],
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
      actor: "platform_owner",
    });
    expect(nonCo.ok).toBe(false);
    if (!nonCo.ok) expect(nonCo.code).toBe("BRE_B_COLOMBIA_ONLY");
  });

  it("SPEC-04 · activa periodo de prueba de forma idempotente y evita reutilización", async () => {
    (mockRepo.getSubscriptionByClientId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const first = await service.activateTrialForTenant({
      clientId: "client-abc",
      planId: "plan-pro",
      executedBy: "owner-1",
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.status).toBe("trialing");
    }

    (mockRepo.getSubscriptionByClientId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "sub-expired-1",
      clientId: "client-abc",
      status: "expired",
      trialEndsAt: new Date(Date.now() - 86400000),
    } as Subscription);
    const reused = await service.activateTrialForTenant({
      clientId: "client-abc",
      planId: "plan-pro",
      executedBy: "owner-1",
    });
    expect(reused.ok).toBe(false);
    if (!reused.ok) expect(reused.code).toBe("TRIAL_ALREADY_USED");

    // Nunca concede un nuevo trial si existió suscripción previa vencida sin trialEndsAt
    (mockRepo.getSubscriptionByClientId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "sub-past-due-1",
      clientId: "client-abc",
      status: "past_due",
      trialEndsAt: null,
    } as Subscription);
    const pastDueRetry = await service.activateTrialForTenant({
      clientId: "client-abc",
      planId: "plan-pro",
      executedBy: "owner-1",
    });
    expect(pastDueRetry.ok).toBe(false);
    if (!pastDueRetry.ok) expect(pastDueRetry.code).toBe("TRIAL_ALREADY_USED");
  });

  it("SPEC-04 · nuevo inquilino con comprobante Bre-B inicia/mantiene trial sin bloquearse y sube a SeaweedFS", async () => {
    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
    });
    (mockRepo.getSubscriptionByClientId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await service.submitManualBreBReport({
      clientId: "client-abc",
      invoiceId: "inv-123",
      targetPlanId: "plan-pro",
      targetCycle: "monthly",
      operationKind: "new_subscription",
      paymentReference: "BREB-991",
      reportedAmountCents: 15000000,
      fileBuffer: pngBuffer,
      submittedByUserId: "user-1",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.subscription.status).toBe("trialing");
    expect(mockRepo.createManualPaymentReport).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_review",
        voucherMimeType: "image/png",
      }),
    );
  });

  it("SPEC-04 · inquilino antiguo en upgrade por Bre-B conserva plan actual hasta aprobación", async () => {
    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
    });
    (mockRepo.getSubscriptionByClientId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "sub-active-1",
      clientId: "client-abc",
      planId: "plan-starter",
      status: "active",
      cycle: "monthly",
    } as Subscription);

    const pdfBuffer = Buffer.from("%PDF-1.4\n...");
    const res = await service.submitManualBreBReport({
      clientId: "client-abc",
      invoiceId: "inv-123",
      targetPlanId: "plan-pro",
      targetCycle: "annual",
      operationKind: "upgrade",
      reportedAmountCents: 15000000,
      fileBuffer: pdfBuffer,
      submittedByUserId: "user-1",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.subscription.planId).toBe("plan-starter");
    expect(res.data.subscription.status).toBe("active");
    expect(res.data.subscription.pendingUpgradePlanId).toBe("plan-pro");
  });

  it("SPEC-04 · rechaza comprobante ejecutable o reporte duplicado y exige motivo >= 10 chars en revisión", async () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    const badFile = await service.submitManualBreBReport({
      clientId: "client-abc",
      invoiceId: "inv-123",
      targetPlanId: "plan-pro",
      targetCycle: "monthly",
      operationKind: "new_subscription",
      reportedAmountCents: 15000000,
      fileBuffer: exeBuffer,
      submittedByUserId: "user-1",
    });
    expect(badFile.ok).toBe(false);
    if (!badFile.ok) expect(badFile.code).toBe("INVALID_VOUCHER_FILE");

    (mockRepo.getPaymentGatewayConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bre_b",
      isEnabled: true,
      supportedCountries: ["CO"],
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
    });
    (mockRepo.getPendingManualReportByClientId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "rep-existing",
    });
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dup = await service.submitManualBreBReport({
      clientId: "client-abc",
      invoiceId: "inv-123",
      targetPlanId: "plan-pro",
      targetCycle: "monthly",
      operationKind: "renewal",
      reportedAmountCents: 15000000,
      fileBuffer: pngBuffer,
      submittedByUserId: "user-1",
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("PENDING_BRE_B_REVIEW_EXISTS");

    const shortReason = await service.reviewManualBreBReport({
      reportId: "rep-1",
      action: "reject",
      rejectionReason: "malo",
      reviewerUserId: "admin-1",
    });
    expect(shortReason.ok).toBe(false);
    if (!shortReason.ok) expect(shortReason.code).toBe("INVALID_REJECTION_REASON");
  });

  it("SPEC-04 · aprueba y rechaza reportes Bre-B atómicamente conservando plan base ante rechazo", async () => {
    (mockRepo.approveManualPaymentReportTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      report: { id: "rep-1", clientId: "client-abc", reportedAmountCents: 15000000, status: "approved" },
      payment: { id: "pay-breb-1" },
      receipt: { id: "rec-breb-1" },
      invoice: { id: "inv-123", status: "paid" },
      subscription: { id: "sub-1", planId: "plan-pro", status: "active" },
    });

    const approved = await service.reviewManualBreBReport({
      reportId: "rep-1",
      action: "approve",
      reviewerUserId: "admin-1",
    });
    expect(approved.ok).toBe(true);
    expect(mockDispatcher.dispatchBreBReviewResult).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approve", reportId: "rep-1" }),
    );

    (mockRepo.rejectManualPaymentReportTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      report: { id: "rep-1", clientId: "client-abc", reportedAmountCents: 15000000, status: "rejected" },
      subscription: { id: "sub-1", planId: "plan-starter", status: "active", pendingUpgradePlanId: null },
    });

    const rejected = await service.reviewManualBreBReport({
      reportId: "rep-1",
      action: "reject",
      rejectionReason: "El comprobante no corresponde al valor exacto en COP.",
      reviewerUserId: "admin-1",
    });
    expect(rejected.ok).toBe(true);
    if (rejected.ok) {
      expect(rejected.data.subscription.planId).toBe("plan-starter");
      expect(rejected.data.subscription.pendingUpgradePlanId).toBeNull();
    }
    expect(mockDispatcher.dispatchBreBReviewResult).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reject", reportId: "rep-1" }),
    );
  });

  it("SPEC-16 D-02/D-03 · al aprobar Bre-B consolida créditos FEFO y dispara qualifyReferral()", async () => {
    const mockReferrals = {
      redeemCreditsFefoForInvoice: vi.fn().mockResolvedValue({
        ok: true,
        data: { totalRedeemedCents: 5000000, allocations: [], alreadyRedeemed: false },
      }),
      qualifyReferral: vi.fn().mockResolvedValue({
        ok: true,
        data: { qualified: true },
      }),
    };

    const billingWithReferrals = new BillingService(
      mockRepo,
      mockDispatcher,
      undefined,
      undefined,
      undefined,
      mockReferrals,
    );

    (mockRepo.approveManualPaymentReportTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      report: { id: "rep-ref-1", clientId: "client-abc", reportedAmountCents: 10000000, status: "approved" },
      payment: { id: "pay-breb-ref" },
      receipt: { id: "rec-breb-ref" },
      invoice: { id: "inv-ref-1", status: "paid", subtotalCents: 15000000, creditCents: 5000000 },
      subscription: { id: "sub-1", planId: "plan-pro", status: "active" },
    });

    const approved = await billingWithReferrals.reviewManualBreBReport({
      reportId: "rep-ref-1",
      action: "approve",
      reviewerUserId: "admin-1",
    });

    expect(approved.ok).toBe(true);
    expect(mockReferrals.redeemCreditsFefoForInvoice).toHaveBeenCalledWith({
      clientId: "client-abc",
      invoiceId: "inv-ref-1",
      maxAmountCents: 5000000,
      currency: "COP",
      executedBy: "admin-1",
    });
    expect(mockReferrals.qualifyReferral).toHaveBeenCalledWith({
      referredClientId: "client-abc",
      firstInvoiceAmountCents: 15000000,
      currency: "COP",
      executedBy: "admin-1",
    });
  });
});
