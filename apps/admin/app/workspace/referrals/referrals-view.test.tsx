/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { TenantReferralsOverviewDto } from "@mocter/domain";
import { TenantReferralsView } from "./referrals-view";

const sampleOverview: TenantReferralsOverviewDto = {
  program: {
    id: "prog-1",
    name: "Programa de Referidos Mocter",
    status: "active",
    rewardType: "fixed",
    rewardValue: 5000000,
    currency: "COP",
    attributionDays: 60,
    creditValidityDays: 365,
    capReferralsPerReferrer: null,
  },
  code: "ANDES482",
  referralLink: "https://mocter.co/r/ANDES482",
  qrSvgDataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  metrics: {
    totalReferred: 3,
    pendingCount: 1,
    rewardedCount: 2,
    totalEarnedCents: 10000000,
    availableCreditCents: 5000000,
    currency: "COP",
  },
  referrals: {
    items: [
      {
        id: "ref-1",
        referredBusinessMasked: "Tienda Be***",
        status: "rewarded",
        attributedAt: "2026-11-10T12:00:00.000Z",
        qualifiedAt: "2026-11-12T15:00:00.000Z",
        rejectedReason: null,
        rewardAmountCents: 5000000,
        rewardCurrency: "COP",
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  },
  rewards: [
    {
      id: "rew-1",
      referralId: "ref-1",
      amountCents: 5000000,
      remainingCents: 2000000,
      currency: "COP",
      creditedAt: "2026-11-12T15:00:00.000Z",
      expiresAt: "2027-11-12T15:00:00.000Z",
      status: "partially_redeemed",
    },
  ],
  redemptions: [
    {
      id: "red-1",
      rewardId: "rew-1",
      invoiceId: "inv-1",
      invoiceNumber: "INV-2026-100200",
      amountCents: 3000000,
      currency: "COP",
      redeemedAt: "2026-11-15T10:00:00.000Z",
    },
  ],
};

describe("SPEC-16 · TenantReferralsView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza enlace único, código, QR compartible, KPIs, referidos enmascarados y redenciones", () => {
    render(<TenantReferralsView initialData={sampleOverview} locale="es" />);

    expect(screen.getByText("Programa de Referidos")).toBeTruthy();
    expect(screen.getByTestId("tenant-referral-code").textContent).toBe("ANDES482");
    expect(screen.getByDisplayValue("https://mocter.co/r/ANDES482")).toBeTruthy();
    expect(screen.getByTestId("tenant-referral-qr")).toBeTruthy();
    expect(screen.getAllByText("Tienda Be***").length).toBeGreaterThan(0);
    expect(screen.getByText(/INV-2026-100200/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Aplicar en Mi Suscripción/i })).toBeTruthy();
  });

  it("muestra aviso de programa pausado conservando visible el saldo disponible", () => {
    const pausedData: TenantReferralsOverviewDto = {
      ...sampleOverview,
      program: { ...sampleOverview.program!, status: "paused" },
    };

    render(<TenantReferralsView initialData={pausedData} locale="es" />);

    expect(screen.getByTestId("referrals-status-banner")).toBeTruthy();
    expect(screen.getByText("Programa Pausado Temporalmente")).toBeTruthy();
    expect(screen.getByTestId("tenant-available-credit-kpi").textContent).toContain("50.000");
  });

  it("copia el enlace al portapapeles con feedback visual", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<TenantReferralsView initialData={sampleOverview} locale="es" />);
    const copyBtn = screen.getByRole("button", { name: /Copiar Enlace/i });
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("https://mocter.co/r/ANDES482");
  });
});
