import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminEmailSettingsDto } from "@mocter/domain";
import AdminNotificationsSettingsPage from "./page";
import { NotificationsView } from "./notifications-view";

vi.mock("@mocter/domain", () => ({
  fetchAdminEmailSettings: vi.fn().mockResolvedValue({
    provider: {
      id: "prov-01",
      name: "Pasarela SMTP Hostinger Mocter",
      driver: "smtp",
      host: "smtp.hostinger.com",
      port: 587,
      secure: false,
      username: "soporte@mocter.co",
      hasPassword: true,
      maskedSecret: "••••••••",
      status: "active",
    },
    senders: [
      {
        id: "send-01",
        key: "no-reply",
        fromName: "Mocter",
        fromEmail: "no-reply@mocter.co",
        replyTo: "soporte@mocter.co",
        providerId: "prov-01",
        providerName: "Pasarela SMTP Hostinger Mocter",
        isDefault: true,
        status: "active",
      },
      {
        id: "send-02",
        key: "billing",
        fromName: "Facturación Mocter",
        fromEmail: "facturacion@mocter.co",
        replyTo: "facturacion@mocter.co",
        providerId: "prov-01",
        providerName: "Pasarela SMTP Hostinger Mocter",
        isDefault: false,
        status: "active",
      },
    ],
    events: [
      {
        id: "ev-01",
        key: "auth.verify_email",
        category: "auth",
        description: "Verificación de dirección de correo electrónico.",
        variablesSchema: ["user_name", "verify_url", "expires_minutes"],
        defaultSenderKey: "no-reply",
        isEnabled: true,
        isSystem: true,
        tenantConfigurable: false,
      },
    ],
    templates: [
      {
        id: "tpl-01",
        eventKey: "auth.verify_email",
        locale: "es",
        senderId: "send-01",
        senderName: "Mocter",
        senderEmail: "no-reply@mocter.co",
        subject: "Verifica tu correo electrónico en Mocter",
        bodyHtml: "<p>Hola {{user_name}}</p>",
        version: 1,
        status: "published",
        isLocked: true,
      },
    ],
    layoutConfigs: [
      {
        id: "layout-es",
        locale: "es",
        headerHtml: "<div>Mocter</div>",
        footerHtml: "<div>© Mocter</div>",
        isEnabled: true,
      },
    ],
  }),
}));

describe("NTF-001 · Administración de Correos, SMTP y Plantillas Vinculadas", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renderiza el Server Component con encabezado institucional y vista de notificaciones", async () => {
    const page = await AdminNotificationsSettingsPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(2);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const view = children[1] as React.ReactElement<{ initialData: AdminEmailSettingsDto }>;
    expect(view.type).toBe(NotificationsView);
    expect(view.props.initialData.provider?.name).toBe("Pasarela SMTP Hostinger Mocter");
    expect(view.props.initialData.senders.length).toBe(2);
    expect(view.props.initialData.templates[0].senderEmail).toBe("no-reply@mocter.co");
    expect(view.props.initialData.templates[0].eventKey).toBe("auth.verify_email");
  });

  it("renderiza NotificationsView con pestañas para SMTP, Remitentes y Plantillas", () => {
    const mockData = {
      provider: {
        id: "prov-01",
        name: "Pasarela SMTP Hostinger Mocter",
        driver: "smtp",
        host: "smtp.hostinger.com",
        port: 587,
        secure: false,
        username: "soporte@mocter.co",
        hasPassword: true,
        maskedSecret: "••••••••",
        status: "active",
      },
      senders: [
        {
          id: "send-01",
          key: "no-reply",
          fromName: "Mocter",
          fromEmail: "no-reply@mocter.co",
          replyTo: "soporte@mocter.co",
          providerId: "prov-01",
          providerName: "Pasarela SMTP Hostinger Mocter",
          isDefault: true,
          status: "active",
        },
      ],
      events: [
        {
          id: "ev-01",
          key: "auth.verify_email",
          category: "auth",
          description: "Verificación de email",
          variablesSchema: ["user_name", "verify_url"],
          defaultSenderKey: "no-reply",
          isEnabled: true,
          isSystem: true,
          tenantConfigurable: false,
        },
        {
          id: "ev-02",
          key: "tenant.inventory.low_stock",
          category: "tenant",
          description: "Alerta de stock mínimo",
          variablesSchema: ["business_name", "product_name", "sku"],
          defaultSenderKey: "no-reply",
          isEnabled: true,
          isSystem: false,
          tenantConfigurable: true,
        },
      ],
      templates: [
        {
          id: "tpl-01",
          eventKey: "auth.verify_email",
          locale: "es",
          senderId: "send-01",
          senderName: "Mocter",
          senderEmail: "no-reply@mocter.co",
          subject: "Verifica tu correo",
          bodyHtml: "<p>Hola</p>",
          version: 1,
          status: "published",
          isLocked: true,
        },
        {
          id: "tpl-01-en",
          eventKey: "auth.verify_email",
          locale: "en",
          senderId: "send-01",
          senderName: "Mocter",
          senderEmail: "no-reply@mocter.co",
          subject: "Verify your email",
          bodyHtml: "<p>Hi</p>",
          version: 1,
          status: "published",
          isLocked: true,
        },
        {
          id: "tpl-02-es",
          eventKey: "tenant.inventory.low_stock",
          locale: "es",
          senderId: "send-01",
          senderName: "Mocter",
          senderEmail: "no-reply@mocter.co",
          subject: "Stock bajo de {{product_name}}",
          bodyHtml: "<p>Reponer {{sku}}</p>",
          version: 2,
          status: "draft",
          isLocked: false,
        },
      ],
      layoutConfigs: [
        {
          id: "layout-es",
          locale: "es" as const,
          headerHtml: "<div>Mocter Header</div>",
          footerHtml: "<div>Mocter Footer</div>",
          isEnabled: true,
        },
      ],
    };

    render(<NotificationsView initialData={mockData} />);
    expect(screen.getByRole("button", { name: /Plantillas y Eventos/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Encabezado y Pie Global/i })).toBeDefined();

    // Verificar pestaña Encabezado y Pie Global
    fireEvent.click(screen.getByRole("button", { name: /Encabezado y Pie Global/i }));
    expect(screen.getByText("Encabezado y Pie de Página Institucional")).toBeDefined();
    expect(screen.getByText("Encabezado Global del Correo (body.header)")).toBeDefined();
    expect(screen.getByText("Pie de Página Global del Correo (body.footer)")).toBeDefined();
    expect(screen.getAllByRole("button", { name: /Mejorar con AI/i }).length).toBeGreaterThanOrEqual(2);

    // Verificar tabla unificada sin filas duplicadas ES/EN en Plantillas y Eventos
    fireEvent.click(screen.getByRole("button", { name: /Plantillas y Eventos/i }));
    expect(screen.getAllByText("auth.verify_email")).toHaveLength(1);
    expect(screen.getAllByText("tenant.inventory.low_stock")).toHaveLength(1);
    expect(screen.getAllByText("Remitente Vinculado").length).toBe(2);
    expect(screen.getAllByText("Idiomas y Versión").length).toBe(2);
    expect(screen.getByText("Verifica tu correo")).toBeDefined();
    expect(screen.getByText("Verify your email")).toBeDefined();
    expect(screen.getByText("Stock bajo de {{product_name}}")).toBeDefined();

    // Abrir modal unificado sobre tenant.inventory.low_stock (primer grupo: Inventario y Productos)
    fireEvent.click(screen.getAllByRole("button", { name: /Editar Plantilla/i })[0]);
    expect(screen.getByText("Cuerpo Específico de la Plantilla")).toBeDefined();
    expect(screen.getByRole("button", { name: /Vista Previa Completa/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Español \(ES\)/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Inglés \(EN\)/i })).toBeDefined();
  });

  it("permite editar ES y EN en el mismo modal bilingüe y guarda mediante save_bilingual_template", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/admin/notifications" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              data: { ids: { es: "tpl-es", en: "tpl-en" }, savedLocales: ["es", "en"] },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: null }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const bilingualData: AdminEmailSettingsDto = {
      provider: null,
      senders: [
        {
          id: "send-01",
          key: "no-reply",
          fromName: "Mocter",
          fromEmail: "no-reply@mocter.co",
          replyTo: "soporte@mocter.co",
          providerId: "prov-01",
          providerName: "SMTP",
          isDefault: true,
          status: "active",
        },
      ],
      events: [
        {
          id: "ev-02",
          key: "tenant.inventory.low_stock",
          category: "tenant",
          description: "Alerta de stock mínimo",
          variablesSchema: ["product_name", "sku"],
          defaultSenderKey: "no-reply",
          isEnabled: true,
          isSystem: false,
          tenantConfigurable: true,
        },
      ],
      templates: [
        {
          id: "tpl-es",
          eventKey: "tenant.inventory.low_stock",
          locale: "es",
          senderId: "send-01",
          senderName: "Mocter",
          senderEmail: "no-reply@mocter.co",
          subject: "Stock bajo {{product_name}}",
          bodyHtml: "<p>Reponer {{sku}}</p>",
          version: 1,
          status: "published",
          isLocked: false,
        },
      ],
      layoutConfigs: [],
    };

    render(<NotificationsView initialData={bilingualData} />);
    fireEvent.click(screen.getByRole("button", { name: /Plantillas y Eventos/i }));
    fireEvent.click(screen.getByRole("button", { name: /Editar Plantilla/i }));

    // Cambiar asunto en ES
    const esSubjectInput = screen.getByLabelText(/Asunto del Correo Electrónico \(Español\)/i) as HTMLInputElement;
    fireEvent.change(esSubjectInput, { target: { value: "Alerta actualizada {{product_name}}" } });

    // Cambiar a pestaña Inglés (EN) y llenar asunto + cuerpo
    fireEvent.click(screen.getByRole("tab", { name: /Inglés \(EN\)/i }));
    const enSubjectInput = screen.getByLabelText(/Asunto del Correo Electrónico \(Inglés\)/i) as HTMLInputElement;
    fireEvent.change(enSubjectInput, { target: { value: "Updated alert {{product_name}}" } });

    fireEvent.click(screen.getByRole("button", { name: /Código HTML/i }));
    const enBodyTextarea = document.getElementById("template-body-en") as HTMLTextAreaElement;
    fireEvent.change(enBodyTextarea, { target: { value: "<p>Restock {{sku}}</p>" } });

    // Volver a ES para comprobar que no se perdió la edición local
    fireEvent.click(screen.getByRole("tab", { name: /Español \(ES\)/i }));
    expect(
      (screen.getByLabelText(/Asunto del Correo Electrónico \(Español\)/i) as HTMLInputElement).value,
    ).toBe("Alerta actualizada {{product_name}}");

    fireEvent.click(screen.getByRole("button", { name: /Guardar Plantilla Vinculada/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/notifications",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const postCall = mockFetch.mock.calls.find(
      (c) => c[0] === "/api/admin/notifications" && (c[1] as RequestInit)?.method === "POST",
    );
    const sentBody = JSON.parse(String((postCall?.[1] as RequestInit).body));
    expect(sentBody.action).toBe("save_bilingual_template");
    expect(sentBody.senderId).toBe("send-01");
    expect(sentBody.translations.es.subject).toBe("Alerta actualizada {{product_name}}");
    expect(sentBody.translations.en.subject).toBe("Updated alert {{product_name}}");
    expect(sentBody.translations.en.bodyHtml).toBe("<p>Restock {{sku}}</p>");
  });
});

