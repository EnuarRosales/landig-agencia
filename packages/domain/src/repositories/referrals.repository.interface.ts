import type { Result } from "../types/result";
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
 * Contrato de repositorio para el programa de referidos (REF-001 RF-01 a RF-05).
 */
export interface IReferralsRepository {
  // Programs
  getActiveProgram(): Promise<ReferralProgram | null>;
  saveProgram(program: NewReferralProgram): Promise<ReferralProgram>;

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

  // Rewards
  createReward(reward: NewReferralReward): Promise<ReferralReward>;
  getRewardByReferralId(referralId: string): Promise<ReferralReward | null>;
  listAvailableRewardsByReferrer(referrerClientId: string): Promise<ReferralReward[]>;
  deductRewardCredit(
    rewardId: string,
    amountCents: number,
    invoiceId: string,
  ): Promise<ReferralReward>;
  expireOverdueRewards(): Promise<number>;
}

