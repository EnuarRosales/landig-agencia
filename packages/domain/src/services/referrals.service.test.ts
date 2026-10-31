import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReferralsService } from "./referrals.service";
import type { IReferralsRepository } from "../repositories/referrals.repository.interface";
import type { ReferralProgram, ReferralCode, Referral, ReferralReward } from "../db/schemas/admin/referrals";

describe("REF-001 · ReferralsService", () => {
  let mockRepo: IReferralsRepository;
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
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin",
    updatedBy: "admin",
  };

  beforeEach(() => {
    mockRepo = {
      getActiveProgram: vi.fn().mockResolvedValue(mockProgram),
      saveProgram: vi.fn(),
      getCodeByClientId: vi.fn().mockResolvedValue(mockCode),
      getClientByCode: vi.fn().mockResolvedValue(mockCode),
      createCode: vi.fn(),
      getReferralByReferredId: vi.fn().mockResolvedValue(mockReferral),
      createReferral: vi.fn().mockImplementation((r) => Promise.resolve({ ...r, id: "ref-new" })),
      updateReferralStatus: vi.fn().mockImplementation((id, status) =>
        Promise.resolve({ ...mockReferral, id, status }),
      ),
      countRewardedReferralsByReferrer: vi.fn().mockResolvedValue(2),
      createReward: vi.fn().mockImplementation((rew) => Promise.resolve({ ...rew, id: "rew-new" })),
      getRewardByReferralId: vi.fn(),
      listAvailableRewardsByReferrer: vi.fn(),
      deductRewardCredit: vi.fn(),
      expireOverdueRewards: vi.fn(),
    };
    service = new ReferralsService(mockRepo);
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
});

