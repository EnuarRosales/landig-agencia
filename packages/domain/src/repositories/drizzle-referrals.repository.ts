import { eq, and, sql, lt, gte, desc, asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  referralPrograms,
  referralCodes,
  referrals,
  referralRewards,
  referralRewardRedemptions,
  type ReferralProgram,
  type NewReferralProgram,
  type ReferralCode,
  type NewReferralCode,
  type Referral,
  type NewReferral,
  type ReferralReward,
  type NewReferralReward,
} from "../db/schemas/admin/referrals";
import { clients } from "../db/schemas/admin/clients";
import { clientBillingProfiles, invoices } from "../db/schemas/admin/billing";
import type {
  ClientFraudFingerprint,
  FefoRedemptionAllocation,
  IReferralsRepository,
  RedeemCreditsFefoResult,
  ReferralRedemptionWithInvoiceRow,
  ReferrerReferralItemRow,
} from "./referrals.repository.interface";

/**
 * Implementación Drizzle del repositorio para el Programa de Referidos (`REF-001`, `SPEC-16`).
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

  /**
   * Lista referidos paginados del referente junto con nombre comercial (para enmascaramiento)
   * y recompensa asociada (`SPEC-16`).
   */
  async listReferralsByReferrerPaginated(
    referrerClientId: string,
    params: { page: number; limit: number; status?: Referral["status"] },
  ): Promise<{ items: ReferrerReferralItemRow[]; total: number }> {
    const conditions = [eq(referrals.referrerClientId, referrerClientId)];
    if (params.status) {
      conditions.push(eq(referrals.status, params.status));
    }
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const countRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(referrals)
      .where(whereClause);
    const total = countRows[0]?.total ?? 0;

    const offset = Math.max(0, (params.page - 1) * params.limit);
    const rows = await this.db
      .select({
        id: referrals.id,
        referredClientId: referrals.referredClientId,
        referredDisplayName: clients.displayName,
        code: referrals.code,
        status: referrals.status,
        attributedAt: referrals.attributedAt,
        qualifiedAt: referrals.qualifiedAt,
        rejectedReason: referrals.rejectedReason,
        rewardAmountCents: referralRewards.amountCents,
        rewardCurrency: referralRewards.currency,
      })
      .from(referrals)
      .leftJoin(clients, eq(referrals.referredClientId, clients.id))
      .leftJoin(referralRewards, eq(referralRewards.referralId, referrals.id))
      .where(whereClause)
      .orderBy(desc(referrals.attributedAt))
      .limit(params.limit)
      .offset(offset);

    const items: ReferrerReferralItemRow[] = rows.map((row) => ({
      id: row.id,
      referredClientId: row.referredClientId,
      referredDisplayName: row.referredDisplayName ?? null,
      code: row.code,
      status: row.status as Referral["status"],
      attributedAt: row.attributedAt,
      qualifiedAt: row.qualifiedAt ?? null,
      rejectedReason: row.rejectedReason ?? null,
      rewardAmountCents: row.rewardAmountCents !== null && row.rewardAmountCents !== undefined
        ? Number(row.rewardAmountCents)
        : null,
      rewardCurrency: row.rewardCurrency ?? null,
    }));

    return { items, total };
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

  /**
   * Obtiene nombre comercial y documentos fiscales (`clients.tax_id` y `client_billing_profiles.dni`)
   * para validaciones antifraude (`SPEC-16 D-03`).
   */
  async getClientFraudFingerprint(clientId: string): Promise<ClientFraudFingerprint | null> {
    const rows = await this.db
      .select({
        clientId: clients.id,
        displayName: clients.displayName,
        taxId: clients.taxId,
        billingDni: clientBillingProfiles.dni,
      })
      .from(clients)
      .leftJoin(clientBillingProfiles, eq(clientBillingProfiles.clientId, clients.id))
      .where(eq(clients.id, clientId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      clientId: row.clientId,
      displayName: row.displayName,
      taxId: row.taxId ?? null,
      billingDni: row.billingDni ?? null,
    };
  }

  /**
   * Cuenta atribuciones recibidas por un referente desde un mismo hash de IP dentro de la ventana temporal.
   */
  async countReferralsByIpHash(
    referrerClientId: string,
    ipHash: string,
    since: Date,
  ): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerClientId, referrerClientId),
          eq(referrals.attributedIpHash, ipHash),
          gte(referrals.attributedAt, since),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /**
   * Verifica si la IP hasheada coincide con la atribución original del propio comercio referente.
   */
  async hasIpCollisionWithReferrer(referrerClientId: string, ipHash: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: referrals.id })
      .from(referrals)
      .where(
        and(
          eq(referrals.referredClientId, referrerClientId),
          eq(referrals.attributedIpHash, ipHash),
        ),
      )
      .limit(1);
    return rows.length > 0;
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
      .orderBy(asc(referralRewards.expiresAt)) as unknown as Promise<ReferralReward[]>;
  }

  /**
   * Lista todos los lotes de recompensas del inquilino ordenados por fecha de vencimiento y emisión.
   */
  async listRewardsByReferrer(referrerClientId: string): Promise<ReferralReward[]> {
    return this.db
      .select()
      .from(referralRewards)
      .where(eq(referralRewards.referrerClientId, referrerClientId))
      .orderBy(asc(referralRewards.expiresAt), desc(referralRewards.creditedAt)) as unknown as Promise<
      ReferralReward[]
    >;
  }

  /**
   * Lista el ledger de redenciones del inquilino enriquecido con número de factura SaaS (`SPEC-16 D-02`).
   */
  async listRedemptionsByReferrer(
    referrerClientId: string,
    limit = 50,
  ): Promise<ReferralRedemptionWithInvoiceRow[]> {
    const rows = await this.db
      .select({
        id: referralRewardRedemptions.id,
        rewardId: referralRewardRedemptions.rewardId,
        invoiceId: referralRewardRedemptions.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        amountCents: referralRewardRedemptions.amountCents,
        currency: referralRewardRedemptions.currency,
        redeemedAt: referralRewardRedemptions.redeemedAt,
      })
      .from(referralRewardRedemptions)
      .innerJoin(invoices, eq(referralRewardRedemptions.invoiceId, invoices.id))
      .where(eq(referralRewardRedemptions.clientId, referrerClientId))
      .orderBy(desc(referralRewardRedemptions.redeemedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      rewardId: row.rewardId,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      amountCents: Number(row.amountCents),
      currency: row.currency,
      redeemedAt: row.redeemedAt,
    }));
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
    const newRemaining = Math.max(0, Number(current.remainingCents) - amountCents);
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

  /**
   * Redime créditos disponibles en orden FEFO (`expires_at ASC`) para una factura de forma atómica e idempotente (`SPEC-16 D-02`).
   *
   * Si la factura ya posee movimientos registrados en `admin.referral_reward_redemptions`, retorna
   * idempotentemente el monto ya redimido sin volver a descontar saldo.
   */
  async redeemCreditsFefoForInvoice(params: {
    clientId: string;
    invoiceId: string;
    maxAmountCents: number;
    currency: "COP" | "USD";
    executedBy: string;
  }): Promise<RedeemCreditsFefoResult> {
    if (params.maxAmountCents <= 0) {
      return { totalRedeemedCents: 0, allocations: [], alreadyRedeemed: false };
    }

    return this.db.transaction(async (tx) => {
      const existingRedemptions = await tx
        .select()
        .from(referralRewardRedemptions)
        .where(eq(referralRewardRedemptions.invoiceId, params.invoiceId));

      if (existingRedemptions.length > 0) {
        const total = existingRedemptions.reduce((acc, r) => acc + Number(r.amountCents), 0);
        return {
          totalRedeemedCents: total,
          allocations: existingRedemptions.map((r) => ({
            rewardId: r.rewardId,
            amountCents: Number(r.amountCents),
            remainingCents: 0,
            status: "redeemed" as const,
          })),
          alreadyRedeemed: true,
        };
      }

      const available = (await tx
        .select()
        .from(referralRewards)
        .where(
          and(
            eq(referralRewards.referrerClientId, params.clientId),
            eq(referralRewards.currency, params.currency),
            sql`status IN ('available', 'partially_redeemed')`,
            sql`expires_at > now()`,
            sql`remaining_cents > 0`,
          ),
        )
        .orderBy(asc(referralRewards.expiresAt))) as unknown as ReferralReward[];

      let remainingToCover = params.maxAmountCents;
      let totalRedeemedCents = 0;
      const allocations: FefoRedemptionAllocation[] = [];
      const now = new Date();

      for (const reward of available) {
        if (remainingToCover <= 0) break;
        const availCents = Number(reward.remainingCents);
        if (availCents <= 0) continue;

        const toDeduct = Math.min(availCents, remainingToCover);
        const newRemaining = Math.max(0, availCents - toDeduct);
        const newStatus: ReferralReward["status"] =
          newRemaining === 0 ? "redeemed" : "partially_redeemed";

        await tx
          .update(referralRewards)
          .set({
            remainingCents: newRemaining,
            status: newStatus,
            appliedInvoiceId: params.invoiceId,
            redeemedAt: newRemaining === 0 ? now : reward.redeemedAt,
            updatedAt: now,
            updatedBy: params.executedBy,
          })
          .where(eq(referralRewards.id, reward.id));

        await tx
          .insert(referralRewardRedemptions)
          .values({
            rewardId: reward.id,
            invoiceId: params.invoiceId,
            clientId: params.clientId,
            amountCents: toDeduct,
            currency: params.currency,
            redeemedAt: now,
            createdBy: params.executedBy,
            updatedBy: params.executedBy,
          })
          .onConflictDoNothing();

        allocations.push({
          rewardId: reward.id,
          amountCents: toDeduct,
          remainingCents: newRemaining,
          status: newStatus,
        });
        totalRedeemedCents += toDeduct;
        remainingToCover -= toDeduct;
      }

      return {
        totalRedeemedCents,
        allocations,
        alreadyRedeemed: false,
      };
    });
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
