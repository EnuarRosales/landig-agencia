// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReferralManagementDashboard, type ProgramConfig, type ProgramMetrics } from "./referral-management-dashboard";

describe("REF-001 T-06 · ReferralManagementDashboard Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockConfig: ProgramConfig = {
    id: "prog-1",
    name: "Programa General 2026",
    status: "active",
    rewardType: "fixed",
    rewardValue: 5000000,
    currency: "COP",
    attributionDays: 60,
    capReferralsPerReferrer: 10,
    creditValidityDays: 365,
  };

  const mockMetrics: ProgramMetrics = {
    totalReferrals: 15,
    pendingCount: 4,
    qualifiedCount: 2,
    rewardedCount: 8,
    rejectedCount: 1,
    totalRewardsIssuedCents: 40000000,
    totalCreditsRedeemedCents: 15000000,
    totalCreditsAvailableCents: 25000000,
  };

  it("renderiza el estado activo y permite alternar a pausado con un clic", async () => {
    const handleSave = vi.fn().mockResolvedValue(true);
    render(
      <ReferralManagementDashboard
        initialConfig={mockConfig}
        initialMetrics={mockMetrics}
        userRole="platform_admin"
        onSave={handleSave}
      />,
    );

    expect(screen.getByText("Gestión Del Programa De Referidos")).toBeDefined();
    expect(screen.getByText("Programa Activo")).toBeDefined();

    const toggleButton = screen.getByRole("button", { name: "Alternar Estado Del Programa" });
    fireEvent.click(toggleButton);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paused",
      }),
    );
  });

  it("deshabilita edición y botón de toggle en modo solo lectura (platform_sales)", () => {
    render(
      <ReferralManagementDashboard
        initialConfig={mockConfig}
        initialMetrics={mockMetrics}
        userRole="platform_sales"
      />,
    );

    expect(screen.getByText("Modo Solo Lectura (Platform Sales)")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Alternar Estado Del Programa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar Configuración Comercial" })).toBeNull();

    const rewardTypeSelect = screen.getByLabelText("Tipo De Recompensa") as HTMLSelectElement;
    expect(rewardTypeSelect.disabled).toBe(true);
  });

  it("permite modificar parámetros comerciales y guardar la configuración", async () => {
    const handleSave = vi.fn().mockResolvedValue(true);
    render(
      <ReferralManagementDashboard
        initialConfig={mockConfig}
        initialMetrics={mockMetrics}
        userRole="platform_owner"
        onSave={handleSave}
      />,
    );

    const attributionInput = screen.getByLabelText("Ventana De Atribución (Días)");
    fireEvent.change(attributionInput, { target: { value: "45" } });

    const submitBtn = screen.getByRole("button", { name: "Guardar Configuración Comercial" });
    fireEvent.click(submitBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attributionDays: 45,
      }),
    );
  });
});
