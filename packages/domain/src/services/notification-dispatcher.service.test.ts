import { describe, expect, it, vi } from "vitest";
import {
  buildAdminPortalUrl,
  NotificationDispatcherService,
  type INotificationDispatcherRepository,
  type NotificationEventMetadata,
  type StoredTenantNotificationPreference,
  type TenantInAppNotificationDto,
  type TenantNotificationClientInfo,
} from "./notification-dispatcher.service";
import {
  CANONICAL_EMAIL_EVENTS,
  escapeHtmlVariable,
} from "./notifications-and-leads.service";
import {
  CANONICAL_TEMPLATES_SEED,
  composeEmailWithGlobalLayout,
  prepareBilingualTemplateSaveEntries,
} from "./admin-dashboard.service";

function createInMemoryDispatcherHarness(overrides?: {
  events?: NotificationEventMetadata[];
  client?: TenantNotificationClientInfo | null;
  preferences?: StoredTenantNotificationPreference[];
  adminEmails?: string[];
}) {
  const eventsMap = new Map<string, NotificationEventMetadata>();
  const initialEvents =
    overrides?.events ??
    CANONICAL_EMAIL_EVENTS.map((ev) => ({
      key: ev.key,
      category: ev.category,
      description: ev.description,
      isEnabled: ev.isEnabled,
      isSystem: ev.isSystem,
      tenantConfigurable: ev.tenantConfigurable,
      variablesSchema: [...ev.variablesSchema],
    }));

  for (const ev of initialEvents) {
    eventsMap.set(ev.key, { ...ev });
  }

  const prefsMap = new Map<string, StoredTenantNotificationPreference>();
  for (const p of overrides?.preferences ?? []) {
    prefsMap.set(p.eventKey, { ...p });
  }

  const inbox: TenantInAppNotificationDto[] = [];
  const sendEmailMock = vi.fn(async (input) => ({
    success: true,
    deliveryId: `del-${inbox.length + 1}`,
    eventKey: input.eventKey,
    recipient: input.recipient,
    renderedSubject: input.eventKey,
    renderedHtml: `<p>${escapeHtmlVariable(input.variables.product_name ?? "")}</p>`,
    status: "sent" as const,
    providerMessageId: "msg-1",
  }));

  const clientInfo: TenantNotificationClientInfo | null =
    overrides && "client" in overrides
      ? (overrides.client ?? null)
      : {
          clientId: "client-1",
          displayName: "Comercial Andes",
          commercialEmail: "ventas@andes.co",
          contactEmail: "dueno@andes.co",
          locale: "es",
        };

  const repo: INotificationDispatcherRepository = {
    async getEventMetadata(eventKey) {
      return eventsMap.get(eventKey.trim().toLowerCase()) ?? null;
    },
    async listAllEventsMetadata() {
      return Array.from(eventsMap.values());
    },
    async getClientRecipientInfo() {
      return clientInfo;
    },
    async getTenantPreference(_clientId, eventKey) {
      return prefsMap.get(eventKey.trim().toLowerCase()) ?? null;
    },
    async listTenantPreferences() {
      return Array.from(prefsMap.values());
    },
    async upsertTenantPreferences(_clientId, _actorUserId, items) {
      const now = new Date();
      for (const item of items) {
        prefsMap.set(item.eventKey, {
          eventKey: item.eventKey,
          emailEnabled: item.emailEnabled,
          inAppEnabled: item.inAppEnabled,
          customRecipientEmail: item.customRecipientEmail ?? null,
          updatedAt: now,
        });
      }
      return Array.from(prefsMap.values());
    },
    async createInAppNotification(input) {
      const item: TenantInAppNotificationDto = {
        id: `notif-${inbox.length + 1}`,
        clientId: input.clientId,
        eventKey: input.eventKey,
        title: input.title,
        body: input.body,
        severity: input.severity,
        actionUrl: input.actionUrl,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      inbox.unshift(item);
      return item;
    },
    async listInAppNotifications(_clientId, opts) {
      const filtered = opts.unreadOnly ? inbox.filter((n) => !n.readAt) : inbox;
      return {
        items: filtered.slice((opts.page - 1) * opts.limit, opts.page * opts.limit),
        total: filtered.length,
        unreadCount: inbox.filter((n) => !n.readAt).length,
      };
    },
    async getUnreadCount() {
      return inbox.filter((n) => !n.readAt).length;
    },
    async markNotificationRead(clientId, notificationId) {
      const target = inbox.find((n) => n.id === notificationId && n.clientId === clientId);
      if (!target) return false;
      target.readAt = new Date().toISOString();
      return true;
    },
    async markAllNotificationsRead(clientId) {
      let count = 0;
      for (const n of inbox) {
        if (n.clientId === clientId && !n.readAt) {
          n.readAt = new Date().toISOString();
          count += 1;
        }
      }
      return count;
    },
    async listActivePlatformAdminEmails() {
      return overrides?.adminEmails ?? ["owner@mocter.co", "admin@mocter.co"];
    },
    sendEmail: sendEmailMock,
  };

  return {
    service: new NotificationDispatcherService(repo),
    eventsMap,
    prefsMap,
    inbox,
    sendEmailMock,
  };
}

describe("SPEC-14 · NotificationDispatcherService", () => {
  it("omite envío SMTP y notificación in-app cuando el evento está desactivado por la SaaS (isEnabled = false)", async () => {
    const { service, eventsMap, inbox, sendEmailMock } = createInMemoryDispatcherHarness();
    const lowStock = eventsMap.get("tenant.inventory.low_stock")!;
    lowStock.isEnabled = false;

    const res = await service.dispatchTenantNotification({
      clientId: "client-1",
      eventKey: "tenant.inventory.low_stock",
      variables: {
        business_name: "Comercial Andes",
        product_name: "Camisa",
        sku: "SKU-1",
        current_stock: 2,
        min_threshold: 5,
        product_admin_url: "/workspace/products",
      },
      inAppPayload: {
        title: "Stock bajo",
        body: "Quedan 2 unidades",
        severity: "warning",
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.skippedByAdmin).toBe(true);
      expect(res.data.emailDispatched).toBe(false);
      expect(res.data.inAppCreated).toBe(false);
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(inbox).toHaveLength(0);
  });

  it("resuelve destinatario jerárquicamente (customRecipientEmail -> commercialEmail -> contactEmail) y respeta preferencias", async () => {
    const { service, sendEmailMock, inbox } = createInMemoryDispatcherHarness({
      preferences: [
        {
          eventKey: "tenant.inventory.low_stock",
          emailEnabled: true,
          inAppEnabled: true,
          customRecipientEmail: "bodega@andes.co",
          updatedAt: new Date(),
        },
      ],
    });

    const res = await service.dispatchTenantNotification({
      clientId: "client-1",
      eventKey: "tenant.inventory.low_stock",
      variables: {
        business_name: "Comercial Andes",
        product_name: "<script>alert(1)</script>Camisa",
        sku: "SKU-1",
        current_stock: 2,
        min_threshold: 5,
        product_admin_url: "/workspace/products",
      },
      inAppPayload: {
        title: "Stock mínimo",
        body: "Camisa llegó a 2 unidades",
        severity: "warning",
        actionUrl: "/workspace/products",
      },
    });

    expect(res.ok).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].recipient).toBe("bodega@andes.co");
    expect(inbox).toHaveLength(1);
    expect(inbox[0].eventKey).toBe("tenant.inventory.low_stock");
  });

  it("escapa entidades HTML anti-XSS en variables dinámicas", () => {
    const escaped = NotificationDispatcherService.escapeVariables({
      product_name: '<script>alert("xss")</script>',
      count: 4,
    });
    expect(escaped.product_name).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
    expect(escaped.count).toBe("4");
  });

  it("permite apagar email en evento configurable manteniendo in-app activo", async () => {
    const { service, sendEmailMock, inbox } = createInMemoryDispatcherHarness({
      preferences: [
        {
          eventKey: "tenant.inventory.low_stock",
          emailEnabled: false,
          inAppEnabled: true,
          customRecipientEmail: null,
          updatedAt: new Date(),
        },
      ],
    });

    const res = await service.dispatchTenantNotification({
      clientId: "client-1",
      eventKey: "tenant.inventory.low_stock",
      variables: { product_name: "Zapatos" },
      inAppPayload: { title: "Stock bajo", body: "Zapatos" },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.emailDispatched).toBe(false);
      expect(res.data.inAppCreated).toBe(true);
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(inbox).toHaveLength(1);
  });

  it("rechaza eventos exclusivos de la SaaS, eventos obligatorios (MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED) y restringe a tenant_agent", async () => {
    const { service, eventsMap } = createInMemoryDispatcherHarness();

    const agentAttempt = await service.updateTenantPreferences(
      "client-1",
      "user-agent",
      "tenant_agent",
      [
        {
          eventKey: "tenant.inventory.low_stock",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    );
    expect(agentAttempt.ok).toBe(false);
    if (!agentAttempt.ok) {
      expect(agentAttempt.code).toBe("FORBIDDEN_ROLE");
    }

    const saasOnlyAttempt = await service.updateTenantPreferences(
      "client-1",
      "user-owner",
      "tenant_owner",
      [
        {
          eventKey: "billing.trial_d0_expired",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    );
    expect(saasOnlyAttempt.ok).toBe(false);
    if (!saasOnlyAttempt.ok) {
      expect(saasOnlyAttempt.code).toBe("INVALID_NOTIFICATION_EVENT");
    }

    const internalEventAttempt = await service.updateTenantPreferences(
      "client-1",
      "user-owner",
      "tenant_owner",
      [
        {
          eventKey: "billing.bre_b_report_pending_admin",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    );
    expect(internalEventAttempt.ok).toBe(false);
    if (!internalEventAttempt.ok) {
      expect(internalEventAttempt.code).toBe("INVALID_NOTIFICATION_EVENT");
    }

    // Simular evento de comercio marcado como obligatorio en catálogo
    eventsMap.get("tenant.inventory.low_stock")!.tenantConfigurable = false;
    const mandatoryAttempt = await service.updateTenantPreferences(
      "client-1",
      "user-owner",
      "tenant_owner",
      [
        {
          eventKey: "tenant.inventory.low_stock",
          emailEnabled: false,
          inAppEnabled: true,
        },
      ],
    );
    expect(mandatoryAttempt.ok).toBe(false);
    if (!mandatoryAttempt.ok) {
      expect(mandatoryAttempt.code).toBe("MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED");
    }
  });

  it("oculta preferencias a tenant_agent y muestra al tenant_owner únicamente los 6 eventos de competencia del comercio", async () => {
    const { service } = createInMemoryDispatcherHarness();

    const agentView = await service.listTenantInboxAndPreferences("client-1", {
      viewerRole: "tenant_agent",
    });
    expect(agentView.canManagePreferences).toBe(false);
    expect(agentView.preferences).toEqual([]);

    const ownerView = await service.listTenantInboxAndPreferences("client-1", {
      viewerRole: "tenant_owner",
    });
    expect(ownerView.canManagePreferences).toBe(true);
    const keys = ownerView.preferences.map((p) => p.eventKey).sort();
    expect(keys).toEqual([
      "community.digest",
      "community.invited",
      "community.join_accepted",
      "community.product_version_published",
      "referral.registered",
      "referral.reward_credited",
      "tenant.inventory.low_stock",
    ]);
    for (const pref of ownerView.preferences) {
      expect(pref.description.toLowerCase()).not.toContain("inquilino");
    }
  });

  it("despacha billing.bre_b_report_pending_admin a los administradores activos de plataforma", async () => {
    const { service, sendEmailMock } = createInMemoryDispatcherHarness({
      adminEmails: ["owner@mocter.co", "admin@mocter.co"],
    });

    const res = await service.dispatchPlatformAdminNotification({
      eventKey: "billing.bre_b_report_pending_admin",
      variables: {
        tenant_name: "Comercial Andes",
        plan_name: "Plan Pro",
        amount: "$120.000 COP",
        payment_reference: "REF-88",
        review_url: "https://mocter.co/admin/billing",
      },
      idempotencyKey: "breb-pending:r-1",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sentCount).toBe(2);
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("compone el correo heredando body.header y body.footer globales e interpola brand_name y year con sanitización", () => {
    const html = composeEmailWithGlobalLayout({
      headerHtml: "<div>Cabecera {{brand_name}}<script>alert(1)</script></div>",
      bodyHtml: "<p>Cuerpo de notificación</p>",
      footerHtml: "<div>© {{year}} {{brand_name}}</div>",
      isEnabled: true,
      brandName: "Mocter Co",
      year: 2026,
    });

    expect(html).toContain("Cabecera Mocter Co");
    expect(html).toContain("<p>Cuerpo de notificación</p>");
    expect(html).toContain("© 2026 Mocter Co");
    expect(html).not.toContain("<script>");

    const bypassed = composeEmailWithGlobalLayout({
      headerHtml: "<div>Cabecera</div>",
      bodyHtml: "<p>Solo cuerpo</p>",
      footerHtml: "<div>Pie</div>",
      isEnabled: false,
    });
    expect(bypassed).toBe("<p>Solo cuerpo</p>");
  });

  it("cubre plantillas oficiales es/en para los 18 eventos con variables válidas y valida guardado bilingüe tolerante (Ronda 3)", () => {
    const schemaByKey = new Map<string, Set<string>>(
      CANONICAL_EMAIL_EVENTS.map((ev) => [ev.key, new Set<string>(ev.variablesSchema)]),
    );

    for (const ev of CANONICAL_EMAIL_EVENTS) {
      const esSeed = CANONICAL_TEMPLATES_SEED.find((t) => t.eventKey === ev.key && t.locale === "es");
      const enSeed = CANONICAL_TEMPLATES_SEED.find((t) => t.eventKey === ev.key && t.locale === "en");
      expect(esSeed, `Falta semilla es para ${ev.key}`).toBeDefined();
      expect(enSeed, `Falta semilla en para ${ev.key}`).toBeDefined();
    }

    for (const seed of CANONICAL_TEMPLATES_SEED) {
      const allowed = schemaByKey.get(seed.eventKey);
      expect(allowed, `Evento inexistente en semilla: ${seed.eventKey}`).toBeDefined();
      const combined = `${seed.subject} ${seed.bodyHtml}`;
      for (const match of combined.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
        const varName = match[1];
        expect(allowed?.has(varName)).toBe(true);
      }
    }

    const bothOk = prepareBilingualTemplateSaveEntries({
      eventKey: "tenant.welcome",
      allowedVars: new Set(["owner_name", "tenant_name"]),
      translations: {
        es: { id: "id-es", subject: "Bienvenido {{owner_name}}", bodyHtml: "<p>Hola {{tenant_name}}</p><script>x()</script>" },
        en: { subject: "Welcome {{owner_name}}", bodyHtml: "<p>Hi {{tenant_name}}</p>" },
      },
    });
    expect(bothOk.ok).toBe(true);
    if (bothOk.ok) {
      expect(bothOk.data.map((d) => d.locale)).toEqual(["es", "en"]);
      expect(bothOk.data[0].safeHtml).not.toContain("<script>");
    }

    const partialTolerated = prepareBilingualTemplateSaveEntries({
      eventKey: "tenant.welcome",
      allowedVars: new Set(["owner_name"]),
      translations: {
        es: { subject: "Hola {{owner_name}}", bodyHtml: "<p>Cuerpo</p>" },
        en: { subject: "", bodyHtml: "<p><br></p>" },
      },
    });
    expect(partialTolerated.ok).toBe(true);
    if (partialTolerated.ok) {
      expect(partialTolerated.data.map((d) => d.locale)).toEqual(["es"]);
    }

    const halfFilledErr = prepareBilingualTemplateSaveEntries({
      eventKey: "tenant.welcome",
      allowedVars: new Set(["owner_name"]),
      translations: {
        es: { subject: "Hola {{owner_name}}", bodyHtml: "<p>Cuerpo</p>" },
        en: { subject: "Only subject", bodyHtml: "" },
      },
    });
    expect(halfFilledErr.ok).toBe(false);

    const unknownVarErr = prepareBilingualTemplateSaveEntries({
      eventKey: "tenant.welcome",
      allowedVars: new Set(["owner_name"]),
      translations: {
        es: { subject: "Hola {{unknown_var}}", bodyHtml: "<p>Cuerpo</p>" },
      },
    });
    expect(unknownVarErr.ok).toBe(false);
  });

  it("buildAdminPortalUrl prioriza baseUrlOverride y NEXT_PUBLIC_ADMIN_URL sin generar rutas relativas rotas", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "https://admin.mocter.co/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://mocter.co");

    expect(buildAdminPortalUrl("/workspace/community")).toBe(
      "https://admin.mocter.co/workspace/community",
    );
    expect(buildAdminPortalUrl("workspace/community")).toBe(
      "https://admin.mocter.co/workspace/community",
    );
    expect(buildAdminPortalUrl("/workspace/community", "http://localhost:3003/")).toBe(
      "http://localhost:3003/workspace/community",
    );

    vi.unstubAllEnvs();
  });
});
