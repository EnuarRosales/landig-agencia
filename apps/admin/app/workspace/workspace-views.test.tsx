import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { WorkspaceDashboardView } from "./workspace-dashboard-view";
import { ProductsView } from "./products/products-view";

afterEach(() => {
  cleanup();
});

describe("Workspace UI Views & Components (Mobile First & DSN-001)", () => {
  describe("WorkspaceDashboardView", () => {
    it("renders tenant name and plan badge cleanly", () => {
      render(
        <WorkspaceDashboardView
          initialData={{
            tenant: {
              id: "client-test",
              name: "Cafetería Especial",
              slug: "cafeteria-especial",
              planName: "Plan Pro",
              currency: "COP",
              logoUrl: null,
            },
            metrics: {
              productsCount: 12,
              contactsCount: 45,
              ordersCount: 8,
              storageBytesUsed: 204800,
              storageQuotaBytes: 1073741824,
            },
            bot: {
              preset: "natural_rhythm",
              remindersEnabled: true,
              faqsCount: 3,
            },
          }}
        />,
      );

      expect(screen.getByText("Cafetería Especial")).toBeDefined();
      expect(screen.getByText("Plan Pro")).toBeDefined();
      expect(screen.getByText("Moneda Operativa: COP")).toBeDefined();
      expect(screen.queryByText(/Nodo Celular/i)).toBeNull();
      expect(screen.getByText("12")).toBeDefined();
      expect(screen.getByText("45")).toBeDefined();
      expect(screen.getByText("8")).toBeDefined();
    });

    it("renders commercial logo when logoUrl is provided and falls back safely on error", () => {
      render(
        <WorkspaceDashboardView
          initialData={{
            tenant: {
              id: "client-logo",
              name: "Tienda Aurora",
              slug: "tienda-aurora",
              planName: "Plan Pro",
              currency: "USD",
              logoUrl: "https://media.mocter.co/logo.png",
            },
            metrics: {
              productsCount: 1,
              contactsCount: 2,
              ordersCount: 3,
              storageBytesUsed: 0,
              storageQuotaBytes: null,
            },
            bot: {
              preset: "natural_rhythm",
              remindersEnabled: false,
              faqsCount: 0,
            },
          }}
        />,
      );

      const img = screen.getByAltText("Tienda Aurora") as HTMLImageElement;
      expect(img).toBeDefined();
      expect(img.getAttribute("src")).toBe("https://media.mocter.co/logo.png");

      fireEvent.error(img);
      expect(screen.queryByAltText("Tienda Aurora")).toBeNull();
    });

    it("renders quick action links to catalog and contacts", () => {
      render(<WorkspaceDashboardView initialData={null} />);
      expect(screen.getByText("Nuevo Producto")).toBeDefined();
      expect(screen.getByText("Ajustes Bot")).toBeDefined();
    });
  });

  describe("ProductsView", () => {
    it("renders empty state when there are no products", () => {
      render(<ProductsView initialProducts={[]} />);
      expect(screen.getByText("No Tienes Productos Registrados")).toBeDefined();
      expect(screen.getByText("Registrar Primer Producto")).toBeDefined();
    });

    it("renders table with product details when products exist", () => {
      render(
        <ProductsView
          initialProducts={[
            {
              id: "prod-1",
              name: "Café Molido Gourmet",
              description: "Tostión media, notas a caramelo.",
              priceCents: 28000,
              currency: "COP",
              sku: "CF-MOL",
              category: "Bebidas",
              status: "published",
              availability: "in_stock",
              mediaUrls: ["https://media.mocter.co/test.webp"],
              createdAt: new Date().toISOString(),
            },
          ]}
        />,
      );

      expect(screen.getByText("Café Molido Gourmet")).toBeDefined();
      expect(screen.getByText("SKU: CF-MOL")).toBeDefined();
      expect(screen.getByText("Publicado")).toBeDefined();
      expect(screen.getByText("Subir Foto")).toBeDefined();
    });

    it("opens create product modal with Title Case labels (Rule 4.8)", () => {
      render(<ProductsView initialProducts={[]} />);
      const openBtn = screen.getByText("Registrar Nuevo Producto");
      fireEvent.click(openBtn);

      expect(screen.getByText("Nombre Del Producto *")).toBeDefined();
      expect(screen.getByText("Descripción Del Producto")).toBeDefined();
      expect(screen.getByText("Precio En Pesos *")).toBeDefined();
      expect(screen.getByText("Mejorar Con AI")).toBeDefined();
    });
  });
});

