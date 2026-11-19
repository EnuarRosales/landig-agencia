import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ReferralsService,
  maskBusinessName,
  hashReferralIp,
  type IReferralsNotificationDispatcher,
} from "./referrals.service";
import type { IReferralsRepository } from "../repositories/referrals.repository.interface";
import type { ReferralProgram, ReferralCode, Referral } from "../db/schemas/admin/referrals";

describe("REF-001 / SPEC-16 · ReferralsService", () => {
  let mockRepo: IReferralsRepository;
  let mockNotifier: IReferralsNotificationDispatcher;
  let service: ReferralsService;

  const mockProgram: ReferralProgram = {
    id: "prog-1",
    name: "Programa General 2026",
    model: "credit",
    rewardType: "fixed",
    rewardValue: 5000000, // 50.000 COP
    currency: "COP",
    trigger: "first_paid_invoice",
    attributionDays: 60,
    capReferralsPerReferrer: 10,
    creditValidityDays: 365,
    startsAt: null,
    endsAt: null,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin",
    updatedBy: "admin",
  };

  const mockCode: ReferralCode = {
    id: "code-1",
    clientId: "referrer-100",
    code: "ALFA100",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin",
    updatedBy: "admin",
  };

  const mockReferral: Referral = {
    id: "ref-999",
    programId: "prog-1",
    referrerClientId: "referrer-100",
    referredClientId: "referred-200",
    code: "ALFA100",
    status: "pending",
    attributedAt: new Date(),
    qualifiedAt: null,
    rejectedReason: null,
    attributedIpHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin",
    updatedBy: "admin",
  };

  beforeEach(() => {
    mockRepo = {
      getActiveProgram: vi.fn().mockResolvedValue(mockProgram),
      getProgram: vi.fn().mockResolvedValue(mockProgram),
      saveProgram: vi.fn(),
      updateProgram: vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...mockProgram, ...updates, id }),
      ),
      getProgramMetrics: vi.fn().mockResolvedValue({
        totalReferrals: 12,
        pendingCount: 4,
        qualifiedCount: 2,
        rewardedCount: 5,
        rejectedCount: 1,
        totalRewardsIssuedCents: 25000000,
        totalCreditsRedeemedCents: 15000000,
        totalCreditsAvailableCents: 10000000,
      }),
      getCodeByClientId: vi.fn().mockResolvedValue(mockCode),
      getClientByCode: vi.fn().mockResolvedValue(mockCode),
      createCode: vi.fn(),
      getReferralByReferredId: vi.fn().mockResolvedValue(mockReferral),
      createReferral: vi.fn().mockImplementation((r) => Promise.resolve({ ...r, id: "ref-new" })),
      updateReferralStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve({ ...mockReferral, id, status }),
      ),
      countRewardedReferralsByReferrer: vi.fn().mockResolvedValue(2),
      listReferralsByReferrer: vi.fn().mockResolvedValue([mockReferral]),
      getReferrerMetrics: vi.fn().mockResolvedValue({
        totalReferred: 3,
        pendingCount: 1,
        rewardedCount: 2,
        totalEarnedCents: 10000000,
        availableCreditCents: 5000000,
      }),
      createReward: vi.fn().mockImplementation((rew) => Promise.resolve({ ...rew, id: "rew-new" })),
      getRewardByReferralId: vi.fn(),
      listAvailableRewardsByReferrer: vi.fn().mockResolvedValue([]),
      listRewardsByReferrer: vi.fn().mockResolvedValue([]),
      listRedemptionsByReferrer: vi.fn().mockResolvedValue([]),
      listReferralsByReferrerPaginated: vi.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: "ref-999",
            referredClientId: "referred-200",
            referredDisplayName: "Tienda Beta",
            code: "ALFA100",
            status: "pending",
            attributedAt: mockReferral.attributedAt,
            qualifiedAt: null,
            rejectedReason: null,
            rewardAmountCents: null,
            rewardCurrency: null,
          },
        ],
      }),
      getClientFraudFingerprint: vi.fn().mockResolvedValue(null),
      countReferralsByIpHash: vi.fn().mockResolvedValue(0),
      hasIpCollisionWithReferrer: vi.fn().mockResolvedValue(false),
      deductRewardCredit: vi.fn(),
      expireOverdueRewards: vi.fn(),
    };
    mockNotifier = {
      dispatchReferralRegistered: vi.fn().mockResolvedValue(undefined),
      dispatchReferralRewardCredited: vi.fn().mockResolvedValue(undefined),
    };
    service = new ReferralsService(mockRepo, mockNotifier);
  });

  it("rechaza autorreferencia directa (SELF_REFERRAL_DISALLOWED)", async () => {
    (mockRepo.getReferralByReferredId as any).mockResolvedValue(null);

    const res = await service.attributeReferral({
      referredClientId: "referrer-100", // Mismo ID
      code: "ALFA100",
      executedBy: "onboarding",
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("SELF_REFERRAL_DISALLOWED");
  });

  it("atribuye exitosamente un referido con código válido dentro de la ventana", async () => {
    (mockRepo.getReferralByReferredId as any).mockResolvedValue(null);

    const res = await service.attributeReferral({
      referredClientId: "referred-brand-new",
      code: "ALFA100",
      executedBy: "onboarding",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.referrerClientId).toBe("referrer-100");
    expect(res.data.referredClientId).toBe("referred-brand-new");
    expect(res.data.status).toBe("pending");
  });

  it("califica al referido tras su primer pago y emite crédito de 365 días para el referente", async () => {
    const res = await service.qualifyReferral({
      referredClientId: "referred-200",
      firstInvoiceAmountCents: 15000000,
      currency: "COP",
      executedBy: "wompi.webhook",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.qualified).toBe(true);
    expect(res.data.referral.status).toBe("rewarded");
    expect(res.data.reward).toBeDefined();
    expect(res.data.reward!.amountCents).toBe(5000000); // 50.000 COP
    expect(res.data.reward!.remainingCents).toBe(5000000);
    expect(res.data.reward!.currency).toBe("COP");
    expect(res.data.reward!.status).toBe("available");

    // Verificar expiración a 365 días
    const diffDays =
      (res.data.reward!.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(365);
  });

  describe("T-06 · Gestión del Programa y Toggle (RF-06.1)", () => {
    it("permite a platform_owner y platform_admin actualizar y pausar el programa", async () => {
      const res = await service.updateProgramSettings({
        programId: "prog-1",
        status: "paused",
        rewardType: "percent",
        rewardValue: 25,
        attributionDays: 45,
        capReferralsPerReferrer: 5,
        creditValidityDays: 180,
        userRole: "platform_admin",
        executedBy: "admin@mocter.co",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.status).toBe("paused");
      expect(res.data.rewardType).toBe("percent");
      expect(res.data.rewardValue).toBe(25);
      expect(res.data.attributionDays).toBe(45);
      expect(res.data.capReferralsPerReferrer).toBe(5);
      expect(res.data.creditValidityDays).toBe(180);
    });

    it("rechaza modificaciones si el rol es platform_sales (FORBIDDEN_INSUFFICIENT_PERMISSIONS)", async () => {
      const res = await service.updateProgramSettings({
        programId: "prog-1",
        status: "paused",
        userRole: "platform_sales",
        executedBy: "sales@mocter.co",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("FORBIDDEN_INSUFFICIENT_PERMISSIONS");
    });

    it("valida valores comerciales y rechaza valores inválidos", async () => {
      const res = await service.updateProgramSettings({
        programId: "prog-1",
        rewardValue: -10,
        userRole: "platform_owner",
        executedBy: "owner@mocter.co",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("INVALID_REWARD_VALUE");
    });

    it("retorna métricas agregadas del programa de referidos para el backoffice", async () => {
      const res = await service.getDashboardMetrics();
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.totalReferrals).toBe(12);
      expect(res.data.pendingCount).toBe(4);
      expect(res.data.totalRewardsIssuedCents).toBe(25000000);
      expect(res.data.totalCreditsAvailableCents).toBe(10000000);
    });
  });

  describe("T-07 · Panel del Referente y Métricas (RF-05.1)", () => {
    it("obtiene el enlace de invitación, métricas y lista de referidos del inquilino", async () => {
      const res = await service.getReferrerPanel("referrer-100", "ALFA", "https://app.mocter.co");

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.code).toBe("ALFA100");
      expect(res.data.referralLink).toBe("https://app.mocter.co/r/ALFA100");
      expect(res.data.metrics.totalReferred).toBe(3);
      expect(res.data.metrics.rewardedCount).toBe(2);
      expect(res.data.metrics.totalEarnedCents).toBe(10000000);
      expect(res.data.metrics.availableCreditCents).toBe(5000000);
      expect(res.data.referrals.length).toBe(1);
    });
  });

  describe("SPEC-16 · Enmascaramiento, Overview Inquilino, Antifraude y Moneda", () => {
    it("enmascara nombres comerciales sin exponer datos completos", () => {
      expect(maskBusinessName("Café Andes")).toBe("Café An***");
      expect(maskBusinessName("Tienda Beta")).toBe("Tienda Be***");
      expect(maskBusinessName("Acme")).toBe("Ac***");
      expect(maskBusinessName("")).toBe("Comercio ***");
    });

    it("retorna overview completo con enlace /r/{code}, QR SVG y nombres enmascarados", async () => {
      const res = await service.getTenantReferralsOverview(
        "referrer-100",
        "cafe-andes",
        "https://mocter.co/",
        { page: 1, limit: 20 },
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.code).toBe("ALFA100");
      expect(res.data.referralLink).toBe("https://mocter.co/r/ALFA100");
      expect(res.data.qrSvgDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(res.data.referrals.items[0]?.referredBusinessMasked).toBe("Tienda Be***");
      expect(res.data.metrics.availableCreditCents).toBe(5000000);
    });

    it("cuando el programa está pausado no crea código nuevo pero conserva saldo vigente visible", async () => {
      (mockRepo.getProgram as any).mockResolvedValue({ ...mockProgram, status: "paused" });
      (mockRepo.getCodeByClientId as any).mockResolvedValue(null);

      const res = await service.getTenantReferralsOverview(
        "referrer-100",
        "cafe-andes",
        "https://mocter.co",
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(mockRepo.createCode).not.toHaveBeenCalled();
      expect(res.data.code).toBeNull();
      expect(res.data.program?.status).toBe("paused");
      expect(res.data.metrics.availableCreditCents).toBe(5000000);
    });

    it("rechaza antifraude en calificación si referente y referido comparten NIT/DNI", async () => {
      (mockRepo.getClientFraudFingerprint as any).mockImplementation(async (id: string) => {
        if (id === "referrer-100") {
          return { clientId: id, displayName: "Café Andes", taxId: "900.111.222-1", billingDni: null };
        }
        return { clientId: id, displayName: "Café Sur", taxId: null, billingDni: "9001112221" };
      });

      const res = await service.qualifyReferral({
        referredClientId: "referred-200",
        firstInvoiceAmountCents: 15000000,
        currency: "COP",
        executedBy: "breb.approve",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.qualified).toBe(false);
      expect(res.data.referral.status).toBe("rejected");
      expect(mockRepo.createReward).not.toHaveBeenCalled();
    });

    it("emite recompensa fija siempre en program.currency (COP) aunque el referido pague en USD", async () => {
      const res = await service.qualifyReferral({
        referredClientId: "referred-200",
        firstInvoiceAmountCents: 4900, // $49 USD
        currency: "USD",
        executedBy: "stripe.webhook",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.reward?.amountCents).toBe(5000000);
      expect(res.data.reward?.currency).toBe("COP");
      expect(mockNotifier.dispatchReferralRewardCredited).toHaveBeenCalledTimes(1);
    });

    it("bloquea abuso desde la misma IP hasheada HMAC y registra referido como rejected", async () => {
      (mockRepo.getReferralByReferredId as any).mockResolvedValue(null);
      (mockRepo.countReferralsByIpHash as any).mockResolvedValue(3);

      const res = await service.attributeReferral({
        referredClientId: "referred-ip-abuse",
        code: "ALFA100",
        ipAddress: "203.0.113.10",
        executedBy: "onboarding",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("FRAUD_IP_ABUSE");
      expect(mockRepo.createReferral).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rejected",
          attributedIpHash: hashReferralIp("203.0.113.10"),
        }),
      );
    });
  });
});

