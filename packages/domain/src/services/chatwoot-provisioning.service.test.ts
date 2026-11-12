import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatwootProvisioningService,
  ChatwootHttpPlatformGateway,
  getChatwootHttpConfig,
  buildChatwootFeaturesAndLimitsForPlan,
  isChatwootEnabledForPlan,
  provisionTenantChatwootAccount,
  syncTenantChatwootAccount,
  syncAllAccountsForPlan,
  type IChatwootPlatformGateway,
} from "./chatwoot-provisioning.service";

describe("T4 & T5 · Chatwoot Provisioning and Plan Synchronization Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("ChatwootProvisioningService (Unit)", () => {
    it("provisiona una cuenta pasando features y límites compatibles", async () => {
      let createdPayload: any = null;
      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn().mockImplementation(async (params) => {
          createdPayload = params;
          return { accountId: 801, enabledFeatures: params.features, limits: params.limits };
        }),
        ensureServiceUser: vi.fn().mockResolvedValue({ userId: 901, accessToken: "pat-service-123" }),
        ensureWebchatInbox: vi.fn().mockResolvedValue({ inboxId: 401, websiteToken: "tok-web-401" }),
      };

      const svc = new ChatwootProvisioningService(gateway);
      const res = await svc.provisionOrRetryAccount({
        clientId: "client-abc",
        tenantName: "Tienda ABC",
        locale: "es",
        idempotencyKey: "idem-abc",
        features: { channel_email: true, crm: true, macros: false },
        limits: { agents: 5, inboxes: 2 },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.state).toBe("active");
      expect(res.data.chatwootAccountId).toBe(801);
      expect(res.data.serviceUserId).toBe(901);
      expect(res.data.webchatInboxId).toBe(401);
      expect(createdPayload.features).toEqual({ channel_email: true, crm: true, macros: false });
      expect(createdPayload.limits).toEqual({ agents: 5, inboxes: 2 });
    });

    it("siembra las 6 etiquetas reservadas e invoca ensureAccountWebhook en runProvisioningFlow (CHW-002 T-04)", async () => {
      const pushedLabels: any[] = [];
      let webhookParams: any = null;

      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn().mockResolvedValue({ accountId: 805 }),
        ensureServiceUser: vi.fn().mockResolvedValue({ userId: 905, accessToken: "pat-service-123" }),
        ensureWebchatInbox: vi.fn().mockResolvedValue({ inboxId: 405, websiteToken: "tok-web-405" }),
        pushLabelToChatwoot: vi.fn().mockImplementation(async (params) => {
          pushedLabels.push(params);
          return { chatwootLabelId: 5000 + pushedLabels.length };
        }),
        ensureAccountWebhook: vi.fn().mockImplementation(async (params) => {
          webhookParams = params;
          return { id: 701, url: params.webhookUrl };
        }),
      };

      const svc = new ChatwootProvisioningService(gateway);
      const res = await svc.provisionOrRetryAccount({
        clientId: "client-labels-webhook",
        tenantName: "Tienda Con Etiquetas",
        idempotencyKey: "idem-labels-1",
      });

      expect(res.ok).toBe(true);
      expect(pushedLabels).toHaveLength(6);
      expect(pushedLabels.map((l) => l.title)).toEqual([
        "lead-frio",
        "lead-tibio",
        "lead-caliente",
        "compra-realizada",
        "soporte",
        "escalation-humano",
      ]);
      expect(webhookParams).not.toBeNull();
      expect(webhookParams.accountId).toBe(805);
      expect(webhookParams.serviceToken).toBe("pat-service-123");
    });

    it("captura error en gateway y retorna failed sin lanzar excepción (Fail-Soft)", async () => {
      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn().mockRejectedValue(new Error("Chatwoot instance unreachable")),
        ensureServiceUser: vi.fn(),
        ensureWebchatInbox: vi.fn(),
      };

      const svc = new ChatwootProvisioningService(gateway);
      const res = await svc.provisionOrRetryAccount({
        clientId: "client-fail-soft",
        tenantName: "Tienda Caída",
        idempotencyKey: "idem-fail-soft",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CHATWOOT_PROVISIONING_FAILED");
        expect(res.error).toContain("Chatwoot instance unreachable");
      }
    });

    it("sincroniza las capacidades y límites de una cuenta existente de forma idempotente", async () => {
      let updatedPayload: any = null;
      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn().mockResolvedValue({ accountId: 802 }),
        updateAccount: vi.fn().mockImplementation(async (params) => {
          updatedPayload = params;
          return { accountId: params.accountId };
        }),
        ensureServiceUser: vi.fn().mockResolvedValue({ userId: 902, accessToken: "pat-service-123" }),
        ensureWebchatInbox: vi.fn().mockResolvedValue({ inboxId: 402, websiteToken: "tok-web-402" }),
      };

      const svc = new ChatwootProvisioningService(gateway);
      await svc.provisionOrRetryAccount({
        clientId: "client-sync-1",
        tenantName: "Tienda Sync",
        idempotencyKey: "idem-sync-1",
      });

      const syncRes = await svc.syncAccountWithPlan({
        clientId: "client-sync-1",
        features: { reports: true, campaigns: true },
        limits: { agents: 10, inboxes: 4 },
      });

      expect(syncRes.ok).toBe(true);
      expect(updatedPayload).toEqual({
        accountId: 802,
        features: { reports: true, campaigns: true },
        limits: { agents: 10, inboxes: 4 },
      });
      if (syncRes.ok) {
        expect(syncRes.data.state).toBe("active");
        expect(syncRes.data.syncedAt).toBeInstanceOf(Date);
      }
    });

    it("devuelve el mensaje S10 exacto cuando la sincronización falla", async () => {
      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn().mockResolvedValue({ accountId: 803 }),
        updateAccount: vi.fn().mockRejectedValue(new Error("Connection timeout to Chatwoot Platform")),
        ensureServiceUser: vi.fn().mockResolvedValue({ userId: 903, accessToken: "pat-service-123" }),
        ensureWebchatInbox: vi.fn().mockResolvedValue({ inboxId: 403, websiteToken: "tok-web-403" }),
      };

      const svc = new ChatwootProvisioningService(gateway);
      await svc.provisionOrRetryAccount({
        clientId: "client-fail-sync",
        tenantName: "Tienda Fallo",
        idempotencyKey: "idem-fail-sync",
      });

      const syncRes = await svc.syncAccountWithPlan({
        clientId: "client-fail-sync",
        features: { reports: true },
      });

      expect(syncRes.ok).toBe(false);
      if (!syncRes.ok) {
        expect(syncRes.error).toBe("El plan se guardó, pero la configuración de atención no pudo sincronizarse.");
        expect(syncRes.code).toBe("CHATWOOT_SYNC_FAILED");
      }
    });
  });

  describe("buildChatwootFeaturesAndLimitsForPlan", () => {
    it("mapea los límites y capacidades excluyendo channel_whatsapp y chatwoot_v4", async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockImplementation(() => {
            return {
              where: vi.fn().mockImplementation(() => {
                callCount += 1;
                if (callCount === 1) {
                  return [
                    { dimension: "agents", limitMode: "LIMITED", value: 3 },
                    { dimension: "inboxes", limitMode: "UNLIMITED", value: null },
                    { dimension: "products", limitMode: "LIMITED", value: 50 },
                  ];
                }
                return [
                  { capabilityCode: "channel_email", enabled: true },
                  { capabilityCode: "crm", enabled: true },
                  { capabilityCode: "macros", enabled: false },
                  { capabilityCode: "channel_whatsapp", enabled: true },
                  { capabilityCode: "chatwoot_v4", enabled: true },
                ];
              }),
            };
          }),
        }),
      };

      const res = await buildChatwootFeaturesAndLimitsForPlan("plan-test-1", mockDb);
      expect(res.limits).toEqual({ agents: 3, inboxes: null });
      expect(res.features["channel_email"]).toBe(true);
      expect(res.features["crm"]).toBe(true);
      expect(res.features["macros"]).toBe(false);
      expect(res.features["channel_whatsapp"]).toBeUndefined();
      expect(res.features["chatwoot_v4"]).toBeUndefined();
    });

    it("mapea dimensiones canónicas chatwoot_agents y chatwoot_inboxes leyendo row.mode (CHW-002 T-03)", async () => {
      let callCount = 0;
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockImplementation(() => {
            return {
              where: vi.fn().mockImplementation(() => {
                callCount += 1;
                if (callCount === 1) {
                  return [
                    { dimension: "chatwoot_agents", mode: "LIMITED", value: 7 },
                    { dimension: "chatwoot_inboxes", mode: "UNLIMITED", value: null },
                    { dimension: "chatwoot_outbound_emails", mode: "LIMITED", value: 500 },
                  ];
                }
                return [
                  { capabilityCode: "channel_email", enabled: true },
                ];
              }),
            };
          }),
        }),
      };

      const res = await buildChatwootFeaturesAndLimitsForPlan("plan-pro-canonical", mockDb);
      expect(res.limits).toEqual({ agents: 7, inboxes: null });
      expect(res.features["channel_email"]).toBe(true);
    });

    it("isChatwootEnabledForPlan retorna true si chatwoot_inboxes o chatwoot_agents está activo", async () => {
      let step = 0;
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              step += 1;
              if (step === 1) {
                // plans
                return [{ chatwootEnabled: false }];
              }
              if (step === 2) {
                // planLimits
                return [{ dimension: "chatwoot_inboxes", mode: "LIMITED", value: 2 }];
              }
              return [];
            }),
            limit: vi.fn().mockImplementation(() => {
              if (step === 1) return [{ chatwootEnabled: false }];
              return [];
            }),
          }),
        }),
      };

      const enabled = await isChatwootEnabledForPlan("plan-cw-limits", mockDb);
      expect(enabled).toBe(true);
    });
  });

  describe("provisionTenantChatwootAccount", () => {
    it("omite el aprovisionamiento si el plan tiene chatwootEnabled = false", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                return [{ id: "c1", displayName: "Cliente 1", planId: "p-no-cw", chatwootEnabled: false }];
              }),
            }),
          }),
        }),
      };

      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn(),
        ensureServiceUser: vi.fn(),
        ensureWebchatInbox: vi.fn(),
      };

      const res = await provisionTenantChatwootAccount({
        clientId: "c1",
        planId: "p-no-cw",
        gateway,
        db: mockDb,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect("skipped" in res.data && res.data.skipped).toBe(true);
      }
      expect(gateway.createAccount).not.toHaveBeenCalled();
    });
  });

  describe("syncAllAccountsForPlan", () => {
    it("sincroniza de forma agregada todos los inquilinos asignados al plan", async () => {
      let callStep = 0;
      const mockDb = {
        select: vi.fn().mockImplementation((projection) => {
          return {
            from: vi.fn().mockImplementation(() => {
              return {
                where: vi.fn().mockImplementation(() => {
                  callStep += 1;
                  // 1. Where en plans -> tiene limit(1)
                  // 2. Where en clients -> devuelve lista de clientes
                  // 3. Where en planLimits -> devuelve limites
                  // 4. Where en planCapabilities -> devuelve capacidades
                  const rows =
                    callStep === 2
                      ? [
                          { id: "c1", displayName: "Inquilino 1" },
                          { id: "c2", displayName: "Inquilino 2" },
                        ]
                      : callStep === 3
                        ? [{ dimension: "agents", limitMode: "LIMITED", value: 5 }]
                        : callStep === 4
                          ? [{ capabilityCode: "reports", enabled: true }]
                          : [{ id: "p1", chatwootEnabled: true }];

                  return Object.assign(rows, {
                    limit: vi.fn().mockReturnValue([{ id: "p1", chatwootEnabled: true }]),
                  });
                }),
              };
            }),
          };
        }),
      };

      const gateway: IChatwootPlatformGateway = {
        createAccount: vi.fn(),
        updateAccount: vi.fn().mockResolvedValue({ accountId: 999 }),
        ensureServiceUser: vi.fn(),
        ensureWebchatInbox: vi.fn(),
      };

      // Iniciar el servicio con cuentas en memoria
      const svc = new ChatwootProvisioningService(gateway);
      await svc.provisionOrRetryAccount({ clientId: "c1", tenantName: "Inquilino 1", idempotencyKey: "k1" });
      await svc.provisionOrRetryAccount({ clientId: "c2", tenantName: "Inquilino 2", idempotencyKey: "k2" });

      const syncResult = await syncAllAccountsForPlan({
        planId: "p1",
        gateway,
        db: mockDb,
      });

      expect(syncResult.ok).toBe(true);
      if (syncResult.ok) {
        expect(syncResult.data.total).toBe(2);
      }
    });
  });

  describe("ChatwootHttpPlatformGateway", () => {
    it("usa baseUrl y token por defecto y envía cabecera api_access_token", async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 555, features: { crm: true }, limits: { agents: 3 } }),
      });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://test-chatwoot:3000",
        platformToken: "token-abc-123",
      });

      const res = await gw.createAccount({
        name: "Test Org",
        locale: "es",
        idempotencyKey: "key-1",
        features: { crm: true },
        limits: { agents: 3 },
      });

      expect(res.accountId).toBe(555);
      expect(fakeFetch).toHaveBeenCalledWith(
        "http://test-chatwoot:3000/platform/api/v1/accounts",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            api_access_token: "token-abc-123",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("resuelve primero CHATWOOT_INTERNAL_URL con fallback a CHATWOOT_BASE_URL", () => {
      const originalInternal = process.env.CHATWOOT_INTERNAL_URL;
      const originalBase = process.env.CHATWOOT_BASE_URL;

      try {
        process.env.CHATWOOT_INTERNAL_URL = "http://chatwoot-internal:3000/";
        process.env.CHATWOOT_BASE_URL = "http://chatwoot-base:3000/";
        const config1 = getChatwootHttpConfig();
        expect(config1.baseUrl).toBe("http://chatwoot-internal:3000");

        delete process.env.CHATWOOT_INTERNAL_URL;
        const config2 = getChatwootHttpConfig();
        expect(config2.baseUrl).toBe("http://chatwoot-base:3000");
      } finally {
        if (originalInternal !== undefined) process.env.CHATWOOT_INTERNAL_URL = originalInternal;
        else delete process.env.CHATWOOT_INTERNAL_URL;
        if (originalBase !== undefined) process.env.CHATWOOT_BASE_URL = originalBase;
        else delete process.env.CHATWOOT_BASE_URL;
      }
    });

    it("ensureAccountWebhook registra el webhook si no existe con las 5 suscripciones canónicas", async () => {
      const fakeFetch = vi
        .fn()
        // 1. GET webhooks -> lista vacía
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ payload: [] }),
        })
        // 2. POST webhooks -> webhook registrado
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ payload: { webhook: { id: 701, url: "http://admin:3003/api/webhooks/chatwoot" } } }),
        });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://chatwoot:3000",
        platformToken: "plat-tok",
      });

      const res = await gw.ensureAccountWebhook({
        accountId: 10,
        serviceToken: "svc-tok",
        webhookUrl: "http://admin:3003/api/webhooks/chatwoot",
      });

      expect(res.id).toBe(701);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
      expect(fakeFetch).toHaveBeenNthCalledWith(
        2,
        "http://chatwoot:3000/api/v1/accounts/10/webhooks",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ api_access_token: "svc-tok" }),
          body: JSON.stringify({
            webhook: {
              url: "http://admin:3003/api/webhooks/chatwoot",
              subscriptions: [
                "conversation_created",
                "conversation_status_changed",
                "conversation_updated",
                "message_created",
                "message_updated",
              ],
            },
          }),
        }),
      );
    });

    it("ensureMemberUserInAccount crea el usuario y lo asocia a la cuenta con su rol", async () => {
      const fakeFetch = vi
        .fn()
        // 1. POST /platform/api/v1/users
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 444 }),
        })
        // 2. POST /platform/api/v1/accounts/10/account_users
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 888 }),
        });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://chatwoot:3000",
        platformToken: "plat-tok",
      });

      const res = await gw.ensureMemberUserInAccount({
        accountId: 10,
        email: "member@tienda.com",
        name: "Miembro Tienda",
        role: "agent",
      });

      expect(res.userId).toBe(444);
      expect(fakeFetch).toHaveBeenNthCalledWith(
        2,
        "http://chatwoot:3000/platform/api/v1/accounts/10/account_users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ user_id: 444, role: "agent" }),
        }),
      );
    });

    it("getUserSsoLoginUrl consulta GET /platform/api/v1/users/:id/login con Platform Token", async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "http://chatwoot:3000/app/login?email=test@m.com&sso_auth_token=tok123" }),
      });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://chatwoot:3000",
        platformToken: "plat-tok",
      });

      const res = await gw.getUserSsoLoginUrl({ userId: 444 });
      expect(res.url).toBe("http://chatwoot:3000/app/login?email=test@m.com&sso_auth_token=tok123");
      expect(fakeFetch).toHaveBeenCalledWith(
        "http://chatwoot:3000/platform/api/v1/users/444/login",
        expect.objectContaining({
          headers: expect.objectContaining({ api_access_token: "plat-tok" }),
        }),
      );
    });

    it("ensureServiceUser maneja 422 de forma idempotente localizando el usuario técnico y generando token", async () => {
      const fakeFetch = vi
        .fn()
        // 1. POST /platform/api/v1/users -> 422 (email already taken)
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          text: async () => "Email has already been taken",
        })
        // 2. GET /platform/api/v1/users -> lista que contiene el usuario
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { id: 991, email: "service-c-retry@mocter.internal" },
          ],
        })
        // 3. POST /platform/api/v1/accounts/10/account_users -> 422 (already linked) o 200
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          text: async () => "User already added to account",
        })
        // 4. POST /platform/api/v1/users/991/token -> token nuevo
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "new-pat-token-991" }),
        });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://chatwoot:3000",
        platformToken: "plat-tok",
      });

      const res = await gw.ensureServiceUser({
        accountId: 10,
        clientId: "c-retry",
        idempotencyKey: "idem-retry-1",
      });

      expect(res.userId).toBe(991);
      expect(res.accessToken).toBe("new-pat-token-991");
      expect(fakeFetch).toHaveBeenCalledTimes(4);
    });

    it("ensureWebchatInbox recupera el inbox web widget existente en reintento sin duplicar", async () => {
      const fakeFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 301,
            channel_type: "Channel::WebWidget",
            website_token: "existing-web-token-301",
          },
        ],
      });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://chatwoot:3000",
        platformToken: "plat-tok",
      });

      const res = await gw.ensureWebchatInbox({
        accountId: 10,
        serviceToken: "svc-tok",
        websiteName: "Mi Tienda",
      });

      expect(res.inboxId).toBe(301);
      expect(res.websiteToken).toBe("existing-web-token-301");
      // No debe haber intentado POST /inboxes
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it("pushLabelToChatwoot recupera el ID de etiqueta existente si Chatwoot retorna 422 (reintento)", async () => {
      const fakeFetch = vi
        .fn()
        // 1. POST /labels -> 422 Title already taken
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          text: async () => "Title has already been taken",
        })
        // 2. GET /labels -> lista con la etiqueta
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { id: 777, title: "soporte", color: "#3B82F6" },
          ],
        });
      globalThis.fetch = fakeFetch;

      const gw = new ChatwootHttpPlatformGateway({
        baseUrl: "http://chatwoot:3000",
        platformToken: "plat-tok",
      });

      const res = await gw.pushLabelToChatwoot({
        accountId: 10,
        serviceToken: "svc-tok",
        title: "soporte",
        description: "Atención post-venta",
        color: "#3B82F6",
        showOnSidebar: true,
      });

      expect(res.chatwootLabelId).toBe(777);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });

    it("seedReservedLabelsIfMissing siembra las 4 etiquetas reservadas de clasificación", () => {
      const gw: IChatwootPlatformGateway = {
        createAccount: vi.fn(),
        ensureServiceUser: vi.fn(),
        ensureWebchatInbox: vi.fn(),
      };

      const svc = new ChatwootProvisioningService(gw);
      const labels = svc.seedReservedLabelsIfMissing("c-test-4-labels");

      expect(labels).toHaveLength(4);
      expect(labels.map((l) => l.title)).toEqual([
        "lead-frio",
        "lead-tibio",
        "lead-caliente",
        "compra-realizada",
      ]);
      expect(labels.every((l) => l.origin === "mocter_default")).toBe(true);
    });

    it("runProvisioningFlow registra y sincroniza las 6 etiquetas reservadas canónicas", async () => {
      const pushed: any[] = [];
      const gw: IChatwootPlatformGateway = {
        createAccount: vi.fn().mockResolvedValue({ accountId: 99 }),
        ensureServiceUser: vi.fn().mockResolvedValue({ userId: 10, accessToken: "tok" }),
        ensureWebchatInbox: vi.fn().mockResolvedValue({ inboxId: 20, websiteToken: "web-tok" }),
        pushLabelToChatwoot: vi.fn().mockImplementation(async (params) => {
          pushed.push(params.title);
          return { chatwootLabelId: 100 + pushed.length };
        }),
      };

      const svc = new ChatwootProvisioningService(gw);
      const res = await svc.provisionOrRetryAccount({
        clientId: "c-6-labels-prov",
        tenantName: "Tienda 6 Etiquetas",
        idempotencyKey: "idem-6-labels",
      });

      expect(res.ok).toBe(true);
      expect(pushed).toHaveLength(6);
      expect(pushed).toEqual([
        "lead-frio",
        "lead-tibio",
        "lead-caliente",
        "compra-realizada",
        "soporte",
        "escalation-humano",
      ]);
    });
  });
});
