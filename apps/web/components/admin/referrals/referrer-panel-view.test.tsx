// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReferrerPanelView } from "./referrer-panel-view";

describe("REF-001 T-07 · ReferrerPanelView Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockProps = {
    referralCode: "COMLID55",
    referralLink: "https://mocter.co/register?ref=COMLID55",
    currency: "COP",
    metrics: {
      totalReferred: 5,
      pendingCount: 2,
      rewardedCount: 3,
      totalEarnedCents: 15000000,
      availableCreditCents: 10000000,
    },
    referrals: [
      {
        id: "ref-1",
        code: "COMLID55",
        status: "rewarded" as const,
        attributedAt: new Date("2026-10-15").toISOString(),
      },
      {
        id: "ref-2",
        code: "COMLID55",
        status: "pending" as const,
        attributedAt: new Date("2026-10-20").toISOString(),
      },
    ],
  };

  it("renderiza el código único, enlace de invitación y métricas acumuladas", () => {
    render(<ReferrerPanelView {...mockProps} />);

    expect(screen.getAllByText("COMLID55").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("https://mocter.co/register?ref=COMLID55")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined(); // total referred
    expect(screen.getByText("2")).toBeDefined(); // pending
  });

  it("permite copiar el enlace al portapapeles y muestra confirmación", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<ReferrerPanelView {...mockProps} />);

    const copyButton = screen.getByRole("button", { name: "Copiar Enlace De Invitación" });
    await fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith("https://mocter.co/register?ref=COMLID55");
    expect(await screen.findByText("Enlace Copiado Al Portapapeles")).toBeDefined();
  });

  it("renderiza la tabla de historial con estados correctos", () => {
    render(<ReferrerPanelView {...mockProps} />);

    expect(screen.getByText("Historial De Referidos")).toBeDefined();
    expect(screen.getByText("Premiado")).toBeDefined();
    expect(screen.getByText("Pendiente De Pago")).toBeDefined();
  });
});
