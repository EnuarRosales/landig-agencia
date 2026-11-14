import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { subscriptions } from "../db/schemas/admin/billing";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { env } from "../utils/env";
import {
  getTransactionalNotificationsService,
  type TransactionalNotificationsAndLeadsService,
} from "./notifications-and-leads.service";

const MS_PER_DAY = 86_400_000;

export interface DueSubscriptionReminderCandidate {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientLocale: string;
  planName: string;
  status: string;
  expiresAt: Date;
  d5ReminderSentAt: Date | null;
  d0ReminderSentAt: Date | null;
}

export interface IBillingRemindersRepository {
  listCandidateSubscriptions(): Promise<DueSubscriptionReminderCandidate[]>;
  markD5ReminderSent(subscriptionId: string, sentAt: Date): Promise<void>;
  markD0ReminderAndExpire(
    subscriptionId: string,
    sentAt: Date,
    nextStatus?: "expired" | "past_due",
  ): Promise<void>;
}

export class DrizzleBillingRemindersRepository implements IBillingRemindersRepository {
  async listCandidateSubscriptions(): Promise<DueSubscriptionReminderCandidate[]> {
    const db = getDb();
    const rows = await db
      .select({
        subscriptionId: subscriptions.id,
        clientId: subscriptions.clientId,
        clientName: clients.displayName,
        clientEmail: clients.contactEmail,
        clientLocale: clients.locale,
        planCode: plans.code,
        planNameJson: plans.name,
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        d5ReminderSentAt: subscriptions.d5ReminderSentAt,
        d0ReminderSentAt: subscriptions.d0ReminderSentAt,
      })
      .from(subscriptions)
      .innerJoin(clients, eq(subscriptions.clientId, clients.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(inArray(subscriptions.status, ["trialing", "active"]));

    return rows.map((r) => {
      const expiresAt =
        r.status === "trialing" && r.trialEndsAt ? r.trialEndsAt : r.currentPeriodEnd;
      const loc = r.clientLocale === "en" ? "en" : "es";
      const planName =
        typeof r.planNameJson === "object" && r.planNameJson !== null
          ? r.planNameJson[loc] || r.planNameJson.es || r.planNameJson.en || r.planCode
          : r.planCode;

      return {
        subscriptionId: r.subscriptionId,
        clientId: r.clientId,
        clientName: r.clientName,
        clientEmail: r.clientEmail,
        clientLocale: loc,
        planName,
        status: r.status,
        expiresAt,
        d5ReminderSentAt: r.d5ReminderSentAt,
        d0ReminderSentAt: r.d0ReminderSentAt,
      };
    });
  }

  async markD5ReminderSent(subscriptionId: string, sentAt: Date): Promise<void> {
    const db = getDb();
    await db
      .update(subscriptions)
      .set({
        d5ReminderSentAt: sentAt,
        updatedAt: sentAt,
        updatedBy: "system.billing_reminders",
      })
      .where(eq(subscriptions.id, subscriptionId));
  }

  async markD0ReminderAndExpire(
    subscriptionId: string,
    sentAt: Date,
    nextStatus?: "expired" | "past_due",
  ): Promise<void> {
    const db = getDb();
    await db
      .update(subscriptions)
      .set({
        d0ReminderSentAt: sentAt,
        ...(nextStatus ? { status: nextStatus } : {}),
        updatedAt: sentAt,
        updatedBy: "system.billing_reminders",
      })
      .where(eq(subscriptions.id, subscriptionId));
  }
}

export interface BillingRemindersDispatchSummary {
  evaluatedCount: number;
  d5SentCount: number;
  d0SentCount: number;
  expiredTransitionCount: number;
  skippedCount: number;
  errors: Array<{ subscriptionId: string; error: string }>;
}

/**
 * Servicio idempotente de recordatorios preventivos (`D-5`) y de vencimiento (`D-0`)
 * para periodos de prueba y ciclos activos de suscripción (`SPEC-04 T-04`, `RN-SPEC-04-08`).
 */
export class BillingRemindersService {
  constructor(
    private readonly repository: IBillingRemindersRepository = new DrizzleBillingRemindersRepository(),
    private readonly notifications: Pick<
      TransactionalNotificationsAndLeadsService,
      "enqueueEmail"
    > = getTransactionalNotificationsService(),
  ) {}

  /**
   * Calcula los días calendario UTC restantes hasta `expiresAt` tomando `referenceDate`.
   */
  static computeDaysRemaining(expiresAt: Date, referenceDate: Date): number {
    const diffMs = expiresAt.getTime() - referenceDate.getTime();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / MS_PER_DAY);
  }

  /**
   * Evalúa suscripciones activas o en trial y despacha notificaciones `D-5` o `D-0` una única vez por ciclo.
   */
  async dispatchDueReminders(options?: {
    referenceDate?: Date;
    billingBaseUrl?: string;
  }): Promise<Result<BillingRemindersDispatchSummary>> {
    try {
      const now = options?.referenceDate ?? new Date();
      const baseOrigin = (options?.billingBaseUrl ?? env.NEXT_PUBLIC_APP_URL ?? "").replace(
        /\/+$/,
        "",
      );
      const billingUrl = baseOrigin ? `${baseOrigin}/workspace/billing` : "/workspace/billing";

      const candidates = await this.repository.listCandidateSubscriptions();
      let d5SentCount = 0;
      let d0SentCount = 0;
      let expiredTransitionCount = 0;
      let skippedCount = 0;
      const errors: Array<{ subscriptionId: string; error: string }> = [];

      for (const candidate of candidates) {
        const daysRemaining = BillingRemindersService.computeDaysRemaining(
          candidate.expiresAt,
          now,
        );
        const expiresIsoDate = candidate.expiresAt.toISOString().slice(0, 10);

        if (daysRemaining <= 0) {
          if (candidate.d0ReminderSentAt) {
            skippedCount += 1;
            continue;
          }

          const sendRes = await this.notifications.enqueueEmail({
            eventKey: "billing.trial_d0_expired",
            recipient: candidate.clientEmail,
            locale: candidate.clientLocale === "en" ? "en" : "es",
            variables: {
              tenant_name: candidate.clientName,
              plan_name: candidate.planName,
              expires_at: expiresIsoDate,
              billing_url: billingUrl,
            },
            idempotencyKey: `billing:d0:${candidate.subscriptionId}:${expiresIsoDate}`,
          });

          if (!sendRes.ok) {
            errors.push({ subscriptionId: candidate.subscriptionId, error: sendRes.error });
            continue;
          }

          const nextStatus =
            candidate.status === "trialing"
              ? "expired"
              : candidate.status === "active"
                ? "past_due"
                : undefined;

          await this.repository.markD0ReminderAndExpire(
            candidate.subscriptionId,
            now,
            nextStatus,
          );
          d0SentCount += 1;
          if (nextStatus === "expired") {
            expiredTransitionCount += 1;
          }
          continue;
        }

        if (daysRemaining <= 5) {
          if (candidate.d5ReminderSentAt) {
            skippedCount += 1;
            continue;
          }

          const sendRes = await this.notifications.enqueueEmail({
            eventKey: "billing.trial_d5_reminder",
            recipient: candidate.clientEmail,
            locale: candidate.clientLocale === "en" ? "en" : "es",
            variables: {
              tenant_name: candidate.clientName,
              plan_name: candidate.planName,
              days_remaining: daysRemaining,
              expires_at: expiresIsoDate,
              billing_url: billingUrl,
            },
            idempotencyKey: `billing:d5:${candidate.subscriptionId}:${expiresIsoDate}`,
          });

          if (!sendRes.ok) {
            errors.push({ subscriptionId: candidate.subscriptionId, error: sendRes.error });
            continue;
          }

          await this.repository.markD5ReminderSent(candidate.subscriptionId, now);
          d5SentCount += 1;
          continue;
        }

        skippedCount += 1;
      }

      appLogger.info("[BillingRemindersService.dispatchDueReminders] Barrido completado", {
        evaluatedCount: candidates.length,
        d5SentCount,
        d0SentCount,
        expiredTransitionCount,
        skippedCount,
        errorCount: errors.length,
      });

      return ok({
        evaluatedCount: candidates.length,
        d5SentCount,
        d0SentCount,
        expiredTransitionCount,
        skippedCount,
        errors,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingRemindersService.dispatchDueReminders] Error: ${msg}`, error);
      return err(msg, "BILLING_REMINDERS_DISPATCH_ERROR");
    }
  }
}

let defaultBillingRemindersService: BillingRemindersService | null = null;

/**
 * Retorna la instancia singleton del servicio de recordatorios de suscripción.
 */
export function getBillingRemindersService(): BillingRemindersService {
  if (!defaultBillingRemindersService) {
    defaultBillingRemindersService = new BillingRemindersService();
  }
  return defaultBillingRemindersService;
}
