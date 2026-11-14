import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { err, ok } from "@mocter/domain";
import { GET as profileGET, PATCH as profilePATCH } from "./profile/route";
import { POST as logoPOST, DELETE as logoDELETE } from "./profile/logo/route";
import { GET as channelsGET, POST as channelsPOST } from "./payment-channels/route";
import { PATCH as channelPATCH, DELETE as channelDELETE } from "./payment-channels/[id]/route";

const mockResolvePortalContext = vi.fn();
const mockGetTenantProfile = vi.fn();
const mockUpdateTenantProfile = vi.fn();
const mockUploadTenantLogo = vi.fn();
const mockRemoveTenantLogo = vi.fn();
const mockListChannels = vi.fn();
const mockCreateChannel = vi.fn();
const mockUpdateChannel = vi.fn();
const mockDeleteChannel = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: (...args: unknown[]) => mockResolvePortalContext(...args),
    tenantProfileService: {
      getTenantProfile: (...args: unknown[]) => mockGetTenantProfile(...args),
      updateTenantProfile: (...args: unknown[]) => mockUpdateTenantProfile(...args),
      uploadTenantLogo: (...args: unknown[]) => mockUploadTenantLogo(...args),
      removeTenantLogo: (...args: unknown[]) => mockRemoveTenantLogo(...args),
    },
    tenantPaymentChannelsService: {
      listChannels: (...args: unknown[]) => mockListChannels(...args),
      createChannel: (...args: unknown[]) => mockCreateChannel(...args),
      updateChannel: (...args: unknown[]) => mockUpdateChannel(...args),
      deleteChannel: (...args: unknown[]) => mockDeleteChannel(...args),
    },
  };
});

describe("SPEC-05 T-03 · Endpoints de Perfil del Comercio, Logo y Canales de Pago", () => {
  const clientId = "22222222-2222-7222-8222-222222222222";
  const channelId = "33333333-3333-7333-8333-333333333333";

  const ownerContext = {
    user: { id: "11111111-1111-7111-8111-111111111111", email: "owner@tienda.co" },
    session: { id: "sid-owner" },
    scope: "tenant",
    role: "tenant_owner",
    effectiveRoles: ["tenant_owner"],
    activeClientId: clientId,
    activeClient: { id: clientId, slug: "tienda-cafe", displayName: "Tienda Café" },
    lifecycleStatus: "activo",
  };

  const agentContext = {
    ...ownerContext,
    user: { id: "44444444-4444-7444-8444-444444444444", email: "agent@tienda.co" },
    role: "tenant_agent",
    effectiveRoles: ["tenant_agent"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePortalContext.mockResolvedValue(ownerContext);
  });

  function makeReq(url: string, init: Record<string, unknown> = {}, cookie = "mocter_sid=sid-owner") {
    return new NextRequest(url, {
      ...init,
      headers: {
        cookie,
        ...(init.headers as Record<string, string> | undefined),
      },
    } as ConstructorParameters<typeof NextRequest>[1]);
  }

  it("GET /api/tenant/profile permite lectura tanto a tenant_owner como a tenant_agent", async () => {
    mockResolvePortalContext.mockResolvedValue(agentContext);
    mockGetTenantProfile.mockResolvedValue(
      ok({
        id: clientId,
        slug: "tienda-cafe",
        displayName: "Tienda Café",
        commercialEmail: "ventas@tiendacafe.co",
        contactEmail: "owner@tiendacafe.co",
        locale: "es",
      }),
    );

    const res = await profileGET(makeReq("http://localhost:3003/api/tenant/profile"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.slug).toBe("tienda-cafe");
  });

  it("PATCH /api/tenant/profile actualiza perfil, cambia idioma y emite cookie mocter_locale", async () => {
    mockUpdateTenantProfile.mockResolvedValue(
      ok({
        id: clientId,
        slug: "tienda-cafe",
        displayName: "Tienda Café SAS",
        commercialEmail: "ventas@tiendacafe.co",
        locale: "en",
      }),
    );

    const res = await profilePATCH(
      makeReq("http://localhost:3003/api/tenant/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Tienda Café SAS",
          commercialEmail: "ventas@tiendacafe.co",
          locale: "en",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-mocter-locale")).toBe("en");
    expect(res.headers.get("set-cookie")).toContain("mocter_locale=en");
  });

  it("PATCH /api/tenant/profile y POST /api/tenant/payment-channels rechazan con 403 a tenant_agent", async () => {
    mockResolvePortalContext.mockResolvedValue(agentContext);

    const profileRes = await profilePATCH(
      makeReq("http://localhost:3003/api/tenant/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Cambio" }),
      }),
    );
    expect(profileRes.status).toBe(403);

    const channelRes = await channelsPOST(
      makeReq("http://localhost:3003/api/tenant/payment-channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelCode: "nequi", displayName: "Nequi" }),
      }),
    );
    expect(channelRes.status).toBe(403);
  });

  it("POST y DELETE /api/tenant/profile/logo gestionan el logotipo comercial", async () => {
    mockUploadTenantLogo.mockResolvedValue(
      ok({
        logoMediaId: "55555555-5555-7555-8555-555555555555",
        logoResolvedUrl: "https://img.mocter.co/signed/logo.png",
      }),
    );

    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" }));

    const uploadRes = await logoPOST(
      makeReq("http://localhost:3003/api/tenant/profile/logo", {
        method: "POST",
        body: form,
      }),
    );
    expect(uploadRes.status).toBe(200);

    mockRemoveTenantLogo.mockResolvedValue(ok({ logoMediaId: null, logoResolvedUrl: null }));
    const deleteRes = await logoDELETE(
      makeReq("http://localhost:3003/api/tenant/profile/logo", { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(200);
  });

  it("DELETE /api/tenant/payment-channels/[id] retorna HTTP 409 CHANNEL_USED_IN_ORDERS cuando tiene pedidos históricos", async () => {
    mockDeleteChannel.mockResolvedValue(
      err("Este canal ya fue utilizado en pedidos.", "CHANNEL_USED_IN_ORDERS"),
    );

    const res = await channelDELETE(
      makeReq(`http://localhost:3003/api/tenant/payment-channels/${channelId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: channelId }) },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("CHANNEL_USED_IN_ORDERS");
  });

  it("PATCH /api/tenant/payment-channels/[id] retorna 400 ante ID no UUID y 200 al actualizar canal", async () => {
    const badRes = await channelPATCH(
      makeReq("http://localhost:3003/api/tenant/payment-channels/not-a-uuid", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badRes.status).toBe(400);

    mockUpdateChannel.mockResolvedValue(
      ok({
        id: channelId,
        clientId,
        channelCode: "nequi",
        displayName: "Nequi Empresarial",
        isActive: false,
      }),
    );

    const okRes = await channelPATCH(
      makeReq(`http://localhost:3003/api/tenant/payment-channels/${channelId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: channelId }) },
    );
    expect(okRes.status).toBe(200);

    mockListChannels.mockResolvedValue(ok([{ id: channelId, channelCode: "nequi" }]));
    const listRes = await channelsGET(makeReq("http://localhost:3003/api/tenant/payment-channels"));
    expect(listRes.status).toBe(200);
  });
});
