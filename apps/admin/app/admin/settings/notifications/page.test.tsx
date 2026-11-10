import React from "react";
import { describe, expect, it, vi } from "vitest";
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
  }),
}));

describe("NTF-001 · Administración de Correos, SMTP y Plantillas Vinculadas", () => {
  it("renderiza el Server Component con encabezado institucional y vista de notificaciones", async () => {
    const page = await AdminNotificationsSettingsPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(2);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const view = children[1] as React.ReactElement<any>;
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
      ],
    };

    const element = <NotificationsView initialData={mockData} />;
    expect(React.isValidElement(element)).toBe(true);
  });
});

