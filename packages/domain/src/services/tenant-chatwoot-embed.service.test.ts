import { describe, expect, it, vi } from "vitest";
import { TenantChatwootEmbedService } from "./tenant-chatwoot-embed.service";

describe("@mocter/domain · TenantChatwootEmbedService (SPEC-13)", () => {
  describe("resolveWorkspacePageState (preflight SSR)", () => {
    it("retorna no_capability cuando el plan no incluye chatwoot_inboxes o falta clientId", async () => {
      const service = new TenantChatwootEmbedService();
      const state = await service.resolveWorkspacePageState({
        clientId: "c-1",
        userId: "u-1",
        role: "tenant_owner",
        hasCapability: false,
      });

      expect(state).toEqual({
        status: "no_capability",
        accountId: null,
        isOwner: true,
      });
    });

    it("retorna access_denied cuando tenant_agent tiene grantChatwootAccess=false o estado inactivo", async () => {
      const serviceDisabled = new TenantChatwootEmbedService({
        findCellMembership: vi.fn().mockResolvedValue({
          status: "active",
          grantChatwootAccess: false,
          chatwootAgentId: null,
        }),
      });
      expect(
        await serviceDisabled.resolveWorkspacePageState({
          clientId: "c-1",
          userId: "u-agent",
          role: "tenant_agent",
          effectiveRoles: ["tenant_agent"],
          hasCapability: true,
        }),
      ).toEqual({
        status: "access_denied",
        accountId: null,
        isOwner: false,
      });

      const serviceMissing = new TenantChatwootEmbedService({
        findCellMembership: vi.fn().mockResolvedValue(null),
      });
      expect(
        await serviceMissing.resolveWorkspacePageState({
          clientId: "c-1",
          userId: "u-agent",
          role: "tenant_agent",
          hasCapability: true,
        }),
      ).toEqual({
        status: "access_denied",
        accountId: null,
        isOwner: false,
      });
    });

    it("distingue correctamente not_provisioned, provisioning, suspended, failed y ready", async () => {
      const cases = [
        { dbRow: null, expectedStatus: "not_provisioned", expectedAccountId: null },
        { dbRow: { state: "pending", chatwootAccountId: null }, expectedStatus: "provisioning", expectedAccountId: null },
        { dbRow: { state: "provisioning", chatwootAccountId: null }, expectedStatus: "provisioning", expectedAccountId: null },
        { dbRow: { state: "suspended", chatwootAccountId: 42 }, expectedStatus: "suspended", expectedAccountId: 42 },
        { dbRow: { state: "failed", chatwootAccountId: null }, expectedStatus: "failed", expectedAccountId: null },
        { dbRow: { state: "active", chatwootAccountId: 42 }, expectedStatus: "ready", expectedAccountId: 42 },
      ] as const;

      for (const tc of cases) {
        const service = new TenantChatwootEmbedService({
          findAccountByClientId: vi.fn().mockResolvedValue(tc.dbRow),
        });
        const res = await service.resolveWorkspacePageState({
          clientId: "c-1",
          userId: "u-owner",
          role: "tenant_owner",
          hasCapability: true,
        });
        expect(res.status).toBe(tc.expectedStatus);
        expect(res.accountId).toBe(tc.expectedAccountId);
      }
    });
  });

  describe("resolveWorkspaceEmbedRedirect (handoff SSO 307)", () => {
    it("rechaza con 403 CHATWOOT_ACCOUNT_MISMATCH si se envía un ?accountId ajeno al comercio", async () => {
      const ensureMemberUserInAccount = vi.fn();
      const service = new TenantChatwootEmbedService({
        findAccountByClientId: vi.fn().mockResolvedValue({
          state: "active",
          chatwootAccountId: 42,
        }),
        createGateway: () => ({
          createAccount: vi.fn(),
          ensureServiceUser: vi.fn(),
          ensureWebchatInbox: vi.fn(),
          ensureMemberUserInAccount,
          getUserSsoLoginUrl: vi.fn(),
        }),
      });

      const res = await service.resolveWorkspaceEmbedRedirect({
        clientId: "c-1",
        user: { id: "u-1", email: "owner@store.com", displayName: "Owner" },
        role: "tenant_owner",
        hasCapability: true,
        publicBaseUrl: "https://chatapp.mocter.co",
        requestedAccountId: "99",
        requestId: "req-1",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(403);
        expect(res.code).toBe("CHATWOOT_ACCOUNT_MISMATCH");
      }
      expect(ensureMemberUserInAccount).not.toHaveBeenCalled();
    });

    it("rechaza con 404 cuando la cuenta Chatwoot sigue aprovisionándose o no está activa", async () => {
      const service = new TenantChatwootEmbedService({
        findAccountByClientId: vi.fn().mockResolvedValue({
          state: "provisioning",
          chatwootAccountId: null,
        }),
      });

      const res = await service.resolveWorkspaceEmbedRedirect({
        clientId: "c-1",
        user: { id: "u-1", email: "owner@store.com" },
        role: "tenant_owner",
        hasCapability: true,
        publicBaseUrl: "https://chatapp.mocter.co",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(404);
        expect(res.code).toBe("CHATWOOT_ACCOUNT_NOT_ACTIVE");
      }
    });

    it("construye URL SSO limpia con NEXT_PUBLIC_CHATWOOT_URL sin puertos hardcoded y persiste chatwootAgentId para agente", async () => {
      const ensureMemberUserInAccount = vi.fn().mockResolvedValue({ userId: 777 });
      const getUserSsoLoginUrl = vi.fn().mockResolvedValue({
        url: "http://mocter-chatwoot-rails-1:3000/app/login?email=agent%40store.com&sso_auth_token=tok-secret",
      });
      const updateCellChatwootAgentId = vi.fn().mockResolvedValue(undefined);

      const service = new TenantChatwootEmbedService({
        findAccountByClientId: vi.fn().mockResolvedValue({
          state: "active",
          chatwootAccountId: 42,
        }),
        findCellMembership: vi.fn().mockResolvedValue({
          status: "active",
          grantChatwootAccess: true,
          chatwootAgentId: null,
        }),
        updateCellChatwootAgentId,
        createGateway: () => ({
          createAccount: vi.fn(),
          ensureServiceUser: vi.fn(),
          ensureWebchatInbox: vi.fn(),
          ensureMemberUserInAccount,
          getUserSsoLoginUrl,
        }),
      });

      const res = await service.resolveWorkspaceEmbedRedirect({
        clientId: "c-1",
        user: { id: "u-agent", email: "agent@store.com", displayName: "Agente" },
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
        hasCapability: true,
        publicBaseUrl: "https://chatapp.mocter.co/",
        requestId: "req-2",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.accountId).toBe(42);
        expect(res.data.mappedRole).toBe("agent");
        expect(res.data.targetPath).toBe("/app/accounts/42/dashboard");
        expect(res.data.redirectUrl.startsWith("https://chatapp.mocter.co/app/login?")).toBe(true);
        expect(res.data.redirectUrl).toContain("redirect_to=%2Fapp%2Faccounts%2F42%2Fdashboard");
        expect(res.data.redirectUrl).toContain("sso_account_id=42");
        expect(res.data.redirectUrl).not.toContain("localhost:3001");
      }

      expect(ensureMemberUserInAccount).toHaveBeenCalledWith({
        accountId: 42,
        email: "agent@store.com",
        name: "Agente",
        role: "agent",
      });
      expect(updateCellChatwootAgentId).toHaveBeenCalledWith("c-1", "u-agent", 777);
    });

    it("retorna 502 CHATWOOT_SSO_UNAVAILABLE si falta configuración pública o cae el gateway SSO", async () => {
      const serviceNoUrl = new TenantChatwootEmbedService({
        findAccountByClientId: vi.fn().mockResolvedValue({
          state: "active",
          chatwootAccountId: 42,
        }),
        resolvePublicBaseUrl: () => undefined,
      });

      const missingUrlRes = await serviceNoUrl.resolveWorkspaceEmbedRedirect({
        clientId: "c-1",
        user: { id: "u-1", email: "owner@store.com" },
        role: "tenant_owner",
        hasCapability: true,
      });

      expect(missingUrlRes.ok).toBe(false);
      if (!missingUrlRes.ok) {
        expect(missingUrlRes.status).toBe(502);
        expect(missingUrlRes.code).toBe("CHATWOOT_CONFIG_MISSING");
      }

      const serviceGatewayError = new TenantChatwootEmbedService({
        findAccountByClientId: vi.fn().mockResolvedValue({
          state: "active",
          chatwootAccountId: 42,
        }),
        createGateway: () => ({
          createAccount: vi.fn(),
          ensureServiceUser: vi.fn(),
          ensureWebchatInbox: vi.fn(),
          ensureMemberUserInAccount: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
          getUserSsoLoginUrl: vi.fn(),
        }),
      });

      const gatewayFailRes = await serviceGatewayError.resolveWorkspaceEmbedRedirect({
        clientId: "c-1",
        user: { id: "u-1", email: "owner@store.com" },
        role: "tenant_owner",
        hasCapability: true,
        publicBaseUrl: "https://chatapp.mocter.co",
      });

      expect(gatewayFailRes.ok).toBe(false);
      if (!gatewayFailRes.ok) {
        expect(gatewayFailRes.status).toBe(502);
        expect(gatewayFailRes.code).toBe("CHATWOOT_SSO_UNAVAILABLE");
      }
    });
  });
});
