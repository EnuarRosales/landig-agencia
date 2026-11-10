import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAuthenticatedPortalContext } from "./session-context.service";
import { authService } from "./auth.service";
import * as cellAuth from "./cell-authorization.service";
import * as dbClient from "../db/client";
import { ok, err } from "../types/result";

describe("TNT-001 / ADM-D-35 · session-context.service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Retorna null ante token de sesión vacío o nulo", async () => {
    const resEmpty = await resolveAuthenticatedPortalContext("");
    expect(resEmpty).toBeNull();

    const resNull = await resolveAuthenticatedPortalContext(null as unknown as string);
    expect(resNull).toBeNull();
  });

  it("2. Retorna null ante token de sesión compuesto solo por espacios en blanco", async () => {
    const resWhitespace = await resolveAuthenticatedPortalContext("     ");
    expect(resWhitespace).toBeNull();
  });

  it("3. Retorna null cuando authService.validateSession falla o sesión es inválida/revocada", async () => {
    vi.spyOn(authService, "validateSession").mockResolvedValue(
      err("Sesión no encontrada o revocada.", "UNAUTHORIZED"),
    );

    const res = await resolveAuthenticatedPortalContext("invalid_token_123");
    expect(res).toBeNull();
  });

  it("4. Retorna null cuando el usuario tiene status 'disabled'", async () => {
    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-01", userId: "u-01" } as any,
        user: {
          id: "u-01",
          email: "disabled@mocter.co",
          status: "disabled",
          displayName: "Disabled User",
        } as any,
      }),
    );

    const res = await resolveAuthenticatedPortalContext("valid_token_disabled_user");
    expect(res).toBeNull();
  });

  it("5. Operador de plataforma: resuelve scope 'platform' y rol correspondiente sin consultar inquilinos", async () => {
    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-platform", userId: "u-platform" } as any,
        user: {
          id: "u-platform",
          email: "soporte@mocter.co",
          status: "active",
          displayName: "Soporte Mocter",
        } as any,
      }),
    );

    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue(["platform_owner", "platform_admin"]);

    const res = await resolveAuthenticatedPortalContext("valid_platform_token");
    expect(res).not.toBeNull();
    expect(res?.scope).toBe("platform");
    expect(res?.role).toBe("platform_owner");
    expect(res?.effectiveRoles).toEqual(["platform_owner", "platform_admin"]);
    expect(res?.activeClientId).toBeNull();
    expect(res?.activeClient).toBeNull();
    expect(res?.activeCellId).toBeNull();
  });

  it("6. Prospecto sin inquilino asignado: resuelve scope 'onboarding_prospect' y role 'onboarding_prospect'", async () => {
    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-prospect", userId: "u-prospect" } as any,
        user: {
          id: "u-prospect",
          email: "nuevo@comercio.co",
          status: "active",
          displayName: "Nuevo Prospecto",
          activeClientId: null,
        } as any,
      }),
    );

    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue([]);

    // Mock DB select returning no owned client
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);

    const res = await resolveAuthenticatedPortalContext("valid_prospect_token");
    expect(res).not.toBeNull();
    expect(res?.scope).toBe("onboarding_prospect");
    expect(res?.role).toBe("onboarding_prospect");
    expect(res?.lifecycleStatus).toBe("alta");
    expect(res?.activeClientId).toBeNull();
    expect(res?.activeClient).toBeNull();
  });

  it("7. Inquilino en estado 'alta' (onboarding pendiente): resuelve scope 'onboarding_prospect' y rol 'tenant_owner'", async () => {
    const userId = "u-tenant-alta";
    const clientId = "client-alta-01";

    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-alta", userId } as any,
        user: {
          id: userId,
          email: "synergiamarket25@gmail.com",
          status: "active",
          displayName: "Synergia Market Owner",
          activeClientId: clientId,
        } as any,
      }),
    );

    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue([]);

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([
          {
            id: clientId,
            slug: "synergia-market",
            displayName: "Synergia Market",
            ownerUserId: userId,
            lifecycleStatus: "alta",
            planId: "plan-pro",
          },
        ])
        .mockResolvedValueOnce([
          {
            cellId: "cell-uuid-01",
            routingStatus: "active",
          },
        ])
        .mockResolvedValueOnce([
          {
            code: "cell-01",
          },
        ])
        .mockResolvedValueOnce([
          {
            name: { es: "Plan Profesional" },
            code: "pro",
          },
        ]),
    };
    vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);

    const res = await resolveAuthenticatedPortalContext("valid_alta_token");
    expect(res).not.toBeNull();
    expect(res?.scope).toBe("onboarding_prospect");
    expect(res?.role).toBe("tenant_owner");
    expect(res?.lifecycleStatus).toBe("alta");
    expect(res?.activeClientId).toBe(clientId);
    expect(res?.activeClient?.slug).toBe("synergia-market");
    expect(res?.activeCellCode).toBe("cell-01");
    expect(res?.planName).toBe("Plan Profesional");
  });

  it("8. Inquilino en estado 'activo': resuelve scope 'tenant' y rol 'tenant_owner'", async () => {
    const userId = "u-tenant-activo";
    const clientId = "client-activo-01";

    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-activo", userId } as any,
        user: {
          id: userId,
          email: "owner@tienda.com",
          status: "active",
          displayName: "Tienda Activa",
          activeClientId: clientId,
        } as any,
      }),
    );

    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue([]);

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([
          {
            id: clientId,
            slug: "tienda-activa",
            displayName: "Tienda Activa",
            ownerUserId: userId,
            lifecycleStatus: "activo",
            planId: "plan-pro",
          },
        ])
        .mockResolvedValueOnce([
          {
            cellId: "cell-uuid-01",
            routingStatus: "active",
          },
        ])
        .mockResolvedValueOnce([
          {
            code: "cell-01",
          },
        ])
        .mockResolvedValueOnce([
          {
            name: { es: "Plan Avanzado" },
            code: "advanced",
          },
        ]),
    };
    vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);

    const res = await resolveAuthenticatedPortalContext("valid_activo_token");
    expect(res).not.toBeNull();
    expect(res?.scope).toBe("tenant");
    expect(res?.role).toBe("tenant_owner");
    expect(res?.lifecycleStatus).toBe("activo");
    expect(res?.activeClientId).toBe(clientId);
    expect(res?.activeClient?.slug).toBe("tienda-activa");
    expect(res?.activeCellCode).toBe("cell-01");
  });

  it("9. Miembro de equipo que no es owner del comercio: resuelve rol 'tenant_agent'", async () => {
    const userId = "u-agent";
    const ownerId = "u-different-owner";
    const clientId = "client-activo-01";

    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-agent", userId } as any,
        user: {
          id: userId,
          email: "agente@tienda.com",
          status: "active",
          displayName: "Agente Tienda",
          activeClientId: clientId,
        } as any,
      }),
    );

    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue([]);

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([
          {
            id: clientId,
            slug: "tienda-activa",
            displayName: "Tienda Activa",
            ownerUserId: ownerId, // Diferente al usuario en sesión
            lifecycleStatus: "activo",
            planId: "plan-pro",
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);

    const res = await resolveAuthenticatedPortalContext("valid_agent_token");
    expect(res).not.toBeNull();
    expect(res?.scope).toBe("tenant");
    expect(res?.role).toBe("tenant_agent");
  });

  it("10. Eliminación estricta de fallback: bajo ninguna circunstancia un no-plataforma recibe 'platform_owner'", async () => {
    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-unknown", userId: "u-unknown" } as any,
        user: {
          id: "u-unknown",
          email: "desconocido@mocter.co",
          status: "active",
          displayName: "Usuario Anónimo",
          activeClientId: null,
        } as any,
      }),
    );

    // ZERO roles de plataforma
    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue([]);

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);

    const res = await resolveAuthenticatedPortalContext("valid_unknown_token");
    expect(res).not.toBeNull();
    expect(res?.role).not.toBe("platform_owner");
    expect(res?.scope).not.toBe("platform");
    expect(res?.role).toBe("onboarding_prospect");
  });

  it("11. Carga capacidades efectivas del plan del inquilino exitosamente", async () => {
    const userId = "u-tenant-caps";
    const clientId = "client-caps-01";

    vi.spyOn(authService, "validateSession").mockResolvedValue(
      ok({
        session: { id: "sess-caps", userId } as any,
        user: {
          id: userId,
          email: "caps@tienda.com",
          status: "active",
          displayName: "Tienda Caps",
          activeClientId: clientId,
        } as any,
      }),
    );

    vi.spyOn(cellAuth, "fetchUserActivePlatformRoles").mockResolvedValue([]);

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        return {
          limit: vi.fn().mockResolvedValue([
            {
              id: clientId,
              slug: "tienda-caps",
              displayName: "Tienda Caps",
              ownerUserId: userId,
              lifecycleStatus: "activo",
              planId: "plan-caps",
            },
          ]),
          // Para consultas que no usan limit() directamente (ej. planCapabilityValues, clientFeatureOverrides):
          then: (resolve: any) => resolve([
            { capabilityCode: "chatwoot_inboxes", enabled: true },
            { capabilityCode: "custom_branding", enabled: false },
          ]),
        };
      }),
      limit: vi.fn().mockResolvedValue([
        {
          id: clientId,
          slug: "tienda-caps",
          displayName: "Tienda Caps",
          ownerUserId: userId,
          lifecycleStatus: "activo",
          planId: "plan-caps",
        },
      ]),
    };
    vi.spyOn(dbClient, "getDb").mockReturnValue(mockDb as any);

    const res = await resolveAuthenticatedPortalContext("valid_caps_token");
    expect(res).not.toBeNull();
    expect(res?.scope).toBe("tenant");
    expect(typeof res?.capabilities).toBe("object");
  });
});
