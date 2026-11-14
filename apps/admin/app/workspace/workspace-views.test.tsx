import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceDashboardView } from "./workspace-dashboard-view";
import { ProductsView } from "./products/products-view";
import { BillingView } from "./billing/billing-view";
import { ProfileView } from "./profile/profile-view";
import { TenantWorkspaceShell } from "@/components/tenant-workspace-shell";

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
      country: "CO",
      state: "Antioquia",
      city: "Medellín",
      addressLine: "Calle 10 # 40-20",
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
      const slugInput = screen.getByLabelText("URL Pública Del Comercio") as HTMLInputElement;
      expect(slugInput.readOnly).toBe(true);

      const nameInput = screen.getByLabelText("Nombre Comercial") as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "Synergia Renombrada" } });
      fireEvent.change(screen.getByLabelText("Idioma Del Comercio"), {
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
      fireEvent.click(screen.getByRole("button", { name: "Agregar Canal De Pago" }));
      fireEvent.change(screen.getByLabelText("Canal De Pago"), {
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

      expect(screen.getByText("Perfil Del Negocio")).toBeDefined();
    });
  });
});

