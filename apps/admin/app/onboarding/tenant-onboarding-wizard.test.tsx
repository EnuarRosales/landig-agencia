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

describe("TenantOnboardingWizard (5 pasos · SPEC-06)", () => {
  const baseState: TenantOnboardingStateDto = {
    step: 1,
    stepKey: "business",
    client: null,
    draft: {},
    availablePlans: [
      {
        id: "p1",
        code: "free",
        name: "Plan Gratuito",
        description: "Básico",
        names: { es: "Plan Gratuito", en: "Free Plan" },
        descriptions: { es: "Básico para empezar", en: "Basic starter" },
        currency: "COP",
        priceMonthlyCents: 0,
        priceAnnualCents: 0,
        priceMonthlyUsdCents: 0,
        priceAnnualUsdCents: 0,
        trialDays: 0,
        isPublic: true,
        isPopular: false,
      },
      {
        id: "p2",
        code: "pro",
        name: "Plan Pro",
        description: "Profesional",
        names: { es: "Plan Pro", en: "Pro Plan" },
        descriptions: { es: "Para comercios en crecimiento", en: "For growing stores" },
        currency: "COP",
        priceMonthlyCents: 8500000,
        priceAnnualCents: 85000000,
        priceMonthlyUsdCents: 2500,
        priceAnnualUsdCents: 25000,
        trialDays: 14,
        isPublic: true,
        isPopular: true,
        catalogLimits: {
          products: { mode: "LIMITED", value: 150 },
          imagesPerProduct: { mode: "LIMITED", value: 12 },
          videosPerProduct: { mode: "LIMITED", value: 1 },
          audiosPerProduct: { mode: "LIMITED", value: 4 },
          pdfsPerProduct: { mode: "UNLIMITED", value: null },
          storageBytes: { mode: "LIMITED", value: 1073741824 },
        },
      },
    ],
    currentCatalogSummary: null,
    botCatalog: {
      tones: [
        {
          id: "tone-friendly",
          code: "friendly_advisor",
          labels: { es: "Asesor Amigable", en: "Friendly Advisor" },
          description: { es: "Cercano y cálido", en: "Warm and helpful" },
        },
      ],
      presets: [
        {
          id: "preset-balanced",
          code: "balanced_sales",
          labels: { es: "Ventas Equilibradas", en: "Balanced Sales" },
          recommendedFor: { es: "Comercios minoristas", en: "Retail stores" },
        },
      ],
      objectives: [
        {
          code: "sales_consultant",
          labels: { es: "Asesor Comercial (Catálogo y Ventas)", en: "Sales Consultant" },
        },
        {
          code: "customer_support",
          labels: { es: "Soporte y Seguimiento", en: "Customer Support" },
        },
      ],
    },
    paymentChannels: [
      {
        id: "ch-1",
        channelCode: "nequi",
        displayName: "Nequi",
        accountIdentifier: "",
        accountHolderName: "",
        instructions: "",
        isActive: true,
      },
      {
        id: "ch-2",
        channelCode: "cash_on_delivery",
        displayName: "Pago Contra Entrega",
        accountIdentifier: "",
        accountHolderName: "",
        instructions: "",
        isActive: false,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza Paso 1 con el medallón circular del logo de Mocter centrado (estilo Login), sin texto 'Mocter' ni pill de paso", () => {
    render(<TenantOnboardingWizard initialState={baseState} />);

    const logoImg = screen.getByAltText("Mocter Logo") as HTMLImageElement;
    expect(logoImg.getAttribute("src")).toContain("mocter-logo.png");
    expect(screen.queryByText("Mocter")).toBeNull();
    expect(screen.queryByText("SaaS Admin")).toBeNull();
    expect(screen.queryByTestId("onboarding-step-counter")).toBeNull();
    expect(screen.queryByText(/Paso 1 De 5/i)).toBeNull();

    const activeStepBtn = screen.getByRole("button", { current: "step" });
    expect(activeStepBtn.textContent).toContain("Negocio");

    expect(screen.getByText("Identidad y Contacto del Comercio")).toBeDefined();
    expect(screen.getByLabelText("Nombre Comercial del Negocio")).toBeDefined();
    expect(screen.getByLabelText("Identificador de la Tienda (Slug Web)")).toBeDefined();
    expect(screen.getByLabelText("Correo Comercial (Opcional)")).toBeDefined();
    expect(screen.getByLabelText("Sitio Web (Opcional)")).toBeDefined();
    expect(screen.getByLabelText("Teléfono o WhatsApp (Opcional)")).toBeDefined();
    expect(screen.getByLabelText("Idioma de la Plataforma")).toBeDefined();
    expect(screen.getByLabelText("Moneda Principal de Operación")).toBeDefined();
  });

  it("cambia reactivamente los textos del wizard al seleccionar idioma Inglés en Paso 1", () => {
    render(<TenantOnboardingWizard initialState={baseState} />);

    const localeSelect = screen.getByLabelText("Idioma de la Plataforma") as HTMLSelectElement;
    fireEvent.change(localeSelect, { target: { value: "en" } });

    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Business");
    expect(screen.getByText("Business Identity & Contact")).toBeDefined();
    expect(screen.getByLabelText("Business Display Name")).toBeDefined();
    expect(screen.getByText("Save & Continue To Step 2")).toBeDefined();
  });

  it("pre-carga datos de contacto en Paso 1 para Alta Manual (Synergia Market)", () => {
    const manualState: TenantOnboardingStateDto = {
      ...baseState,
      step: 1,
      client: {
        id: "client-1",
        displayName: "Synergia Market",
        slug: "synergia-market",
        commercialEmail: "ventas@synergia.co",
        phone: "+573001112233",
        websiteUrl: "https://synergia.co",
        logoMediaId: null,
        logoUrl: null,
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

    expect((screen.getByLabelText("Nombre Comercial del Negocio") as HTMLInputElement).value).toBe(
      "Synergia Market",
    );
    expect(
      (screen.getByLabelText("Identificador de la Tienda (Slug Web)") as HTMLInputElement).value,
    ).toBe("synergia-market");
    expect(
      (screen.getByLabelText("Correo Comercial (Opcional)") as HTMLInputElement).value,
    ).toBe("ventas@synergia.co");
    expect((screen.getByLabelText("Sitio Web (Opcional)") as HTMLInputElement).value).toBe(
      "https://synergia.co",
    );
    expect((screen.getByLabelText("Teléfono o WhatsApp (Opcional)") as HTMLInputElement).value).toBe(
      "3001112233",
    );
    expect(screen.getByText("+573001112233")).toBeDefined();
  });

  it("genera el slug automáticamente cuando el usuario escribe su nombre comercial en Alta Autónoma", () => {
    render(<TenantOnboardingWizard initialState={baseState} />);

    fireEvent.change(screen.getByLabelText("Nombre Comercial del Negocio"), {
      target: { value: "Café Especial La Montaña" },
    });

    expect(
      (screen.getByLabelText("Identificador de la Tienda (Slug Web)") as HTMLInputElement).value,
    ).toBe("cafe-especial-la-montana");
  });

  it("avanza del Paso 1 al Paso 2 (Selector de Plan) tras enviar el formulario", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { nextStep: 2, clientId: "new-client" } }),
    } as unknown as Response);

    render(<TenantOnboardingWizard initialState={baseState} />);

    fireEvent.change(screen.getByLabelText("Nombre Comercial del Negocio"), {
      target: { value: "Tienda De Pruebas" },
    });

    fireEvent.click(screen.getByText("Guardar y Continuar al Paso 2"));

    await waitFor(() => {
      expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Plan");
      expect(screen.getByText("Elige Tu Plan Comercial")).toBeDefined();
      expect(screen.getByTestId("plan-card-free")).toBeDefined();
      expect(screen.getByTestId("plan-card-pro")).toBeDefined();
    });
  });

  it("permite alternar frecuencia Mensual/Anual, seleccionar Plan Pro en Paso 2 y avanzar al Paso 3", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { nextStep: 3 } }),
    } as unknown as Response);

    render(<TenantOnboardingWizard initialState={{ ...baseState, step: 2, stepKey: "plan" }} />);

    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Plan");
    fireEvent.click(screen.getByText("Anual"));
    fireEvent.click(screen.getByTestId("plan-card-pro"));
    fireEvent.click(screen.getByText("Guardar Plan y Continuar al Paso 3"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tenant/onboarding",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"action":"step2_plan"'),
        }),
      );
      expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Producto");
      expect(screen.getByText("Tu Primer Producto en el Catálogo")).toBeDefined();
      expect(screen.getByTestId("catalog-quota-banner")).toBeDefined();
    });
  });

  it("calcula utilidad en vivo en Paso 3, alerta si el precio es menor al costo y ejecuta Mejora AI", async () => {
    const step3State: TenantOnboardingStateDto = {
      ...baseState,
      step: 3,
      stepKey: "product",
      draft: {
        plan: { planId: "p2", planCode: "pro", cycle: "monthly" },
      },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: { suggestion: "Café de origen tostado artesanalmente." },
      }),
    } as unknown as Response);

    render(<TenantOnboardingWizard initialState={step3State} />);

    expect(screen.getByTestId("catalog-quota-banner")).toBeDefined();
    expect(screen.getByText(/Capacidades de Catálogo de Tu Plan · Plan Pro/)).toBeDefined();
    expect(screen.getByText(/150/)).toBeDefined();
    expect(screen.getByText(/1 GB/)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Nombre del Producto"), {
      target: { value: "Café Especial 500g" },
    });
    fireEvent.change(screen.getByLabelText("Precio de Costo (Opcional) (COP)"), {
      target: { value: "60000" },
    });
    fireEvent.change(screen.getByLabelText("Precio de Venta (COP)"), {
      target: { value: "50000" },
    });

    expect(screen.getByTestId("product-profitability-card")).toBeDefined();
    expect(screen.getByText("El precio de venta es inferior al costo registrado.")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Precio de Venta (COP)"), {
      target: { value: "100000" },
    });
    expect(screen.queryByText("El precio de venta es inferior al costo registrado.")).toBeNull();
    expect(screen.getByText(/40(\.0)?%/)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Descripción Comercial del Producto"), {
      target: { value: "Café especial de altura" },
    });
    fireEvent.click(screen.getByText("Mejorar con AI"));
    const acceptButton = await screen.findByRole("button", { name: /Aceptar Sugerencia/i });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Descripción Comercial del Producto") as HTMLTextAreaElement).value,
      ).toContain("Café de origen");
    });
  });

  it("configura Asistente Virtual y Canales de Pago en Paso 4 sin filtrar referencias técnicas y avanza al Paso 5", async () => {
    const step4State: TenantOnboardingStateDto = {
      ...baseState,
      step: 4,
      stepKey: "assistant_payments",
      draft: {
        plan: { planId: "p2", planCode: "pro", cycle: "monthly" },
      },
    };

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { nextStep: 5 } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      } as unknown as Response);

    const { container } = render(<TenantOnboardingWizard initialState={step4State} />);

    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Asistente y Pagos");
    expect(screen.getByText("Asistente Virtual y Canales de Pago")).toBeDefined();
    expect(screen.getByText("Asesor Comercial (Catálogo y Ventas)")).toBeDefined();
    expect(screen.getByText("Ventas Equilibradas")).toBeDefined();
    expect(screen.getByText("Asesor Amigable")).toBeDefined();
    expect(container.textContent?.toLowerCase()).not.toContain("chatwoot");

    fireEvent.change(screen.getByLabelText("Nombre del Asistente Virtual"), {
      target: { value: "Luna Asesora" },
    });

    fireEvent.click(screen.getByText("Guardar y Continuar al Paso 5"));

    await waitFor(() => {
      expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Activación");
      expect(screen.getByText("Activa Tu Comercio")).toBeDefined();
    });
  });

  it("permite iniciar periodo de prueba en Paso 5 y redirige a /workspace", async () => {
    const step5TrialState: TenantOnboardingStateDto = {
      ...baseState,
      step: 5,
      stepKey: "billing",
      draft: {
        plan: { planId: "p2", planCode: "pro", cycle: "monthly" },
      },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { lifecycleStatus: "prueba", redirectTo: "/workspace" } }),
    } as unknown as Response);

    render(<TenantOnboardingWizard initialState={step5TrialState} />);

    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Activación");
    expect(screen.getByText("Comenzar Periodo de Prueba Gratis")).toBeDefined();

    fireEvent.click(screen.getByTestId("step5-activate-trial-or-free-cta"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tenant/onboarding",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"completionMode":"trial"'),
        }),
      );
      expect(mockPush).toHaveBeenCalledWith("/workspace");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("permite activar Plan Gratuito en Paso 5 cuando el plan seleccionado no tiene costo ni trial", async () => {
    const step5FreeState: TenantOnboardingStateDto = {
      ...baseState,
      step: 5,
      stepKey: "billing",
      draft: {
        plan: { planId: "p1", planCode: "free", cycle: "monthly" },
      },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { lifecycleStatus: "activo", redirectTo: "/workspace" } }),
    } as unknown as Response);

    render(<TenantOnboardingWizard initialState={step5FreeState} />);

    expect(screen.getByText("Finalizar y Activar Comercio")).toBeDefined();
    fireEvent.click(screen.getByTestId("step5-activate-trial-or-free-cta"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tenant/onboarding",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"completionMode":"free"'),
        }),
      );
      expect(mockPush).toHaveBeenCalledWith("/workspace");
    });
  });
});
