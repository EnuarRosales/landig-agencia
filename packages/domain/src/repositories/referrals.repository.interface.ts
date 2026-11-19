import type {
  ReferralProgram,
  NewReferralProgram,
  ReferralCode,
  NewReferralCode,
  Referral,
  NewReferral,
  ReferralReward,
  NewReferralReward,
} from "../db/schemas/admin/referrals";

/**
 * Fila enriquecida de referido para el panel del inquilino referente (SPEC-16).
 */
export interface ReferrerReferralItemRow {
  id: string;
  referredClientId: string;
  referredDisplayName: string | null;
  code: string;
  status: Referral["status"];
  attributedAt: Date;
  qualifiedAt: Date | null;
  rejectedReason: string | null;
  rewardAmountCents: number | null;
  rewardCurrency: string | null;
}

/**
 * Movimiento del ledger de redenciones de créditos vinculado a su factura SaaS (SPEC-16 D-02).
 */
export interface ReferralRedemptionWithInvoiceRow {
  id: string;
  rewardId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  redeemedAt: Date;
}

/**
 * Huella fiscal y de nombre comercial de un comercio para validaciones antifraude y notificaciones (SPEC-16 D-03).
 */
export interface ClientFraudFingerprint {
  clientId: string;
  displayName: string;
  taxId: string | null;
  billingDni: string | null;
}

/**
 * Detalle individual de una deducción FEFO aplicada sobre un lote de recompensa.
 */
export interface FefoRedemptionAllocation {
  rewardId: string;
  amountCents: number;
  remainingCents: number;
  status: ReferralReward["status"];
}

/**
 * Resultado consolidado de la redención FEFO idempotente para una factura.
 */
export interface RedeemCreditsFefoResult {
  totalRedeemedCents: number;
  allocations: FefoRedemptionAllocation[];
  alreadyRedeemed: boolean;
}

/**
 * Contrato de repositorio para el programa de referidos (`REF-001`, `SPEC-16`).
 */
export interface IReferralsRepository {
  // Programs
  getActiveProgram(): Promise<ReferralProgram | null>;
  getProgram(): Promise<ReferralProgram | null>;
  saveProgram(program: NewReferralProgram): Promise<ReferralProgram>;
  updateProgram(id: string, updates: Partial<NewReferralProgram>): Promise<ReferralProgram>;
  getProgramMetrics(): Promise<{
    totalReferrals: number;
    pendingCount: number;
    qualifiedCount: number;
    rewardedCount: number;
    rejectedCount: number;
    totalRewardsIssuedCents: number;
    totalCreditsRedeemedCents: number;
    totalCreditsAvailableCents: number;
  }>;

  // Referral Codes
  getCodeByClientId(clientId: string): Promise<ReferralCode | null>;
  getClientByCode(code: string): Promise<ReferralCode | null>;
  createCode(code: NewReferralCode): Promise<ReferralCode>;

  // Referrals
  getReferralByReferredId(referredClientId: string): Promise<Referral | null>;
  createReferral(referral: NewReferral): Promise<Referral>;
  updateReferralStatus(
    referralId: string,
    status: Referral["status"],
    qualifiedAt?: Date,
    rejectedReason?: string,
  ): Promise<Referral>;
  countRewardedReferralsByReferrer(referrerClientId: string): Promise<number>;
  listReferralsByReferrer(referrerClientId: string): Promise<Referral[]>;
  listReferralsByReferrerPaginated?(
    referrerClientId: string,
    params: { page: number; limit: number; status?: Referral["status"] },
  ): Promise<{ items: ReferrerReferralItemRow[]; total: number }>;
  getReferrerMetrics(referrerClientId: string): Promise<{
    totalReferred: number;
    pendingCount: number;
    rewardedCount: number;
    totalEarnedCents: number;
    availableCreditCents: number;
  }>;

  // Antifraude
  getClientFraudFingerprint?(clientId: string): Promise<ClientFraudFingerprint | null>;
  countReferralsByIpHash?(
    referrerClientId: string,
    ipHash: string,
    since: Date,
  ): Promise<number>;
  hasIpCollisionWithReferrer?(
    referrerClientId: string,
    ipHash: string,
  ): Promise<boolean>;

  // Rewards & Redemptions
  createReward(reward: NewReferralReward): Promise<ReferralReward>;
  getRewardByReferralId(referralId: string): Promise<ReferralReward | null>;
  listAvailableRewardsByReferrer(referrerClientId: string): Promise<ReferralReward[]>;
  listRewardsByReferrer?(referrerClientId: string): Promise<ReferralReward[]>;
  listRedemptionsByReferrer?(
    referrerClientId: string,
    limit?: number,
  ): Promise<ReferralRedemptionWithInvoiceRow[]>;
  deductRewardCredit(
    rewardId: string,
    amountCents: number,
    invoiceId: string,
  ): Promise<ReferralReward>;
  redeemCreditsFefoForInvoice?(params: {
    clientId: string;
    invoiceId: string;
    maxAmountCents: number;
    currency: "COP" | "USD";
    executedBy: string;
  }): Promise<RedeemCreditsFefoResult>;
  expireOverdueRewards(): Promise<number>;
}
