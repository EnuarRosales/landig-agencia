import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { err, ok, WhiteLabelService } from "@mocter/domain";
import { GET as brandingGET, PUT as brandingPUT, DELETE as brandingDELETE } from "./branding/route";
import { GET as assetGET, POST as assetPOST } from "./branding/asset/route";

const mockResolvePortalContext = vi.fn();
const mockGetCapabilityMode = vi.fn();
const mockGetActiveBranding = vi.fn();
const mockUpdateBranding = vi.fn();
const mockResetToDefault = vi.fn();
const mockUploadTenantLogo = vi.fn();
const mockPutObject = vi.fn();
const mockGetObject = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: (...args: unknown[]) => mockResolvePortalContext(...args),
    getWhiteLabelService: () => ({
      getCapabilityMode: (...args: unknown[]) => mockGetCapabilityMode(...args),
      getActiveBranding: (...args: unknown[]) => mockGetActiveBranding(...args),
      updateBranding: (...args: unknown[]) => mockUpdateBranding(...args),
      resetToDefault: (...args: unknown[]) => mockResetToDefault(...args),
    }),
    tenantProfileService: {
      uploadTenantLogo: (...args: unknown[]) => mockUploadTenantLogo(...args),
    },
    S3StorageService: class {
      putObject(...args: unknown[]) {
        return mockPutObject(...args);
      }
      getObject(...args: unknown[]) {
        return mockGetObject(...args);
      }
    },
  };
});

describe("SPEC-07 T-02 · Endpoints /api/tenant/branding y /api/tenant/branding/asset", () => {
  const clientId = "22222222-2222-7222-8222-222222222222";
  const otherClientId = "99999999-9999-7999-8999-999999999999";

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
    role: "tenant_agent",
    effectiveRoles: ["tenant_agent"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePortalContext.mockResolvedValue(ownerContext);
    mockGetCapabilityMode.mockResolvedValue("completa");
    mockGetActiveBranding.mockResolvedValue(ok(null));
    mockPutObject.mockResolvedValue({ ok: true });
    mockGetObject.mockResolvedValue({
      ok: true,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: "image/png",
    });
  });

  function makeReq(url: string, init: Record<string, unknown> = {}) {
    return new NextRequest(url, {
      ...init,
      headers: {
        cookie: "mocter_sid=sid-owner",
        ...(init.headers as Record<string, string> | undefined),
      },
    } as ConstructorParameters<typeof NextRequest>[1]);
  }

  it("GET /api/tenant/branding retorna modo, branding, tokens CSS y fuentes permitidas", async () => {
    mockResolvePortalContext.mockResolvedValue(agentContext);
    mockGetCapabilityMode.mockResolvedValue("paleta");
    mockGetActiveBranding.mockResolvedValue(
      ok({
        clientId,
        brandName: null,
        logoUrl: null,
        faviconUrl: null,
        palette: { primary: "#10B981", primaryForeground: "#042F2E" },
        removeMocterBranding: false,
        customDomain: null,
        customFont: null,
        updatedAt: new Date("2026-11-14T10:00:00Z"),
      }),
    );

    const res = await brandingGET(makeReq("https://mocter.co/api/tenant/branding"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.mode).toBe("paleta");
    expect(json.data.tokens).toEqual(
      WhiteLabelService.buildBackofficeCssTokens({
        primary: "#10B981",
        primaryForeground: "#042F2E",
      }),
    );
    expect(Array.isArray(json.data.allowedFonts)).toBe(true);
  });

  it("PUT /api/tenant/branding rechaza a tenant_agent (403) y valida payload Zod (400)", async () => {
    mockResolvePortalContext.mockResolvedValue(agentContext);
    const forbiddenRes = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({ palette: { primary: "#10B981", primaryForeground: "#042F2E" } }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(forbiddenRes.status).toBe(403);

    mockResolvePortalContext.mockResolvedValue(ownerContext);
    const badRes = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({ logoUrl: "javascript:alert(1)" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(badRes.status).toBe(400);
    const badJson = await badRes.json();
    expect(badJson.code).toBe("VALIDATION_ERROR");
  });

  it("PUT /api/tenant/branding mapea errores 403, 409, 422 y persiste con 200", async () => {
    mockUpdateBranding.mockResolvedValueOnce(
      err("Sin plan", "FORBIDDEN_WHITE_LABEL_NOT_IN_PLAN"),
    );
    const res403Plan = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({ palette: { primary: "#10B981", primaryForeground: "#042F2E" } }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res403Plan.status).toBe(403);
    expect((await res403Plan.json()).code).toBe("WHITE_LABEL_NOT_IN_PLAN");

    mockUpdateBranding.mockResolvedValueOnce(
      err("Requiere enterprise", "FORBIDDEN_FULL_WHITE_LABEL_REQUIRED"),
    );
    const res403Full = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({ customDomain: "tienda.miempresa.co" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res403Full.status).toBe(403);
    expect((await res403Full.json()).code).toBe("ENTERPRISE_BRANDING_REQUIRED");

    mockUpdateBranding.mockResolvedValueOnce(err("Dominio tomado", "CUSTOM_DOMAIN_IN_USE"));
    const res409 = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({ customDomain: "duplicado.miempresa.co" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res409.status).toBe(409);
    expect((await res409.json()).code).toBe("CUSTOM_DOMAIN_IN_USE");

    mockUpdateBranding.mockResolvedValueOnce(err("Contraste bajo", "CONTRAST_RATIO_FAILED"));
    const res422 = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({ palette: { primary: "#FFFFFF", primaryForeground: "#FAFAFA" } }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res422.status).toBe(422);
    expect((await res422.json()).code).toBe("WCAG_CONTRAST_TOO_LOW");

    mockUpdateBranding.mockResolvedValueOnce(
      ok({
        clientId,
        brandName: "Tienda Pro",
        logoUrl: null,
        faviconUrl: null,
        palette: { primary: "#0F766E", primaryForeground: "#FFFFFF" },
        removeMocterBranding: true,
        customDomain: "tienda.pro.co",
        customFont: "Inter",
        updatedAt: new Date("2026-11-14T11:00:00Z"),
      }),
    );
    const res200 = await brandingPUT(
      makeReq("https://mocter.co/api/tenant/branding", {
        method: "PUT",
        body: JSON.stringify({
          brandName: "Tienda Pro",
          palette: { primary: "#0F766E", primaryForeground: "#FFFFFF" },
          removeMocterBranding: true,
          customDomain: "tienda.pro.co",
          customFont: "Inter",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res200.status).toBe(200);
    const okJson = await res200.json();
    expect(okJson.ok).toBe(true);
    expect(okJson.data.tokens["--dsn-accent"]).toBe("#0F766E");
  });

  it("DELETE /api/tenant/branding restaura defaults (200)", async () => {
    mockResetToDefault.mockResolvedValueOnce(ok({ restored: true }));
    const res = await brandingDELETE(
      makeReq("https://mocter.co/api/tenant/branding", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ restored: true });
    expect(mockResetToDefault).toHaveBeenCalledWith(clientId);
  });

  it("POST y GET /api/tenant/branding/asset validan plan, magic bytes, XSS SVG y aislamiento por comercio", async () => {
    mockGetCapabilityMode.mockResolvedValueOnce("paleta");
    const fdPaleta = new FormData();
    fdPaleta.set("kind", "favicon");
    fdPaleta.set(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "fav.png", {
        type: "image/png",
      }),
    );
    const resBlocked = await assetPOST(
      makeReq("https://mocter.co/api/tenant/branding/asset", { method: "POST", body: fdPaleta }),
    );
    expect(resBlocked.status).toBe(403);
    expect((await resBlocked.json()).code).toBe("ENTERPRISE_BRANDING_REQUIRED");

    // SVG con <script> bloqueado -> 422
    const fdBadSvg = new FormData();
    fdBadSvg.set("kind", "favicon");
    fdBadSvg.set(
      "file",
      new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "x.svg", {
        type: "image/svg+xml",
      }),
    );
    const resBadSvg = await assetPOST(
      makeReq("https://mocter.co/api/tenant/branding/asset", { method: "POST", body: fdBadSvg }),
    );
    expect(resBadSvg.status).toBe(422);
    expect((await resBadSvg.json()).code).toBe("UNSUPPORTED_MEDIA_FORMAT");

    // PNG válido -> 200
    mockUpdateBranding.mockResolvedValueOnce(
      ok({
        clientId,
        brandName: null,
        logoUrl: null,
        faviconUrl: `/api/tenant/branding/asset?key=branding/${clientId}/favicon-1234567890ab.png`,
        palette: null,
        removeMocterBranding: false,
        customDomain: null,
        customFont: null,
        updatedAt: new Date(),
      }),
    );
    const fdGoodPng = new FormData();
    fdGoodPng.set("kind", "favicon");
    fdGoodPng.set(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "fav.png", {
        type: "image/png",
      }),
    );
    const resOkFav = await assetPOST(
      makeReq("https://mocter.co/api/tenant/branding/asset", { method: "POST", body: fdGoodPng }),
    );
    expect(resOkFav.status).toBe(200);
    const favJson = await resOkFav.json();
    expect(favJson.data.kind).toBe("favicon");
    expect(favJson.data.url).toContain("/api/tenant/branding/asset?key=");
    expect(mockPutObject).toHaveBeenCalledTimes(1);

    // GET aislamiento entre comercios (403) vs comercio propio (200)
    const crossTenantGet = await assetGET(
      makeReq(
        `https://mocter.co/api/tenant/branding/asset?key=${encodeURIComponent(`branding/${otherClientId}/favicon-abcdef123456.png`)}`,
      ),
    );
    expect(crossTenantGet.status).toBe(403);

    const ownGet = await assetGET(
      makeReq(
        `https://mocter.co/api/tenant/branding/asset?key=${encodeURIComponent(`branding/${clientId}/favicon-abcdef123456.png`)}`,
      ),
    );
    expect(ownGet.status).toBe(200);
    expect(ownGet.headers.get("content-type")).toBe("image/png");
  });
});
