// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { UpgradePlanView } from "./upgrade-plan-view";
import type { Plan } from "@mocter/domain";

describe("LND-001 T-08 / CA-LND-05 · UpgradePlanView Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockPlans: Plan[] = [
    {
      id: "uuid-plan-basic",
      code: "basic",
      name: { es: "Plan Básico", en: "Basic Plan" },
      description: {
        es: "Ideal para iniciar atención automatizada",
        en: "Great for starting automated service",
      },
      status: "active",
      isPublic: true,
      isPopular: false,
      sortOrder: 1,
      trialDays: 14,
      graceDays: 3,
      billingCycles: ["monthly", "annual"],
      priceMonthlyCents: 9900000,
      priceAnnualCents: 99000000,
      currency: "COP",
      marketingFeatures: {
        es: ["1 número WhatsApp", "500 conversaciones/mes"],
        en: ["1 WhatsApp number", "500 conversations/mo"],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    },
    {
      id: "uuid-plan-pro",
      code: "pro",
      name: { es: "Plan Pro", en: "Pro Plan" },
      description: {
        es: "Para negocios con alta demanda y múltiples agentes",
        en: "For businesses with high demand and multiple agents",
      },
      status: "active",
      isPublic: true,
      isPopular: true,
      sortOrder: 2,
      trialDays: 14,
      graceDays: 3,
      billingCycles: ["monthly", "annual"],
      priceMonthlyCents: 19900000,
      priceAnnualCents: 199000000,
      currency: "COP",
      marketingFeatures: {
        es: ["3 números WhatsApp", "Conversaciones ilimitadas", "Soporte prioritario"],
        en: ["3 WhatsApp numbers", "Unlimited conversations", "Priority support"],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    },
  ];

  const tMock = {
    title: "Suscripción y Facturación",
    subtitle: "Gestiona tu plan activo y prorrateos",
    currentPlan: "Plan Actual",
    upgradePlan: "Mejorar Plan",
    changePlan: "Cambiar de Plan",
    currentStatus: "Estado de la Suscripción",
    active: "Activa",
    prorationNotice: "Al cambiar de plan, el saldo a favor de tus días restantes se aplicará como crédito.",
    availablePlans: "Planes Disponibles para Upgrade",
    selectPlan: "Seleccionar Plan",
    confirmUpgrade: "Confirmar Upgrade de Plan",
    checkoutButton: "Proceder al Pago Seguro",
    backToSettings: "Volver a Configuración",
    monthly: "Mensual",
    annual: "Anual",
    saveBadge: "Ahorra 20%",
  };

  it("renderiza el plan actual y el aviso de prorrateo de días restantes", () => {
    render(
      <UpgradePlanView
        locale="es"
        currentPlanCode="basic"
        availablePlans={mockPlans}
        t={tMock}
      />
    );

    expect(screen.getByText("Suscripción y Facturación")).toBeTruthy();
    expect(screen.getAllByText("Plan Básico").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.getByText(tMock.prorationNotice)).toBeTruthy();
  });

  it("muestra el botón de Mejorar Plan habilitado para planes superiores", () => {
    render(
      <UpgradePlanView
        locale="es"
        currentPlanCode="basic"
        availablePlans={mockPlans}
        t={tMock}
      />
    );

    // Para el plan básico (actual), el botón debe decir "Plan Actual"
    const currentBtn = screen.getByRole("button", { name: "Plan Actual" });
    expect(currentBtn).toBeTruthy();
    expect((currentBtn as HTMLButtonElement).disabled).toBe(true);

    // Para el plan Pro, el botón debe decir "Mejorar Plan"
    const upgradeBtn = screen.getByRole("button", { name: "Mejorar Plan" });
    expect(upgradeBtn).toBeTruthy();
    expect((upgradeBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("permite conmutar entre ciclo mensual y anual", () => {
    render(
      <UpgradePlanView
        locale="es"
        currentPlanCode="basic"
        availablePlans={mockPlans}
        t={tMock}
      />
    );

    const annualBtn = screen.getByRole("button", { name: /Anual/i });
    fireEvent.click(annualBtn);

    // Se debe observar el precio anual en las tarjetas y resumen
    expect(screen.getAllByText(/COP \/ Anual/i).length).toBeGreaterThanOrEqual(1);
  });
});
