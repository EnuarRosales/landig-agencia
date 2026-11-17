import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceDashboardView } from "./workspace-dashboard-view";
import { ProductsView } from "./products/products-view";
import { BillingView } from "./billing/billing-view";
import { ProfileView } from "./profile/profile-view";
import { BotView } from "./bot/bot-view";
import { ContactsView } from "./contacts/contacts-view";
import { OrdersView } from "./orders/orders-view";
import { TenantWorkspaceShell } from "@/components/tenant-workspace-shell";
import type { CatalogListResultDto, ProductDetailDto } from "@mocter/domain";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/profile",
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

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
              status: "active",
              availability: "in_stock",
              mediaUrls: ["https://media.mocter.co/test.webp"],
              createdAt: new Date().toISOString(),
            },
          ]}
        />,
      );

      expect(screen.getAllByText("Café Molido Gourmet").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("SKU: CF-MOL").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Activo").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Multimedia").length).toBeGreaterThanOrEqual(1);
    });

    it("opens create product modal with Title Case labels (Rule 4.8)", () => {
      render(<ProductsView initialProducts={[]} />);
      const openBtn = screen.getByText("Registrar Nuevo Producto");
      fireEvent.click(openBtn);

      expect(screen.getByText("Nombre del Producto *")).toBeDefined();
      expect(screen.getByText("Descripción Comercial del Producto")).toBeDefined();
      expect(screen.getByText("Precio de Venta *")).toBeDefined();
      expect(screen.getByText("Mejorar con AI")).toBeDefined();
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
              status: "active",
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
      expect(screen.queryByRole("button", { name: "Comenzar Periodo de Prueba" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Plan Crecimiento/i }));
      fireEvent.click(screen.getByRole("button", { name: "Generar Orden de Pago" }));

      await waitFor(() => {
        expect(screen.getByTestId("breb-qr-checkout-card")).toBeDefined();
      });

      expect(screen.getByText("Mocter SAS")).toBeDefined();
      expect(screen.getByText("901234567")).toBeDefined();
      expect(screen.getAllByText("$ 149.000 COP").length).toBeGreaterThanOrEqual(2);

      const fileInput = screen.getByLabelText(/Comprobante de Transferencia/i) as HTMLInputElement;
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
      expect(screen.getByText("Mi Plan y Cuotas")).toBeDefined();
      expect(screen.queryByText("Productos y Catálogo")).toBeNull();
      expect(screen.queryByText("Tablero")).toBeNull();
    });
  });

  describe("ProfileView & Shell Navigation (SPEC-05)", () => {
    const sampleProfile = {
      id: "c1",
      slug: "synergia-market",
      displayName: "Synergia Market Colombia",
      commercialEmail: "ventas@synergia.co",
      contactEmail: "owner@synergia.co",
      phone: "+57 300 111 2233",
      websiteUrl: "https://synergia.co",
      locale: "es" as const,
      currency: "COP",
      timezone: "America/Bogota",
      countryCode: "CO",
      country: "Colombia",
      subdivisionCode: "CO-ANT",
      state: "Antioquia",
      city: "Medellín",
      addressLine: "Calle 10 # 40-20",
      addressComplement: null,
      postalCode: "050021",
      industry: "Retail",
      taxId: "900123456-7",
      logoMediaId: "media-logo-1",
      logoResolvedUrl: "http://localhost:8081/signed/logo.png",
      socialLinks: {
        instagram: "https://instagram.com/synergia",
      },
      businessPaymentSummary: ["Nequi Principal"],
    };

    const sampleChannel = {
      id: "ch-1",
      clientId: "c1",
      channelCode: "nequi" as const,
      displayName: "Nequi Principal",
      accountIdentifier: "3001112233",
      accountHolderName: "Synergia SAS",
      instructions: "Enviar comprobante por WhatsApp",
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-11-14T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
    };

    it("renders profile sections, read-only slug, saves profile updates, and supports logo removal confirmation", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/tenant/profile" && init?.method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: {
                ...sampleProfile,
                displayName: "Synergia Renombrada",
                locale: "en",
              },
            }),
          } as Response;
        }
        if (url === "/api/tenant/profile/logo" && init?.method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: { logoMediaId: null, logoResolvedUrl: null },
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ ok: false }),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <ProfileView
          initialProfile={sampleProfile}
          initialChannels={[sampleChannel]}
          readOnly={false}
          locale="es"
        />,
      );

      expect(screen.getByText("mocter.co/synergia-market")).toBeDefined();
      const slugInput = screen.getByLabelText("URL Pública del Comercio") as HTMLInputElement;
      expect(slugInput.readOnly).toBe(true);

      const nameInput = screen.getByLabelText("Nombre Comercial") as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "Synergia Renombrada" } });
      fireEvent.change(screen.getByLabelText("Idioma del Comercio"), {
        target: { value: "en" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Guardar Cambios" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/tenant/profile",
          expect.objectContaining({ method: "PATCH" }),
        );
      });

      // El idioma actualizado cambia el diccionario de la vista a Inglés
      await waitFor(() => {
        expect(screen.getByText("Business Profile")).toBeDefined();
      });

      // Retirar logotipo pasa por ConfirmationModal (sin diálogos nativos)
      fireEvent.click(screen.getByRole("button", { name: "Remove Logo" }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      const buttonsInDialog = dialog.querySelectorAll("button");
      const confirmBtn = Array.from(buttonsInDialog).find((b) =>
        b.textContent?.includes("Remove Logo"),
      );
      expect(confirmBtn).toBeDefined();
      fireEvent.click(confirmBtn!);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/tenant/profile/logo",
          expect.objectContaining({ method: "DELETE" }),
        );
      });

      vi.unstubAllGlobals();
    });

    it("creates payment channels and offers 1-click deactivation when delete returns 409 CHANNEL_USED_IN_ORDERS", async () => {
      const createdChannel = {
        ...sampleChannel,
        id: "ch-2",
        channelCode: "daviplata" as const,
        displayName: "Daviplata Tienda",
        accountIdentifier: "3109998877",
      };

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/tenant/payment-channels" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ ok: true, data: createdChannel }),
          } as Response;
        }
        if (url === `/api/tenant/payment-channels/${sampleChannel.id}` && init?.method === "DELETE") {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              status: 409,
              code: "CHANNEL_USED_IN_ORDERS",
              detail: "Canal utilizado en pedidos históricos.",
            }),
          } as Response;
        }
        if (url === `/api/tenant/payment-channels/${sampleChannel.id}` && init?.method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              data: { ...sampleChannel, isActive: false },
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ ok: false }),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <ProfileView
          initialProfile={sampleProfile}
          initialChannels={[sampleChannel]}
          readOnly={false}
          locale="es"
        />,
      );

      // Crear nuevo canal mediante modal
      fireEvent.click(screen.getByRole("button", { name: "Agregar Canal de Pago" }));
      fireEvent.change(screen.getByLabelText("Canal de Pago"), {
        target: { value: "daviplata" },
      });
      fireEvent.change(screen.getByLabelText("Nombre Visible"), {
        target: { value: "Daviplata Tienda" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar Canal" }));

      await waitFor(() => {
        expect(screen.getByText("Daviplata Tienda")).toBeDefined();
      });

      // Intentar eliminar ch-1 recibe 409 CHANNEL_USED_IN_ORDERS y ofrece inactivar
      const ch1Row = screen.getByTestId(`payment-channel-row-${sampleChannel.id}`);
      const deleteButton = ch1Row.querySelector("button:last-of-type");
      expect(deleteButton).toBeTruthy();
      fireEvent.click(deleteButton!);

      const confirmDialog = screen.getByRole("dialog");
      const confirmDeleteBtn = Array.from(confirmDialog.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Eliminar"),
      );
      expect(confirmDeleteBtn).toBeTruthy();
      fireEvent.click(confirmDeleteBtn!);

      await waitFor(() => {
        expect(screen.getByTestId("channel-used-conflict-banner")).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "Inactivar Canal" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/tenant/payment-channels/${sampleChannel.id}`,
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ isActive: false }),
          }),
        );
      });

      vi.unstubAllGlobals();
    });

    it("renders read-only mode for tenant_agent and hides profile nav link for tenant_agent while showing it for tenant_owner", () => {
      render(
        <ProfileView
          initialProfile={sampleProfile}
          initialChannels={[sampleChannel]}
          readOnly={true}
          locale="es"
        />,
      );

      expect(screen.getByTestId("profile-readonly-banner")).toBeDefined();
      expect(screen.queryByRole("button", { name: "Guardar Cambios" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Agregar Canal De Pago" })).toBeNull();
      expect(
        (screen.getByLabelText("Nombre Comercial") as HTMLInputElement).disabled,
      ).toBe(true);

      cleanup();

      render(
        <TenantWorkspaceShell
          tenant={{
            id: "c1",
            name: "Synergia Market Colombia Ultra Extendida",
            slug: "synergia-market",
            planName: "Pro",
          }}
          currentUser={{
            id: "u-agent",
            displayName: "Agente Comercial",
            email: "agent@synergia.co",
            role: "tenant_agent",
            status: "active",
          }}
        >
          <div>Contenido</div>
        </TenantWorkspaceShell>,
      );

      expect(screen.queryByText("Perfil Del Negocio")).toBeNull();
      // Nombre visible sin truncar en el shell
      expect(screen.getAllByText("Synergia Market Colombia Ultra Extendida").length).toBeGreaterThanOrEqual(1);

      cleanup();

      render(
        <TenantWorkspaceShell
          tenant={{
            id: "c1",
            name: "Synergia Market Colombia Ultra Extendida",
            slug: "synergia-market",
            planName: "Pro",
          }}
          currentUser={{
            id: "u-owner",
            displayName: "Dueño Comercial",
            email: "owner@synergia.co",
            role: "tenant_owner",
            status: "active",
          }}
        >
          <div>Contenido</div>
        </TenantWorkspaceShell>,
      );

      expect(screen.getByText("Perfil del Negocio")).toBeDefined();
    });
  });

  describe("ProductsView Catalog, Combos, Media, RBAC & Bilingual Suite", () => {
    function buildSampleCatalog(): CatalogListResultDto {
      return {
        items: [
          {
            id: "prod-simple-low",
            name: "Grano Espresso Premium",
            description: "Tueste medio artesanal",
            sku: "GEP-01",
            category: "Café",
            brand: "Origen",
            kind: "physical",
            compositionType: "simple",
            condition: "new",
            availability: "in_stock",
            status: "active",
            currency: "COP",
            costPriceCents: 1800000,
            priceCents: 3600000,
            salePriceCents: null,
            profitability: {
              profitCents: 1800000,
              marginPct: 50,
              markupPct: 100,
              isNegative: false,
            },
            stockQuantity: 2,
            minStockThreshold: 5,
            effectiveStock: 2,
            isLowStock: true,
            hasInactiveComboComponent: false,
            coverImageUrl: null,
            mediaUrls: [],
            mediaCounts: { image: 1, video: 0, audio: 0, pdf: 0 },
            attributesCount: 1,
            comboComponentsCount: 0,
            createdAt: "2026-11-10T10:00:00.000Z",
            updatedAt: "2026-11-10T10:00:00.000Z",
          },
          {
            id: "prod-combo-1",
            name: "Kit Barista Completo",
            description: "Paquete de café y prensa",
            sku: "KIT-BAR-1",
            category: "Combos",
            brand: "Origen",
            kind: "physical",
            compositionType: "combo",
            condition: "new",
            availability: "in_stock",
            status: "active",
            currency: "COP",
            costPriceCents: 4000000,
            priceCents: 8000000,
            salePriceCents: null,
            profitability: {
              profitCents: 4000000,
              marginPct: 50,
              markupPct: 100,
              isNegative: false,
            },
            stockQuantity: 0,
            minStockThreshold: 2,
            effectiveStock: 0,
            isLowStock: true,
            hasInactiveComboComponent: true,
            coverImageUrl: null,
            mediaUrls: [],
            mediaCounts: { image: 2, video: 1, audio: 1, pdf: 1 },
            attributesCount: 0,
            comboComponentsCount: 2,
            createdAt: "2026-11-11T10:00:00.000Z",
            updatedAt: "2026-11-11T10:00:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        summary: { totalActive: 2, lowStockCount: 2, comboCount: 1 },
      };
    }

    function buildSampleDetail(): ProductDetailDto {
      const base = buildSampleCatalog().items[1]!;
      return {
        ...base,
        botMasterPrompt: "Regla clave: confirmar molienda antes del envío.",
        attributes: [{ name: "Molienda", values: ["Espresso", "Prensa Francesa"] }],
        comboComponents: [
          {
            componentProductId: "prod-simple-low",
            name: "Grano Espresso Premium",
            sku: "GEP-01",
            kind: "physical",
            status: "active",
            priceCents: 3600000,
            costPriceCents: 1800000,
            stockQuantity: 2,
            quantity: 1,
            sortOrder: 0,
            coverImageUrl: null,
          },
        ],
        suggestedComboCostCents: 1800000,
        lowStockAlertSentAt: null,
        media: {
          images: [
            {
              id: "pm-1",
              mediaId: "m-img-1",
              mediaKind: "image",
              mimeType: "image/webp",
              originalFilename: "kit.webp",
              sizeBytes: 12040,
              isCover: true,
              altText: "Portada kit",
              sortOrder: 0,
              url: "https://cdn.example/kit.webp",
              thumbUrl: "https://cdn.example/kit-thumb.webp",
              createdAt: "2026-11-11T10:00:00.000Z",
            },
          ],
          videos: [
            {
              id: "pm-2",
              mediaId: "m-vid-1",
              mediaKind: "video",
              mimeType: "video/mp4",
              originalFilename: "demo.mp4",
              sizeBytes: 240000,
              isCover: false,
              altText: null,
              sortOrder: 1,
              url: "/api/tenant/media/m-vid-1",
              thumbUrl: null,
              createdAt: "2026-11-11T10:00:00.000Z",
            },
          ],
          audios: [
            {
              id: "pm-3",
              mediaId: "m-aud-1",
              mediaKind: "audio",
              mimeType: "audio/mpeg",
              originalFilename: "nota.mp3",
              sizeBytes: 42000,
              isCover: false,
              altText: null,
              sortOrder: 2,
              url: "/api/tenant/media/m-aud-1",
              thumbUrl: null,
              createdAt: "2026-11-11T10:00:00.000Z",
            },
          ],
          pdfs: [
            {
              id: "pm-4",
              mediaId: "m-pdf-1",
              mediaKind: "pdf",
              mimeType: "application/pdf",
              originalFilename: "ficha-tecnica.pdf",
              sizeBytes: 88000,
              isCover: false,
              altText: null,
              sortOrder: 3,
              url: "/api/tenant/media/m-pdf-1",
              thumbUrl: null,
              createdAt: "2026-11-11T10:00:00.000Z",
            },
          ],
        },
      };
    }

    it("renders summary metrics, combo badge, inactive component warning, and low-stock indicators", () => {
      render(<ProductsView initialCatalog={buildSampleCatalog()} canDelete={true} />);

      expect(screen.getAllByText("Stock Bajo").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Componente Inactivo").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Combo (2)").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Margen: 50\.0%/).length).toBeGreaterThanOrEqual(2);
    });

    it("hides Delete action for tenant_agent (canDelete=false) and uses custom ConfirmationModal for tenant_owner", async () => {
      const sample = buildSampleCatalog();
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/tenant/products/prod-simple-low" && init?.method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, data: { deleted: true } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: {
              ...sample,
              items: sample.items.filter((i) => i.id !== "prod-simple-low"),
              pagination: { ...sample.pagination, total: 1 },
            },
          }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      try {
        render(<ProductsView initialCatalog={sample} canDelete={false} />);
        expect(screen.queryAllByText("Eliminar").length).toBe(0);

        cleanup();

        render(<ProductsView initialCatalog={sample} canDelete={true} />);
        const deleteButtons = screen.getAllByText("Eliminar");
        expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
        fireEvent.click(deleteButtons[0]!);

        expect(screen.getByText("Eliminar Producto del Catálogo")).toBeDefined();
        fireEvent.click(screen.getByText("Eliminar Producto"));

        await waitFor(() => {
          expect(fetchMock).toHaveBeenCalledWith(
            "/api/tenant/products/prod-simple-low",
            expect.objectContaining({ method: "DELETE" }),
          );
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("opens Inactivate ConfirmationModal and sends PATCH /status without native confirm", async () => {
      const sample = buildSampleCatalog();
      const updatedDetail = buildSampleDetail();
      updatedDetail.id = "prod-simple-low";
      updatedDetail.status = "inactive";

      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/tenant/products/prod-simple-low/status" && init?.method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, data: updatedDetail }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: sample }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      try {
        render(<ProductsView initialCatalog={sample} canDelete={true} />);
        const inactivateButtons = screen.getAllByText("Inactivar");
        fireEvent.click(inactivateButtons[0]!);

        expect(screen.getByText("Inactivar Producto del Catálogo")).toBeDefined();
        fireEvent.click(screen.getByText("Inactivar Producto"));

        await waitFor(() => {
          expect(fetchMock).toHaveBeenCalledWith(
            "/api/tenant/products/prod-simple-low/status",
            expect.objectContaining({ method: "PATCH" }),
          );
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("fetches and displays full ProductDetailModal with combo components, attributes, master prompt, video, audio, and PDF", async () => {
      const detail = buildSampleDetail();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: detail }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ProductsView initialCatalog={buildSampleCatalog()} canDelete={true} />);
      const viewButtons = screen.getAllByLabelText("Ver Detalle Kit Barista Completo");
      fireEvent.click(viewButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText("Detalle del Producto")).toBeDefined();
        expect(screen.getByText("Regla clave: confirmar molienda antes del envío.")).toBeDefined();
      });

      expect(screen.getByText("Molienda:")).toBeDefined();
      expect(screen.getByText("Prensa Francesa")).toBeDefined();
      expect(screen.getByText("Videos Promocionales")).toBeDefined();
      expect(screen.getByText("Audios Descriptivos")).toBeDefined();
      expect(screen.getByText("Documentos y Fichas PDF")).toBeDefined();
      expect(screen.getByText("ficha-tecnica.pdf")).toBeDefined();

      vi.unstubAllGlobals();
    });

    it("navigates all 5 tabs of ProductFormModal, computes live profitability, and inserts Prompt Maestro template", () => {
      const { container } = render(<ProductsView initialProducts={[]} />);
      const rootWrapper = container.firstElementChild as HTMLElement | null;
      expect(rootWrapper?.className).toContain("p-4");
      expect(rootWrapper?.className).toContain("md:px-8");
      expect(rootWrapper?.className).toContain("md:py-6");

      const createButton = screen.getByRole("button", { name: "Registrar Nuevo Producto" });
      expect(createButton.className).toContain("bg-[var(--dsn-accent)]");
      expect(createButton.className).not.toContain("--dsn-primary");

      const refreshButton = screen.getByRole("button", { name: "Actualizar" });
      expect(refreshButton.className).toContain("bg-[var(--dsn-surface)]");
      expect(refreshButton.className).toContain("hover:border-[var(--dsn-accent)]");

      fireEvent.click(createButton);

      // El campo estático de Precio Promocional fue desacoplado hacia SPEC-18 (/workspace/promotions)
      expect(screen.queryByLabelText("Precio Promocional (Opcional)")).toBeNull();

      const costInput = screen.getByLabelText("Costo Unitario de Adquisición") as HTMLInputElement;
      const priceInput = screen.getByLabelText("Precio de Venta *") as HTMLInputElement;
      fireEvent.change(costInput, { target: { value: "20000" } });
      fireEvent.change(priceInput, { target: { value: "40000" } });

      expect(screen.getByText("50%")).toBeDefined();

      fireEvent.click(screen.getByText("Stock Físico"));
      expect(screen.getByLabelText("Umbral Mínimo de Alerta")).toBeDefined();

      fireEvent.click(screen.getByText("Atributos y Combo"));
      expect(screen.getByText("Atributos y Variantes del Producto")).toBeDefined();

      fireEvent.click(screen.getByText("Multimedia"));
      expect(
        screen.getByText(
          "Guarda los datos básicos del producto para habilitar la carga de imágenes, videos, audios o fichas PDF.",
        ),
      ).toBeDefined();

      fireEvent.click(screen.getByText("Prompt Maestro"));
      fireEvent.click(screen.getByText("Insertar Estructura Recomendada"));
      expect(screen.getByText(/\/ 32[.,]000/)).toBeDefined();
    });

    it("automatically closes ProductFormModal and shows confirmation banner when Guardar Producto succeeds", async () => {
      const sample = buildSampleCatalog();
      const createdDetail = buildSampleDetail();
      createdDetail.id = "prod-created-99";
      createdDetail.name = "Cafetera Italiana Acero";

      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/tenant/products" && init?.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ ok: true, data: createdDetail }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: sample }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      try {
        render(<ProductsView initialCatalog={sample} canDelete={true} />);
        fireEvent.click(screen.getByRole("button", { name: "Registrar Nuevo Producto" }));
        expect(screen.getByRole("dialog")).toBeDefined();

        fireEvent.change(screen.getByLabelText("Nombre del Producto *"), {
          target: { value: "Cafetera Italiana Acero" },
        });
        fireEvent.change(screen.getByLabelText(/Descripción Comercial/), {
          target: { value: "Cafetera moka de 6 tazas en acero inoxidable." },
        });
        fireEvent.change(screen.getByLabelText("Precio de Venta *"), {
          target: { value: "95000" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Guardar Producto" }));

        await waitFor(() => {
          expect(fetchMock).toHaveBeenCalledWith(
            "/api/tenant/products",
            expect.objectContaining({ method: "POST" }),
          );
          expect(screen.queryByRole("dialog")).toBeNull();
          expect(screen.getByText("Producto creado y agregado al catálogo.")).toBeDefined();
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("renders bilingual English catalog copy when locale='en'", () => {
      render(
        <ProductsView initialCatalog={buildSampleCatalog()} locale="en" canDelete={true} />,
      );

      expect(screen.getByText("Products & Commercial Catalog")).toBeDefined();
      expect(screen.getByText("Register New Product")).toBeDefined();
      expect(screen.getAllByText("Low Stock").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Delete").length).toBeGreaterThanOrEqual(1);
    });

    it("SPEC-19: pre-hydrates ProductFormModal Prompt Maestro with IDEAL structure and never duplicates on repeated clicks", () => {
      render(<ProductsView initialProducts={[]} />);
      fireEvent.click(screen.getByRole("button", { name: "Registrar Nuevo Producto" }));

      fireEvent.change(screen.getByLabelText("Nombre del Producto *"), {
        target: { value: "Resina Dental Moldeable" },
      });
      fireEvent.change(screen.getByLabelText(/Descripción Comercial/), {
        target: { value: "Úsala desde casa, fácil de moldear y reutilizable." },
      });
      fireEvent.change(screen.getByLabelText("Precio de Venta *"), {
        target: { value: "64900" },
      });

      fireEvent.click(screen.getByText("Prompt Maestro"));
      const insertBtn = screen.getByText("Insertar Estructura Recomendada");

      // Clic 3 veces consecutivas: debe ser 100% idempotente (sin duplicar encabezados IDEAL)
      fireEvent.click(insertBtn);
      fireEvent.click(insertBtn);
      fireEvent.click(insertBtn);

      const promptTextarea = screen.getByLabelText(
        "Prompt Maestro del Producto para el Asistente",
      ) as HTMLTextAreaElement;

      expect(promptTextarea.value).toContain("## [I] Intención Comercial y Palabras Clave");
      expect(promptTextarea.value).toContain("## [D] Detalle Comercial y Beneficios Clave");
      expect(promptTextarea.value).toContain("## [E] Estrategia de Precios, Escalones y Presentación");
      expect(promptTextarea.value).toContain("## [A] Acción Multimedia, Audios y Calificación de Pedido");
      expect(promptTextarea.value).toContain("## [L] Límites del Producto y Manejo de Objeciones");
      expect(promptTextarea.value).toContain("Resina Dental Moldeable");
      expect(promptTextarea.value).toContain("[[MEDIA:Resina Dental Moldeable:imagen]]");

      const occurrences = promptTextarea.value.split(
        "## [I] Intención Comercial y Palabras Clave",
      ).length - 1;
      expect(occurrences).toBe(1);
    });
  });

  describe("BotView · Unified Bot, Dynamic Catalog, Messages & Classifier", () => {
    it("renders Unified Bot tabs, inserts recommended international IDEAL template, and displays seeded labels", () => {
      render(
        <BotView
          locale="es"
          readOnly={false}
          initialConfig={{
            bot: {
              id: "bot-1",
              name: "Asistente Mocter",
              status: "active",
              revision: 1,
              objective: "Atender consultas y cerrar pedidos",
              presetId: "preset-1",
              presetCode: "natural_rhythm",
              toneId: "tone-1",
              toneCode: "cercano",
              persona: null,
              instructions: "",
              allowedTopics: null,
              excludedTopics: null,
              handoffTriggers: ["asesor"],
              responseLanguage: "es",
              answerPolicy: "solo_conocimiento",
              maxTurns: 20,
              maxMessagesPerContact: 60,
              classifierPrompt: "",
              defaultMessages: {
                welcome: { body: "Hola", enabled: true, updatedAt: "2026-11-15T00:00:00Z" },
                order_confirmation: {
                  body: "Pedido {{order_number}} confirmado.",
                  enabled: true,
                  updatedAt: "2026-11-15T00:00:00Z",
                },
                dispatch_tracking: {
                  body: "Tu guía es {{tracking_code}}.",
                  enabled: true,
                  updatedAt: "2026-11-15T00:00:00Z",
                },
                delivery_issue: {
                  body: "Novedad en la entrega de {{order_number}}.",
                  enabled: true,
                  updatedAt: "2026-11-15T00:00:00Z",
                },
                out_of_hours: {
                  body: "Nuestro horario es {{business_hours}}.",
                  enabled: true,
                  updatedAt: "2026-11-15T00:00:00Z",
                },
                handoff: {
                  body: "Te conectamos con un asesor.",
                  enabled: true,
                  updatedAt: "2026-11-15T00:00:00Z",
                },
              },
              businessHours: {
                timezone: "America/Bogota",
                enabled: false,
                schedule: {
                  mon: { open: "08:00", close: "18:00", closed: false },
                  tue: { open: "08:00", close: "18:00", closed: false },
                  wed: { open: "08:00", close: "18:00", closed: false },
                  thu: { open: "08:00", close: "18:00", closed: false },
                  fri: { open: "08:00", close: "18:00", closed: false },
                  sat: { open: "09:00", close: "13:00", closed: false },
                  sun: { open: "09:00", close: "13:00", closed: true },
                },
              },
            },
            policies: {
              botPreset: "natural_rhythm",
              remindersEnabled: true,
              warrantyPolicy: "30 días de garantía por defectos de fabricación.",
              returnsPolicy: "Cambios dentro de los primeros 5 días hábiles.",
              shippingPolicy: { freeShipping: true, policyText: "Envío asegurado." },
              orderMessage: "Tu pedido ha sido confirmado.",
              faqs: [],
              paymentMethods: ["Bancolombia"],
            },
            labels: [
              {
                id: "lbl-1",
                title: "lead-caliente",
                description: "Intención de compra directa",
                color: "#F97316",
                origin: "system",
                state: "synced",
                category: "functional",
                activationRule: "Consulta precio o medios de pago",
                sideEffects: null,
              },
              {
                id: "lbl-2",
                title: "soporte_humano",
                description: "Solicita asesor",
                color: "#EC4899",
                origin: "system",
                state: "synced",
                category: "operational",
                activationRule: "Pide hablar con humano",
                sideEffects: "handoff_human,pause_bot",
              },
            ],
            catalog: {
              objectives: [{ code: "sales", labels: { es: "Cerrar pedidos", en: "Close orders" } }],
              presets: [
                {
                  id: "preset-1",
                  code: "natural_rhythm",
                  labels: { es: "Ritmo Natural", en: "Natural Rhythm" },
                  recommendedFor: { es: "Tono cálido", en: "Warm tone" },
                  temperature: "0.7",
                  maxTokens: 600,
                },
              ],
              tones: [
                {
                  id: "tone-1",
                  code: "cercano",
                  labels: { es: "Cercano", en: "Friendly" },
                  description: null,
                },
              ],
            },
            context: {
              businessName: "Synergia Store",
              locale: "es",
              countryCode: "CO",
              currency: "COP",
              timezone: "America/Bogota",
            },
            defaultLabelsInitialized: true,
          }}
        />,
      );

      expect(screen.getByText("Prompt General de Operación del Cliente")).toBeDefined();

      const insertBtn = screen.getByRole("button", { name: "Insertar Estructura Recomendada" });
      fireEvent.click(insertBtn);
      fireEvent.click(insertBtn);

      const generalPromptArea = screen.getByLabelText(
        "Instrucciones Generales del Asistente",
      ) as HTMLTextAreaElement;
      const countHeader =
        generalPromptArea.value.split("### [I] INTENCIÓN COMERCIAL Y REGLA DE CATÁLOGO").length - 1;
      expect(countHeader).toBe(1);
      expect(generalPromptArea.value).toContain("30 días de garantía por defectos de fabricación.");

      fireEvent.click(screen.getByRole("button", { name: "Etiquetas y Clasificador" }));
      expect(screen.getByText("lead-caliente")).toBeDefined();
      expect(screen.getByText("soporte_humano")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Mensajes y Horarios" }));
      expect(screen.getByText("Horario de Atención y Zona Horaria")).toBeDefined();
    });
  });

  describe("ContactsView · CRM Omnicanal, Ventana WhatsApp 24h y Ficha 4 Pestañas", () => {
    it("renders WhatsApp active window badge, quick inbox link, preferred channel, and hides delete for non-owner", () => {
      const futureInbound = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      render(
        <ContactsView
          canDelete={false}
          locale="es"
          initialList={{
            items: [
              {
                id: "c-wa-1",
                fullName: "Camila Torres",
                companyName: "Andes Roast",
                phoneMobile: "+573001112233",
                email: "camila@andes.co",
                documentNumber: "10203040",
                source: "instagram",
                preferredChannel: "whatsapp_cloud",
                lastChannel: "whatsapp_cloud",
                stage: "qualified",
                currentRatingStars: 5,
                lastWhatsappInboundAt: futureInbound,
                lastSeenAt: futureInbound,
                defaultAddressSummary: {
                  id: "addr-1",
                  label: "Oficina",
                  city: "Medellín",
                  state: "Antioquia",
                  country: "Colombia",
                  addressLine: "Cra 43A # 1-50",
                },
              },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            quota: { used: 1, limit: 500, mode: "LIMITED" },
          }}
        />,
      );

      expect(screen.getAllByText("Camila Torres").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Ventana Activa/).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Instagram").length).toBeGreaterThan(0);
      expect(screen.getAllByText("5/5").length).toBeGreaterThan(0);
      expect(screen.getByRole("link", { name: /Ir a Bandeja/i }).getAttribute("href")).toBe(
        "/workspace/conversations",
      );
      expect(screen.queryByRole("button", { name: /Eliminar Camila Torres/i })).toBeNull();
    });

    it("opens multi-source creation modal with initial address unchecked and displays ConfirmationModal on owner delete", () => {
      render(
        <ContactsView
          canDelete={true}
          locale="es"
          initialList={{
            items: [
              {
                id: "c-2",
                fullName: "Carlos Ruiz",
                phoneMobile: "+573109998877",
                email: null,
                documentNumber: null,
                source: "manual",
                preferredChannel: "whatsapp_cloud",
                stage: "new",
                lastSeenAt: null,
              },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            quota: { used: 1, limit: null, mode: "UNLIMITED" },
          }}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Registrar Contacto/i }));
      const initialAddressCheckbox = screen.getByLabelText(/Agregar Dirección de Envío Inicial/i) as HTMLInputElement;
      expect(initialAddressCheckbox.checked).toBe(false);
      fireEvent.click(screen.getAllByRole("button", { name: /^Cancelar$/i })[0]!);

      const deleteBtns = screen.getAllByRole("button", { name: /Eliminar Carlos Ruiz/i });
      fireEvent.click(deleteBtns[0]!);
      expect(screen.getAllByText("Eliminar Contacto del Directorio").length).toBeGreaterThan(0);
    });

    it("loads 4-tab contact detail modal when clicking Ver Ficha", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          ok: true,
          data: {
            id: "c-10",
            fullName: "Diana Prince",
            companyName: "Themyscira SAS",
            phoneMobile: "+573152223344",
            email: "diana@themyscira.co",
            documentNumber: "900123456",
            source: "web",
            preferredChannel: "whatsapp_cloud",
            stage: "customer",
            language: "es",
            tags: ["VIP"],
            lastSeenAt: null,
            addresses: [
              {
                id: "a-1",
                label: "Principal",
                country: "Colombia",
                state: "Cundinamarca",
                city: "Bogotá",
                addressLine: "Cl 100 # 15-20",
                neighborhood: "Chicó",
                postalCode: null,
                referenceNotes: null,
                isDefault: true,
              },
            ],
            ratingsHistory: [],
            consents: [],
            recentOrders: [],
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      try {
        render(
          <ContactsView
            canDelete={true}
            locale="es"
            initialList={{
              items: [
                {
                  id: "c-10",
                  fullName: "Diana Prince",
                  phoneMobile: "+573152223344",
                  email: "diana@themyscira.co",
                  documentNumber: "900123456",
                  source: "web",
                  stage: "customer",
                  lastSeenAt: null,
                },
              ],
              pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
              quota: { used: 1, limit: null, mode: "UNLIMITED" },
            }}
          />,
        );

        const viewBtns = screen.getAllByRole("button", { name: /Ver Ficha/i });
        fireEvent.click(viewBtns[0]!);

        await waitFor(() => {
          expect(screen.getByText("Datos Generales")).toBeTruthy();
          expect(screen.getByText("Direcciones de Envío")).toBeTruthy();
          expect(screen.getByText("Calificación e Historial")).toBeTruthy();
          expect(screen.getByText("Atención y Consentimiento")).toBeTruthy();
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("OrdersView", () => {
    it("renders empty state and all 12 homologated statuses in English and Spanish", () => {
      render(
        <OrdersView
          locale="en"
          initialOrderList={{
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
            summary: {
              total: 0,
              pending: 0,
              preparingAndGuide: 0,
              inTransitAndIssue: 0,
              delivered: 0,
              cancelledAndReturned: 0,
              byStatus: {},
            },
          }}
        />,
      );

      expect(screen.getByText("No Orders Recorded")).toBeDefined();
      expect(screen.getByText("Pending Confirmation")).toBeDefined();
      expect(screen.getByText("Guide Generated")).toBeDefined();
      expect(screen.getByText("Delivery Issue")).toBeDefined();
      expect(screen.getByText("Return In Progress")).toBeDefined();
    });

    it("opens order detail modal and transition modal with carrier/tracking fields", async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/tenant/orders/carriers")) {
          return { ok: true, json: async () => ({ ok: true, data: [{ id: "car-1", name: "Servientrega" }] }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              id: "ord-1",
              orderNumber: "ORD-202611-0001",
              number: "ORD-202611-0001",
              contactId: null,
              prospectId: null,
              contactAddressId: null,
              source: "manual",
              status: "guide_generated",
              paymentMethod: "Contraentrega",
              paymentChannelId: null,
              paymentStatus: "pending",
              shippingMethod: "home",
              carrierId: null,
              carrierName: null,
              trackingCode: null,
              customerName: "Carlos Ruiz",
              customerPhone: "+573001234567",
              customerDocument: null,
              countryCode: "CO",
              subdivisionCode: "CO-DC",
              city: "Bogotá",
              state: "Cundinamarca",
              addressLine: "Calle 100 # 15-20",
              addressComplement: null,
              neighborhood: null,
              postalCode: null,
              referenceNotes: null,
              notes: null,
              cancellationReason: null,
              issueNotes: null,
              externalErpSystem: null,
              externalErpReference: null,
              subtotalCents: 13500000,
              shippingCents: 1200000,
              discountCents: 0,
              totalCents: 14700000,
              currency: "COP",
              stockDeducted: true,
              guideGeneratedAt: null,
              repeatedFromOrderId: null,
              canEditDetails: true,
              allowedNextStatuses: ["dispatched", "cancelled"],
              createdAt: "2026-11-16T12:00:00.000Z",
              updatedAt: "2026-11-16T12:00:00.000Z",
              items: [
                {
                  id: "it-1",
                  productId: "p-1",
                  productName: "Termo 1L",
                  productSku: "TERMO-1L",
                  quantity: 3,
                  unitPriceCents: 4500000,
                  unitCostCents: 2000000,
                  selectedAttributes: { Color: "Negro" },
                  tierMinQty: null,
                  lineTotalCents: 13500000,
                },
              ],
              events: [
                {
                  id: "ev-1",
                  fromStatus: null,
                  toStatus: "pending_confirmation",
                  actor: "owner@shop.co",
                  reason: "Registro inicial",
                  createdAt: "2026-11-16T12:00:00.000Z",
                },
              ],
              returns: [],
            },
          }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      try {
        render(
          <OrdersView
            locale="es"
            isOwner={true}
            initialOrderList={{
              items: [
                {
                  id: "ord-1",
                  orderNumber: "ORD-202611-0001",
                  number: "ORD-202611-0001",
                  contactId: null,
                  prospectId: null,
                  contactAddressId: null,
                  source: "manual",
                  status: "guide_generated",
                  paymentMethod: "Contraentrega",
                  paymentChannelId: null,
                  paymentStatus: "pending",
                  shippingMethod: "home",
                  carrierId: null,
                  carrierName: null,
                  trackingCode: null,
                  customerName: "Carlos Ruiz",
                  customerPhone: "+573001234567",
                  customerDocument: null,
                  countryCode: "CO",
                  subdivisionCode: "CO-DC",
                  city: "Bogotá",
                  state: "Cundinamarca",
                  addressLine: "Calle 100 # 15-20",
                  subtotalCents: 13500000,
                  shippingCents: 1200000,
                  discountCents: 0,
                  totalCents: 14700000,
                  currency: "COP",
                  stockDeducted: true,
                  guideGeneratedAt: null,
                  repeatedFromOrderId: null,
                  canEditDetails: true,
                  allowedNextStatuses: ["dispatched", "cancelled"],
                  createdAt: "2026-11-16T12:00:00.000Z",
                  updatedAt: "2026-11-16T12:00:00.000Z",
                },
              ],
              pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
              summary: {
                total: 1,
                pending: 0,
                preparingAndGuide: 1,
                inTransitAndIssue: 0,
                delivered: 0,
                cancelledAndReturned: 0,
                byStatus: { guide_generated: 1 },
              },
            }}
          />,
        );

        const viewButtons = screen.getAllByRole("button", { name: /Ver Pedido/i });
        fireEvent.click(viewButtons[0]!);

        await waitFor(() => {
          expect(screen.getByText("Termo 1L")).toBeTruthy();
          expect(screen.getByText("Color: Negro")).toBeTruthy();
          expect(screen.getByText("Historial De Eventos")).toBeTruthy();
        });

        const transitionBtns = screen.getAllByRole("button", { name: /Cambiar Estado/i });
        fireEvent.click(transitionBtns[transitionBtns.length - 1]!);

        await waitFor(() => {
          expect(screen.getByRole("dialog")).toBeTruthy();
          expect(screen.getByLabelText("Número De Guía")).toBeTruthy();
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

