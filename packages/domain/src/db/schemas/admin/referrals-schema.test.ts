import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  referralPrograms,
  referralCodes,
  referrals,
  referralRewards,
} from "./referrals";

describe("REF-001 T-02 · Esquemas del Programa de Referidos", () => {
  it("referral_programs declara parámetros configurables del Modelo A", () => {
    const cols = getTableColumns(referralPrograms);

    expect(cols.id).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.model).toBeDefined();
    expect(cols.rewardType).toBeDefined();
    expect(cols.rewardValue).toBeDefined();
    expect(cols.currency).toBeDefined();
    expect(cols.attributionDays).toBeDefined();
    expect(cols.capReferralsPerReferrer).toBeDefined();
    expect(cols.creditValidityDays).toBeDefined();
    expect(cols.status).toBeDefined();
  });

  it("referral_codes garantiza código único por inquilino", () => {
    const cols = getTableColumns(referralCodes);

    expect(cols.id).toBeDefined();
    expect(cols.clientId).toBeDefined();
    expect(cols.code).toBeDefined();
    expect(cols.status).toBeDefined();
  });

  it("referrals registra atribución y estados de calificación", () => {
    const cols = getTableColumns(referrals);

    expect(cols.id).toBeDefined();
    expect(cols.programId).toBeDefined();
    expect(cols.referrerClientId).toBeDefined();
    expect(cols.referredClientId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.attributedAt).toBeDefined();
    expect(cols.qualifiedAt).toBeDefined();
  });

  it("referral_rewards lleva el saldo de crédito con vencimiento a 365 días", () => {
    const cols = getTableColumns(referralRewards);

    expect(cols.id).toBeDefined();
    expect(cols.referralId).toBeDefined();
    expect(cols.referrerClientId).toBeDefined();
    expect(cols.amountCents).toBeDefined();
    expect(cols.remainingCents).toBeDefined();
    expect(cols.currency).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.creditedAt).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
    expect(cols.appliedInvoiceId).toBeDefined();
  });
});

