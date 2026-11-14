import { describe, expect, it, vi } from "vitest";
import { ok } from "../types/result";
import {
  BillingRemindersService,
  type DueSubscriptionReminderCandidate,
  type IBillingRemindersRepository,
} from "./billing-reminders.service";

describe("SPEC-04 T-04 · BillingRemindersService (D-5 & D-0 idempotente)", () => {
  it("envía D-5 dentro de ventana <= 5 días, marca d5ReminderSentAt y no duplica en re-ejecución", async () => {
    const now = new Date("2026-11-14T15:00:00.000Z");
    const expiresInFourDays = new Date("2026-11-18T14:00:00.000Z"); // ceil ~ 4 días

    const state: DueSubscriptionReminderCandidate[] = [
      {
        subscriptionId: "sub-d5-1",
        clientId: "client-1",
        clientName: "Comercio Uno",
        clientEmail: "owner@uno.co",
        clientLocale: "es",
        planName: "Plan Growth",
        status: "trialing",
        expiresAt: expiresInFourDays,
        d5ReminderSentAt: null,
        d0ReminderSentAt: null,
      },
      {
        subscriptionId: "sub-far-2",
        clientId: "client-2",
        clientName: "Comercio Dos",
        clientEmail: "owner@dos.co",
        clientLocale: "es",
        planName: "Plan Starter",
        status: "active",
        expiresAt: new Date("2026-11-28T15:00:00.000Z"), // > 5 días
        d5ReminderSentAt: null,
        d0ReminderSentAt: null,
      },
    ];

    const repo: IBillingRemindersRepository = {
      listCandidateSubscriptions: vi.fn().mockImplementation(async () => state),
      markD5ReminderSent: vi.fn().mockImplementation(async (id, sentAt) => {
        const target = state.find((s) => s.subscriptionId === id);
        if (target) target.d5ReminderSentAt = sentAt;
      }),
      markD0ReminderAndExpire: vi.fn(),
    };

    const enqueueEmail = vi.fn().mockResolvedValue(ok({ delivery: { id: "del-1" } }));
    const service = new BillingRemindersService(repo, { enqueueEmail } as never);

    const first = await service.dispatchDueReminders({
      referenceDate: now,
      billingBaseUrl: "https://admin.mocter.co",
    });

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.evaluatedCount).toBe(2);
    expect(first.data.d5SentCount).toBe(1);
    expect(first.data.d0SentCount).toBe(0);
    expect(first.data.skippedCount).toBe(1);
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "billing.trial_d5_reminder",
        recipient: "owner@uno.co",
        idempotencyKey: "billing:d5:sub-d5-1:2026-11-18",
      }),
    );

    // Segunda ejecución en la misma ventana -> idempotente (no vuelve a enviar)
    enqueueEmail.mockClear();
    const second = await service.dispatchDueReminders({ referenceDate: now });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.d5SentCount).toBe(0);
    expect(second.data.skippedCount).toBe(2);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("envía D-0 al vencer, transiciona trialing -> expired y marca d0ReminderSentAt sin duplicar", async () => {
    const now = new Date("2026-11-14T15:00:00.000Z");
    const expiredToday = new Date("2026-11-14T12:00:00.000Z");

    const state: DueSubscriptionReminderCandidate[] = [
      {
        subscriptionId: "sub-d0-1",
        clientId: "client-3",
        clientName: "Tienda Tres",
        clientEmail: "admin@tres.co",
        clientLocale: "en",
        planName: "Pro Plan",
        status: "trialing",
        expiresAt: expiredToday,
        d5ReminderSentAt: new Date("2026-11-09T12:00:00.000Z"),
        d0ReminderSentAt: null,
      },
    ];

    const repo: IBillingRemindersRepository = {
      listCandidateSubscriptions: vi.fn().mockImplementation(async () => state),
      markD5ReminderSent: vi.fn(),
      markD0ReminderAndExpire: vi.fn().mockImplementation(async (id, sentAt, nextStatus) => {
        const target = state.find((s) => s.subscriptionId === id);
        if (target) {
          target.d0ReminderSentAt = sentAt;
          if (nextStatus) target.status = nextStatus;
        }
      }),
    };

    const enqueueEmail = vi.fn().mockResolvedValue(ok({ delivery: { id: "del-2" } }));
    const service = new BillingRemindersService(repo, { enqueueEmail } as never);

    const res = await service.dispatchDueReminders({ referenceDate: now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.d0SentCount).toBe(1);
    expect(res.data.expiredTransitionCount).toBe(1);
    expect(state[0]!.status).toBe("expired");
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "billing.trial_d0_expired",
        locale: "en",
        idempotencyKey: "billing:d0:sub-d0-1:2026-11-14",
      }),
    );
  });
});
