import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";
import type { PortalContext } from "@mocter/domain";
import { PATCH } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    updateTenantUserPreferredLocale: vi.fn(async ({ locale }) => ({
      ok: true as const,
      data: { locale },
    })),
  };
});

function buildPortalContext(overrides: {
  role: PortalContext["role"];
  userId: string;
  email: string;
}): PortalContext {
  return {
    scope: "tenant",
    role: overrides.role,
    effectiveRoles: [overrides.role],
    activeClientId: "client-1",
    activeClient: {
      id: "client-1",
      slug: "cafe",
      displayName: "Café",
      name: "Café",
      lifecycleStatus: "activo",
      planId: "plan-pro",
      locale: "es",
    },
    activeCellId: "cell-1",
    activeCellCode: "cell-01",
    planName: "Pro",
    capabilities: {},
    lifecycleStatus: "activo",
    session: { id: "sid-1" },
    user: {
      id: overrides.userId,
      email: overrides.email,
      displayName: overrides.email,
      status: "active",
      emailVerifiedAt: null,
    },
  };
}

describe("SPEC-17 §9.1 · PATCH /api/tenant/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 Problem Details sin cookie de sesión", async () => {
    const req = new NextRequest("http://localhost:3003/api/tenant/locale", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "en" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("retorna 400 Problem Details cuando el idioma no es soportado (ej. 'fr')", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(
      buildPortalContext({ role: "tenant_agent", userId: "u-agent", email: "agent@cafe.co" }),
    );

    const req = new NextRequest("http://localhost:3003/api/tenant/locale", {
      method: "PATCH",
      headers: {
        cookie: "mocter_sid=sid-agent",
        "content-type": "application/json",
      },
      body: JSON.stringify({ locale: "fr" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("actualiza preferencia personal de tenant_agent en cell_users y cookie mocter_locale sin alterar clients.locale", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(
      buildPortalContext({ role: "tenant_agent", userId: "u-agent", email: "agent@cafe.co" }),
    );

    const req = new NextRequest("http://localhost:3003/api/tenant/locale", {
      method: "PATCH",
      headers: {
        cookie: "mocter_sid=sid-agent",
        "content-type": "application/json",
      },
      body: JSON.stringify({ locale: "en" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ locale: "en", preferredLocale: "en" });
    expect(domain.updateTenantUserPreferredLocale).toHaveBeenCalledWith({
      clientId: "client-1",
      userId: "u-agent",
      locale: "en",
      actor: "agent@cafe.co",
    });
    expect(res.headers.get("set-cookie")).toContain("mocter_locale=en");
  });

  it("permite resetear a null para heredar el idioma del comercio (clients.locale)", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(
      buildPortalContext({ role: "tenant_owner", userId: "u-owner", email: "owner@cafe.co" }),
    );

    const req = new NextRequest("http://localhost:3003/api/tenant/locale", {
      method: "PATCH",
      headers: {
        cookie: "mocter_sid=sid-owner",
        "content-type": "application/json",
      },
      body: JSON.stringify({ locale: null }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ locale: "es", preferredLocale: null });
    expect(domain.updateTenantUserPreferredLocale).toHaveBeenCalledWith({
      clientId: "client-1",
      userId: "u-owner",
      locale: null,
      actor: "owner@cafe.co",
    });
  });
});
