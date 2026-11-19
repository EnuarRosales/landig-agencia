// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProductListItemDto, PromotionListResultDto } from "@mocter/domain";
import { PromotionsView } from "./promotions-view";
import { ProductsView } from "../products/products-view";

const workspaceFetchMock = vi.fn();

vi.mock("@/lib/workspace-client", () => ({
  workspaceFetch: (...args: unknown[]) => workspaceFetchMock(...args),
}));

const sampleProducts: ProductListItemDto[] = [
  {
    id: "prod-1",
    name: "Hidrolavadora Vapor Pro",
    description: "Hidrolavadora de alta presión",
    sku: "HID-01",
    category: "Hidrolavadoras",
    brand: "Mocter",
    kind: "physical",
    compositionType: "simple",
    condition: "new",
    availability: "in_stock",
    status: "active",
    currency: "COP",
    costPriceCents: 250_000,
    priceCents: 500_000,
    salePriceCents: 425_000,
    activePromotion: {
      promotionId: "promo-1",
      name: "Semana del Hogar",
      description: "15% OFF por tiempo limitado",
      scopeType: "category",
      discountType: "percentage",
      discountValue: 15,
      originalPriceCents: 500_000,
      effectivePriceCents: 425_000,
      savingsCents: 75_000,
      savingsPct: 15,
      startsAt: "2026-11-18T12:00:00.000Z",
      endsAt: "2026-11-25T23:59:00.000Z",
      remainingUnits: 8,
    },
    profitability: {
      profitCents: 175_000,
      marginPct: 41.18,
      markupPct: 70,
      isNegative: false,
    },
    stockQuantity: 15,
    minStockThreshold: 3,
    effectiveStock: 15,
    isLowStock: false,
    hasInactiveComboComponent: false,
    coverImageUrl: null,
    mediaUrls: [],
    mediaCounts: { image: 0, video: 0, audio: 0, pdf: 0 },
    attributesCount: 0,
    comboComponentsCount: 0,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
  },
  {
    id: "prod-2",
    name: "Boquilla Espuma",
    description: "Accesorio de limpieza",
    sku: "BOQ-01",
    category: "Hidrolavadoras",
    brand: "Mocter",
    kind: "physical",
    compositionType: "simple",
    condition: "new",
    availability: "in_stock",
    status: "active",
    currency: "COP",
    costPriceCents: 15_000,
    priceCents: 30_000,
    salePriceCents: null,
    activePromotion: null,
    profitability: {
      profitCents: 15_000,
      marginPct: 50,
      markupPct: 100,
      isNegative: false,
    },
    stockQuantity: 25,
    minStockThreshold: 5,
    effectiveStock: 25,
    isLowStock: false,
    hasInactiveComboComponent: false,
    coverImageUrl: null,
    mediaUrls: [],
    mediaCounts: { image: 0, video: 0, audio: 0, pdf: 0 },
    attributesCount: 0,
    comboComponentsCount: 0,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
  },
];

const initialPromotions: PromotionListResultDto = {
  items: [
    {
      id: "promo-1",
      name: "Semana del Hogar",
      description: "15% OFF por tiempo limitado",
      scopeType: "category",
      discountType: "percentage",
      discountValue: 15,
      startsAt: "2026-11-18T12:00:00.000Z",
      endsAt: "2026-11-25T23:59:00.000Z",
      maxDiscountedUnits: 20,
      discountedUnitsSold: 12,
      remainingUnits: 8,
      isActive: true,
      lifecycleStatus: "active",
      productIds: [],
      categories: ["Hidrolavadoras"],
      targetsCount: 1,
      matchedProductsCount: 2,
      applicableProductsCount: 2,
      excludedProductsCount: 0,
      lossProductsCount: 0,
      tightMarginProductsCount: 0,
      minMarginPct: 41.18,
      createdAt: "2026-11-18T12:00:00.000Z",
      updatedAt: "2026-11-18T12:00:00.000Z",
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  summary: {
    activeCount: 1,
    scheduledCount: 0,
    pausedCount: 0,
    expiredOrDepletedCount: 0,
    productsOnOfferTodayCount: 2,
  },
};

describe("SPEC-18 T-04 · Central de Promociones y badges en Catálogo de Productos", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza PromotionsView con layout perimetral, KPIs, abre el modal y lo cierra automáticamente al guardar", async () => {
    workspaceFetchMock
      .mockResolvedValueOnce({
        ok: true,
        data: { ...initialPromotions.items[0], id: "promo-2", name: "Oferta Express" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: initialPromotions,
      });

    const { container } = render(
      <PromotionsView
        initialPromotions={initialPromotions}
        catalogProducts={sampleProducts}
        canDelete={true}
        locale="es"
        currency="COP"
      />,
    );

    expect(container.firstElementChild?.className).toContain("md:px-8");
    expect(screen.getByText("Central de Promociones")).toBeTruthy();
    expect(screen.getAllByText("Semana del Hogar").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Crear Nueva Promoción/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Nombre de la Promoción/i), {
      target: { value: "Oferta Express" },
    });

    // Verificar advertencia D-06 al poner monto fijo mayor al precio de Boquilla Espuma ($300)
    fireEvent.change(screen.getByLabelText(/Tipo de Beneficio/i), {
      target: { value: "fixed_amount" },
    });
    fireEvent.change(screen.getByLabelText(/Valor del Descuento/i), {
      target: { value: "400" },
    });
    expect(screen.getByText(/excluidos automáticamente/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Guardar Promoción/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("muestra el badge de campaña activa (-15% · Semana del Hogar) y precio tachado en ProductsView", () => {
    render(
      <ProductsView
        initialCatalog={{
          items: sampleProducts,
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
          summary: { totalActive: 2, lowStockCount: 0, comboCount: 0 },
        }}
        locale="es"
        initialCurrency="COP"
      />,
    );

    expect(screen.getAllByText(/-15% · Semana del Hogar/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8 unid\. restantes/).length).toBeGreaterThan(0);
  });
});
