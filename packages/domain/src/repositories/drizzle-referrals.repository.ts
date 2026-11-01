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

  async getProgram(): Promise<ReferralProgram | null> {
    const rows = await this.db
      .select()
      .from(referralPrograms)
      .orderBy(sql`created_at DESC`)
      .limit(1);
    return (rows[0] as ReferralProgram) ?? null;
  }

  async saveProgram(program: NewReferralProgram): Promise<ReferralProgram> {
    const rows = await this.db.insert(referralPrograms).values(program).returning();
    return rows[0] as unknown as ReferralProgram;
  }

  async updateProgram(id: string, updates: Partial<NewReferralProgram>): Promise<ReferralProgram> {
    const rows = await this.db
      .update(referralPrograms)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(referralPrograms.id, id))
      .returning();
    return rows[0] as unknown as ReferralProgram;
  }

  async getProgramMetrics(): Promise<{
    totalReferrals: number;
    pendingCount: number;
    qualifiedCount: number;
    rewardedCount: number;
    rejectedCount: number;
    totalRewardsIssuedCents: number;
    totalCreditsRedeemedCents: number;
    totalCreditsAvailableCents: number;
  }> {
    const refCounts = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        qualified: sql<number>`count(*) filter (where status = 'qualified')::int`,
        rewarded: sql<number>`count(*) filter (where status = 'rewarded')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      })
      .from(referrals);

    const rewSums = await this.db
      .select({
        totalIssued: sql<number>`coalesce(sum(amount_cents), 0)::bigint`,
        totalAvailable: sql<number>`coalesce(sum(remaining_cents) filter (where status in ('available', 'partially_redeemed')), 0)::bigint`,
      })
      .from(referralRewards);

    const totalIssued = Number(rewSums[0]?.totalIssued ?? 0);
    const totalAvailable = Number(rewSums[0]?.totalAvailable ?? 0);
    const totalRedeemed = Math.max(0, totalIssued - totalAvailable);

    return {
      totalReferrals: refCounts[0]?.total ?? 0,
      pendingCount: refCounts[0]?.pending ?? 0,
      qualifiedCount: refCounts[0]?.qualified ?? 0,
      rewardedCount: refCounts[0]?.rewarded ?? 0,
      rejectedCount: refCounts[0]?.rejected ?? 0,
      totalRewardsIssuedCents: totalIssued,
      totalCreditsRedeemedCents: totalRedeemed,
      totalCreditsAvailableCents: totalAvailable,
    };
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

  async listReferralsByReferrer(referrerClientId: string): Promise<Referral[]> {
    return this.db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerClientId, referrerClientId))
      .orderBy(sql`attributed_at DESC`) as unknown as Promise<Referral[]>;
  }

  async getReferrerMetrics(referrerClientId: string): Promise<{
    totalReferred: number;
    pendingCount: number;
    rewardedCount: number;
    totalEarnedCents: number;
    availableCreditCents: number;
  }> {
    const refStats = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        rewarded: sql<number>`count(*) filter (where status = 'rewarded')::int`,
      })
      .from(referrals)
      .where(eq(referrals.referrerClientId, referrerClientId));

    const rewStats = await this.db
      .select({
        earned: sql<number>`coalesce(sum(amount_cents), 0)::bigint`,
        available: sql<number>`coalesce(sum(remaining_cents) filter (where status in ('available', 'partially_redeemed') and expires_at > now()), 0)::bigint`,
      })
      .from(referralRewards)
      .where(eq(referralRewards.referrerClientId, referrerClientId));

    return {
      totalReferred: refStats[0]?.total ?? 0,
      pendingCount: refStats[0]?.pending ?? 0,
      rewardedCount: refStats[0]?.rewarded ?? 0,
      totalEarnedCents: Number(rewStats[0]?.earned ?? 0),
      availableCreditCents: Number(rewStats[0]?.available ?? 0),
    };
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

