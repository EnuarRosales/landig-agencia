import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceDashboardView } from "./workspace-dashboard-view";
import { ProductsView } from "./products/products-view";
import { BillingView } from "./billing/billing-view";
import { TenantWorkspaceShell } from "@/components/tenant-workspace-shell";

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

    it("renders CatalogQuotaBanner with real product usage and exhaustion warning when limit reached (SPEC-03 T-06)", () => {
      render(
        <ProductsView
          initialProducts={[
            {
              id: "prod-1",
              name: "Producto 1",
              description: "Desc",
              priceCents: 10000,
              currency: "COP",
              sku: null,
              category: null,
              status: "published",
              availability: "in_stock",
              mediaUrls: [],
              createdAt: new Date().toISOString(),
            },
          ]}
          initialBilling={{
            plan: {
              id: "p1",
              code: "free",
              name: "Plan Gratuito",
              description: "Básico",
              priceMonthlyCents: 0,
              priceAnnualCents: 0,
              currency: "COP",
              trialDays: 14,
              lifecycleStatus: "activo",
            },
            quotas: [
              { dimension: "products", label: "Productos Del Catálogo", used: 1, limit: 1, unit: "productos", mode: "LIMITED", source: "plan" },
              { dimension: "storage_bytes", label: "Almacenamiento Multimedia", used: 1048576, limit: 104857600, unit: "bytes", mode: "LIMITED", source: "plan" },
            ],
            mediaLimits: {
              imagesPerProduct: { dimension: "images_per_product", label: "Imágenes Por Producto", mode: "LIMITED", value: 3, source: "plan" },
              videosPerProduct: { dimension: "videos_per_product", label: "Videos Por Producto", mode: "LIMITED", value: 0, source: "plan" },
              audiosPerProduct: { dimension: "audios_per_product", label: "Pistas De Audio Por Producto", mode: "LIMITED", value: 2, source: "plan" },
              pdfsPerProduct: { dimension: "pdfs_per_product", label: "Archivos PDF Por Producto", mode: "LIMITED", value: 1, source: "plan" },
            },
            retentionDays: { dimension: "chat_retention_days", label: "Retención De Conversaciones", mode: "LIMITED", value: 30, source: "plan" },
            capabilities: {},
            capabilityDetails: [],
          }}
        />,
      );

      expect(screen.getByTestId("catalog-quota-banner")).toBeDefined();
      expect(screen.getByText(/1 \/ 1/)).toBeDefined();
      expect(screen.getByText(/Límite de productos alcanzado/i)).toBeDefined();
      expect(screen.getByText("No incluido en tu plan")).toBeDefined();
    });
  });

  describe("BillingView (SPEC-03 T-06)", () => {
    it("renders plan summary, all quota cards, audio limits, and capability matrix without leaked codes", () => {
      render(
        <BillingView
          initialBilling={{
            plan: {
              id: "plan-growth",
              code: "growth",
              name: "Plan Crecimiento",
              description: "Operación multicanal",
              priceMonthlyCents: 14900000,
              priceAnnualCents: 149000000,
              currency: "COP",
              trialDays: 14,
              lifecycleStatus: "activo",
            },
            quotas: [
              { dimension: "products", label: "Productos Del Catálogo", used: 12, limit: 100, unit: "productos", mode: "LIMITED", source: "plan" },
              { dimension: "contacts", label: "Contactos CRM", used: 50, limit: null, unit: "contactos", mode: "UNLIMITED", source: "plan" },
            ],
            mediaLimits: {
              imagesPerProduct: { dimension: "images_per_product", label: "Imágenes Por Producto", mode: "LIMITED", value: 10, source: "plan" },
              videosPerProduct: { dimension: "videos_per_product", label: "Videos Por Producto", mode: "LIMITED", value: 0, source: "plan" },
              audiosPerProduct: { dimension: "audios_per_product", label: "Pistas De Audio Por Producto", mode: "LIMITED", value: 3, source: "plan" },
              pdfsPerProduct: { dimension: "pdfs_per_product", label: "Archivos PDF Por Producto", mode: "LIMITED", value: 2, source: "plan" },
            },
            retentionDays: { dimension: "chat_retention_days", label: "Retención De Conversaciones", mode: "LIMITED", value: 90, source: "plan" },
            capabilities: { channel_whatsapp: true, crm: false },
            capabilityDetails: [
              { code: "channel_whatsapp", label: "WhatsApp Business", description: "Canal oficial", category: "channels", enabled: true },
              { code: "crm", label: "CRM Comercial", description: "Pipeline", category: "team", enabled: false },
            ],
          }}
        />,
      );

      expect(screen.getByText("Plan Crecimiento")).toBeDefined();
      expect(screen.getByText("Productos Del Catálogo")).toBeDefined();
      expect(screen.getByText("Pistas De Audio Por Producto")).toBeDefined();
      expect(screen.getByText("WhatsApp Business")).toBeDefined();
      expect(screen.getByText("CRM Comercial")).toBeDefined();
      expect(screen.getByText("Incluida")).toBeDefined();
      expect(screen.getAllByText("No incluido en tu plan").length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("SPEC-04 T-07: BillingCheckoutPanel, Bre-B QR Flow & Expiration Banner", () => {
    it("renders plan selector, generates Bre-B dynamic QR, and uploads payment voucher", async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url === "/api/billing/checkout") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              data: {
                gateway: "bre_b",
                invoiceId: "inv-breb-1",
                invoiceNumber: "INV-2026-0001",
                reference: "MOCTER-INV-1",
                amountCents: 14900000,
                currency: "COP",
                recipientName: "Mocter SAS",
                keyType: "NIT",
                keyValue: "901234567",
                qrPayload: "000201010212...",
                qrSvgDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
                amountFormattedCop: "$ 149.000 COP",
              },
            }),
          };
        }
        if (url === "/api/tenant/billing/bre-b/report") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              data: { id: "rep-1", status: "pending_review" },
            }),
          };
        }
        return { ok: true, json: async () => ({ ok: true, data: null }) };
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      render(
        <BillingView
          initialBilling={{
            tenant: {
              id: "client-co-1",
              country: "CO",
              currency: "COP",
              locale: "es",
              email: "owner@comercio.co",
            },
            subscription: {
              id: "sub-1",
              status: "trial",
              cycle: "monthly",
              gateway: "bre_b",
              trialEndsAt: "2026-11-20T00:00:00.000Z",
              currentPeriodEnd: "2026-11-20T00:00:00.000Z",
              expiresAt: "2026-11-20T00:00:00.000Z",
              daysRemaining: 4,
              pendingUpgradePlanId: null,
              pendingUpgradeCycle: null,
            },
            pendingBreBReport: null,
            latestRejectedBreBReport: null,
            availablePlans: [
              {
                id: "plan-starter",
                code: "starter",
                name: "Inicio Rápido",
                description: "Ideal para comenzar",
                priceMonthlyCents: 3900000,
                priceAnnualCents: 39000000,
                currency: "COP",
                trialDays: 14,
                isPopular: false,
              },
              {
                id: "plan-growth",
                code: "growth",
                name: "Plan Crecimiento",
                description: "Operación multicanal",
                priceMonthlyCents: 14900000,
                priceAnnualCents: 149000000,
                currency: "COP",
                trialDays: 14,
                isPopular: true,
              },
            ],
            availableChannels: [
              {
                id: "bre_b",
                displayName: "Bre-B Colombia",
                currency: "COP",
                manualVerification: true,
              },
            ],
            plan: {
              id: "plan-starter",
              code: "starter",
              name: "Inicio Rápido",
              description: "Ideal para comenzar",
              priceMonthlyCents: 3900000,
              priceAnnualCents: 39000000,
              currency: "COP",
              trialDays: 14,
              lifecycleStatus: "activo",
            },
            quotas: [],
            mediaLimits: {
              imagesPerProduct: { dimension: "images_per_product", label: "Imágenes", mode: "LIMITED", value: 3, source: "plan" },
              videosPerProduct: { dimension: "videos_per_product", label: "Videos", mode: "LIMITED", value: 0, source: "plan" },
              audiosPerProduct: { dimension: "audios_per_product", label: "Audios", mode: "LIMITED", value: 1, source: "plan" },
              pdfsPerProduct: { dimension: "pdfs_per_product", label: "PDFs", mode: "LIMITED", value: 1, source: "plan" },
            },
            retentionDays: { dimension: "chat_retention_days", label: "Retención", mode: "LIMITED", value: 30, source: "plan" },
            capabilities: {},
            capabilityDetails: [],
          }}
        />,
      );

      expect(screen.getByTestId("billing-checkout-panel")).toBeDefined();
      expect(screen.queryByRole("button", { name: "Comenzar Periodo De Prueba" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Plan Crecimiento/i }));
      fireEvent.click(screen.getByRole("button", { name: "Generar Orden De Pago" }));

      await waitFor(() => {
        expect(screen.getByTestId("breb-qr-checkout-card")).toBeDefined();
      });

      expect(screen.getByText("Mocter SAS")).toBeDefined();
      expect(screen.getByText("901234567")).toBeDefined();
      expect(screen.getAllByText("$ 149.000 COP").length).toBeGreaterThanOrEqual(2);

      const fileInput = screen.getByLabelText(/Comprobante De Transferencia/i) as HTMLInputElement;
      const voucherFile = new File(["fake-png"], "comprobante.png", { type: "image/png" });
      fireEvent.change(fileInput, { target: { files: [voucherFile] } });

      fireEvent.click(screen.getByRole("button", { name: "Reportar Pago" }));

      await waitFor(() => {
        expect(screen.getByTestId("breb-pending-banner")).toBeDefined();
      });
    });

    it("renders expiration banner inside TenantWorkspaceShell when <= 5 days remain and omits CTA when Bre-B pending", () => {
      render(
        <TenantWorkspaceShell
          tenant={{ id: "c1", name: "Tienda Demo", slug: "tienda-demo", planName: "Pro" }}
          subscriptionAlert={{
            status: "trial",
            expiresAt: "2026-11-18T00:00:00.000Z",
            daysRemaining: 4,
            pendingBreBReview: false,
          }}
        >
          <div>Contenido</div>
        </TenantWorkspaceShell>,
      );

      expect(screen.getByTestId("subscription-expiration-banner")).toBeDefined();
      expect(screen.getByText("Tu Suscripción Vence Pronto")).toBeDefined();
      expect(screen.getByRole("link", { name: "Renovar o Mejorar Plan" })).toBeDefined();

      cleanup();

      render(
        <TenantWorkspaceShell
          tenant={{ id: "c1", name: "Tienda Demo", slug: "tienda-demo", planName: "Pro" }}
          subscriptionAlert={{
            status: "active",
            expiresAt: "2026-11-14T00:00:00.000Z",
            daysRemaining: 0,
            pendingBreBReview: true,
          }}
        >
          <div>Contenido</div>
        </TenantWorkspaceShell>,
      );

      expect(screen.getByText("Tu Suscripción Vence Hoy")).toBeDefined();
      expect(screen.queryByRole("link", { name: "Renovar o Mejorar Plan" })).toBeNull();
    });

    it("locks sidebar navigation to /workspace/billing when subscriptionExpiredLocked is true", () => {
      render(
        <TenantWorkspaceShell
          tenant={{ id: "c1", name: "Tienda Demo", slug: "tienda-demo", planName: "Pro" }}
          subscriptionAlert={{
            status: "expired",
            expiresAt: "2026-11-10T00:00:00.000Z",
            daysRemaining: 0,
            pendingBreBReview: false,
            subscriptionExpiredLocked: true,
          }}
        >
          <div>Contenido</div>
        </TenantWorkspaceShell>,
      );

      expect(screen.getByText("Tu Suscripción Ha Vencido")).toBeDefined();
      expect(screen.getByText("Mi Plan Y Cuotas")).toBeDefined();
      expect(screen.queryByText("Productos Y Catálogo")).toBeNull();
      expect(screen.queryByText("Tablero")).toBeNull();
    });
  });
});

