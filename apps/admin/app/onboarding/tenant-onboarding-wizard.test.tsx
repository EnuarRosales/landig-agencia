import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { TenantOnboardingWizard } from "./tenant-onboarding-wizard";
import type { TenantOnboardingStateDto } from "@mocter/domain";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

describe("TenantOnboardingWizard", () => {
  const baseState: TenantOnboardingStateDto = {
    step: 1,
    client: null,
    draft: {},
    availablePlans: [
      { id: "p1", code: "free", name: "Plan Gratuito", description: "Básico", priceMonthlyCents: 0 },
      { id: "p2", code: "pro", name: "Plan Pro", description: "Profesional", priceMonthlyCents: 8500000 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Step 1 with Title Case labels and plan options", () => {
    render(<TenantOnboardingWizard initialState={baseState} />);

    expect(screen.getByText("Identidad y Moneda Del Comercio")).toBeDefined();
    expect(screen.getByLabelText("Nombre Comercial Del Negocio")).toBeDefined();
    expect(screen.getByLabelText("Identificador De La Tienda (Slug Web)")).toBeDefined();
    expect(screen.getByLabelText("Moneda Principal De Operación")).toBeDefined();
    expect(screen.getByText("Plan Gratuito")).toBeDefined();
    expect(screen.getByText("Plan Pro")).toBeDefined();
  });

  it("pre-populates Step 1 for manual tenant (Synergia Market)", () => {
    const manualState: TenantOnboardingStateDto = {
      ...baseState,
      step: 1,
      client: {
        id: "client-1",
        displayName: "Synergia Market",
        slug: "synergia-market",
        locale: "es",
        currency: "COP",
        timezone: "America/Bogota",
        lifecycleStatus: "alta",
        planId: "p2",
        planCode: "pro",
        cellCode: "cell-01",
      },
    };

    render(<TenantOnboardingWizard initialState={manualState} />);

    const nameInput = screen.getByLabelText("Nombre Comercial Del Negocio") as HTMLInputElement;
    expect(nameInput.value).toBe("Synergia Market");

    const slugInput = screen.getByLabelText("Identificador De La Tienda (Slug Web)") as HTMLInputElement;
    expect(slugInput.value).toBe("synergia-market");
  });

  it("auto-generates slug when display name is entered for self-service", () => {
    render(<TenantOnboardingWizard initialState={baseState} />);

    const nameInput = screen.getByLabelText("Nombre Comercial Del Negocio") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Café Especial La Montaña" } });

    const slugInput = screen.getByLabelText("Identificador De La Tienda (Slug Web)") as HTMLInputElement;
    expect(slugInput.value).toBe("cafe-especial-la-montana");
  });

  it("advances from Step 1 to Step 2 upon successful submission", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { nextStep: 2, clientId: "new-client" } }),
    } as any);

    render(<TenantOnboardingWizard initialState={baseState} />);

    fireEvent.change(screen.getByLabelText("Nombre Comercial Del Negocio"), {
      target: { value: "Tienda De Pruebas" },
    });
    fireEvent.change(screen.getByLabelText("Identificador De La Tienda (Slug Web)"), {
      target: { value: "tienda-pruebas" },
    });

    const submitBtn = screen.getByText("Guardar y Continuar Al Paso 2");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Publica Tu Primer Producto")).toBeDefined();
      expect(screen.getByLabelText("Nombre Del Producto")).toBeDefined();
      expect(screen.getByLabelText("Descripción Detallada Del Producto")).toBeDefined();
      expect(screen.getByText("Mejorar Con AI")).toBeDefined();
    });
  });

  it("triggers AI enhancement on product description in Step 2", async () => {
    const step2State: TenantOnboardingStateDto = {
      ...baseState,
      step: 2,
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, enhancedText: "Texto mejorado con inteligencia artificial." }),
    } as any);

    render(<TenantOnboardingWizard initialState={step2State} />);

    fireEvent.change(screen.getByLabelText("Nombre Del Producto"), {
      target: { value: "Camisa Oxford" },
    });

    const aiButton = screen.getByText("Mejorar Con AI");
    fireEvent.click(aiButton);

    await waitFor(() => {
      const descTextarea = screen.getByLabelText("Descripción Detallada Del Producto") as HTMLTextAreaElement;
      expect(descTextarea.value).toContain("Texto mejorado");
    });
  });

  it("completes Step 3 and redirects to /workspace on final activation", async () => {
    const step3State: TenantOnboardingStateDto = {
      ...baseState,
      step: 3,
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { lifecycleStatus: "activo", redirectTo: "/workspace" } }),
    } as any);

    render(<TenantOnboardingWizard initialState={step3State} />);

    expect(screen.getByText("Configura Tu Asistente y Métodos De Pago")).toBeDefined();
    expect(screen.getByText("Asesor Comercial Amigable")).toBeDefined();

    const activateBtn = screen.getByText("Activar Comercio e Ir Al Espacio De Trabajo");
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/workspace");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
