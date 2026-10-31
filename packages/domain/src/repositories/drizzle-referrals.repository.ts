import { eq, and, sql, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  referralPrograms,
  referralCodes,
  referrals,
  referralRewards,
  type ReferralProgram,
  type NewReferralProgram,
  type ReferralCode,
  type NewReferralCode,
  type Referral,
  type NewReferral,
  type ReferralReward,
  type NewReferralReward,
} from "../db/schemas/admin/referrals";
import type { IReferralsRepository } from "./referrals.repository.interface";

/**
 * Implementación Drizzle del repositorio para el Programa de Referidos (REF-001).
 */
export class DrizzleReferralsRepository implements IReferralsRepository {
  constructor(private readonly db: PostgresJsDatabase<Record<string, unknown>>) {}

  async getActiveProgram(): Promise<ReferralProgram | null> {
    const rows = await this.db
      .select()
      .from(referralPrograms)
      .where(eq(referralPrograms.status, "active"));
    return (rows[0] as ReferralProgram) ?? null;
  }

  async saveProgram(program: NewReferralProgram): Promise<ReferralProgram> {
    const rows = await this.db.insert(referralPrograms).values(program).returning();
    return rows[0] as unknown as ReferralProgram;
  }

  async getCodeByClientId(clientId: string): Promise<ReferralCode | null> {
    const rows = await this.db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.clientId, clientId));
    return (rows[0] as ReferralCode) ?? null;
  }

  async getClientByCode(code: string): Promise<ReferralCode | null> {
    const rows = await this.db
      .select()
      .from(referralCodes)
      .where(and(eq(referralCodes.code, code.toUpperCase()), eq(referralCodes.status, "active")));
    return (rows[0] as ReferralCode) ?? null;
  }

  async createCode(code: NewReferralCode): Promise<ReferralCode> {
    const rows = await this.db.insert(referralCodes).values(code).returning();
    return rows[0] as unknown as ReferralCode;
  }

  async getReferralByReferredId(referredClientId: string): Promise<Referral | null> {
    const rows = await this.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredClientId, referredClientId));
    return (rows[0] as Referral) ?? null;
  }

  async createReferral(referral: NewReferral): Promise<Referral> {
    const rows = await this.db.insert(referrals).values(referral).returning();
    return rows[0] as unknown as Referral;
  }

  async updateReferralStatus(
    referralId: string,
    status: Referral["status"],
    qualifiedAt?: Date,
    rejectedReason?: string,
  ): Promise<Referral> {
    const rows = await this.db
      .update(referrals)
      .set({
        status,
        qualifiedAt: qualifiedAt ?? null,
        rejectedReason: rejectedReason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referralId))
      .returning();
    return rows[0] as unknown as Referral;
  }

  async countRewardedReferralsByReferrer(referrerClientId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerClientId, referrerClientId),
          eq(referrals.status, "rewarded"),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  async createReward(reward: NewReferralReward): Promise<ReferralReward> {
    const rows = await this.db.insert(referralRewards).values(reward).returning();
    return rows[0] as unknown as ReferralReward;
  }

  async getRewardByReferralId(referralId: string): Promise<ReferralReward | null> {
    const rows = await this.db
      .select()
      .from(referralRewards)
      .where(eq(referralRewards.referralId, referralId));
    return (rows[0] as ReferralReward) ?? null;
  }

  async listAvailableRewardsByReferrer(referrerClientId: string): Promise<ReferralReward[]> {
    return this.db
      .select()
      .from(referralRewards)
      .where(
        and(
          eq(referralRewards.referrerClientId, referrerClientId),
          sql`status IN ('available', 'partially_redeemed')`,
          sql`expires_at > now()`,
          sql`remaining_cents > 0`,
        ),
      )
      .orderBy(referralRewards.expiresAt) as unknown as Promise<ReferralReward[]>;
  }

  async deductRewardCredit(
    rewardId: string,
    amountCents: number,
    invoiceId: string,
  ): Promise<ReferralReward> {
    const existing = await this.db
      .select()
      .from(referralRewards)
      .where(eq(referralRewards.id, rewardId));

    const current = existing[0] as ReferralReward;
    const newRemaining = Math.max(0, current.remainingCents - amountCents);
    const newStatus = newRemaining === 0 ? "redeemed" : "partially_redeemed";

    const rows = await this.db
      .update(referralRewards)
      .set({
        remainingCents: newRemaining,
        status: newStatus,
        appliedInvoiceId: invoiceId,
        redeemedAt: newRemaining === 0 ? new Date() : current.redeemedAt,
        updatedAt: new Date(),
      })
      .where(eq(referralRewards.id, rewardId))
      .returning();

    return rows[0] as unknown as ReferralReward;
  }

  async expireOverdueRewards(): Promise<number> {
    const rows = await this.db
      .update(referralRewards)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(
        and(
          sql`status IN ('available', 'partially_redeemed')`,
          lt(referralRewards.expiresAt, new Date()),
        ),
      )
      .returning();
    return rows.length;
  }
}

