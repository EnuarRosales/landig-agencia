import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatwootProvisioningService,
  ChatwootHttpPlatformGateway,
  buildChatwootFeaturesAndLimitsForPlan,
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
  });
});
