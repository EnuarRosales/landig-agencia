// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PricingSection } from "./pricing-section";
import type { PublicPlanDto } from "@mocter/domain";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const dict: Record<string, string> = {
      pill: "Planes y Tarifas",
      title: "Escala tu atención sin límites",
      subtitle: "Sin costos por mensaje",
      monthly: "Mensual",
      annual: "Anual",
      discountBadge: "Ahorra 20%",
      popularBadge: "Más Popular",
      perMonth: "mes",
      cta: "Comenzar ahora",
      productsLabel: "Productos",
      agentsLabel: "Agentes",
      storageLabel: "Almacenamiento",
      retentionLabel: "Retención de chats",
      unlimited: "Ilimitado",
      days: "días",
      mb: "MB",
      gb: "GB",
      compareToggle: "Ver Tabla Comparativa Completa",
      hideCompareToggle: "Ocultar Tabla Comparativa",
      comparisonTitle: "Comparación Detallada De Planes",
      comparisonSubtitle: "Evalúa a fondo las capacidades",
      categoryCatalog: "Catálogo Y Medios",
      categoryChannels: "Canales Y Atención",
      categoryData: "Almacenamiento Y Retención",
      categoryAutomation: "Automatización Y Productividad",
      categoryPlatform: "Plataforma Y Colaboración",
      featureProducts: "Productos en catálogo",
      featureStorage: "Almacenamiento multimedia",
      featureRetention: "Retención de conversaciones",
    };
    return dict[key] || key;
  },
  useLocale: () => "es",
}));

describe("PricingSection & PlanComparisonTable Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockPlans: PublicPlanDto[] = [
    {
      id: "0192e210-aaaa-7000-8000-000000000001",
      code: "starter",
      name: { es: "Inicial", en: "Starter" },
      description: { es: "Para negocios que inician", en: "For starters" },
      status: "active",
      isPublic: true,
      isPopular: false,
      sortOrder: 1,
      trialDays: 14,
      graceDays: 7,
      billingCycles: ["monthly", "annual"],
      priceMonthlyCents: 4900000,
      priceAnnualCents: 47000000,
      currency: "COP",
      marketingFeatures: { es: ["Soporte por email"], en: ["Email support"] },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
      limits: {
        products: { mode: "LIMITED", value: 100 },
        chatwoot_agents: { mode: "LIMITED", value: 2 },
        storage_bytes: { mode: "LIMITED", value: 500 * 1024 * 1024 }, // 500 MB
        chat_retention_days: { mode: "LIMITED", value: 30 },
      },
      capabilities: {
        channel_whatsapp: false,
        channel_email: true,
      },
    },
    {
      id: "0192e210-bbbb-7000-8000-000000000002",
      code: "growth",
      name: { es: "Crecimiento", en: "Growth" },
      description: { es: "Para empresas en expansión", en: "For growth" },
      status: "active",
      isPublic: true,
      isPopular: true,
      sortOrder: 2,
      trialDays: 14,
      graceDays: 7,
      billingCycles: ["monthly", "annual"],
      priceMonthlyCents: 9900000,
      priceAnnualCents: 95000000,
      currency: "COP",
      marketingFeatures: { es: ["WhatsApp multiagente"], en: ["Multiagent WhatsApp"] },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
      limits: {
        products: { mode: "UNLIMITED", value: null },
        chatwoot_agents: { mode: "LIMITED", value: 10 },
        storage_bytes: { mode: "LIMITED", value: 2 * 1024 * 1024 * 1024 }, // 2 GB
        chat_retention_days: { mode: "LIMITED", value: 90 },
      },
      capabilities: {
        channel_whatsapp: true,
        channel_email: true,
      },
    },
  ];

  it("retorna null si la lista de planes está vacía", () => {
    const { container } = render(<PricingSection plans={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza las tarjetas con métricas HUD (productos, agentes, MB/GB y retención)", () => {
    render(<PricingSection plans={mockPlans} />);

    expect(screen.getByText("Inicial")).toBeDefined();
    expect(screen.getByText("Crecimiento")).toBeDefined();

    // HUD metrics
    expect(screen.getAllByText("Productos").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Almacenamiento").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Retención de chats").length).toBeGreaterThanOrEqual(2);

    // Metric values
    expect(screen.getByText("500 MB")).toBeDefined();
    expect(screen.getByText("2 GB")).toBeDefined();
    expect(screen.getByText("30 días")).toBeDefined();
    expect(screen.getByText("90 días")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    expect(screen.getByText("Ilimitado")).toBeDefined();
  });

  it("alterna el cuadro comparativo expandible al pulsar el botón", () => {
    render(<PricingSection plans={mockPlans} />);

    // Inicialmente no está visible la tabla comparativa
    expect(screen.queryByText("Comparación Detallada De Planes")).toBeNull();

    const toggleButton = screen.getByText("Ver Tabla Comparativa Completa");
    expect(toggleButton).toBeDefined();

    // Al hacer clic, se expande la tabla
    fireEvent.click(toggleButton);
    expect(screen.getByText("Comparación Detallada De Planes")).toBeDefined();
    expect(screen.getByText("Ocultar Tabla Comparativa")).toBeDefined();

    // Verificamos categorías dentro de la tabla comparativa
    expect(screen.getByText("Catálogo Y Medios")).toBeDefined();
    expect(screen.getByText("Almacenamiento Y Retención")).toBeDefined();

    // Al hacer clic de nuevo, se colapsa
    fireEvent.click(screen.getByText("Ocultar Tabla Comparativa"));
    expect(screen.queryByText("Comparación Detallada De Planes")).toBeNull();
  });
});
