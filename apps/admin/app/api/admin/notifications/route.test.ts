import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePlatformAdmin = vi.fn();
const mockFetchAdminEmailSettings = vi.fn();
const mockToggleAdminEmailEvent = vi.fn();
const mockSaveAdminEmailTemplate = vi.fn();
const mockSaveAdminEmailBilingualTemplates = vi.fn();
const mockSaveAdminEmailLayoutConfig = vi.fn();

vi.mock("@/lib/billing-route-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing-route-auth")>(
    "@/lib/billing-route-auth",
  );
  return {
    ...actual,
    requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
  };
});

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    fetchAdminEmailSettings: (...args: unknown[]) => mockFetchAdminEmailSettings(...args),
    saveAdminSmtpProvider: vi.fn(),
    saveAdminEmailSender: vi.fn(),
    saveAdminEmailTemplate: (...args: unknown[]) => mockSaveAdminEmailTemplate(...args),
    saveAdminEmailBilingualTemplates: (...args: unknown[]) => mockSaveAdminEmailBilingualTemplates(...args),
    saveAdminEmailLayoutConfig: (...args: unknown[]) => mockSaveAdminEmailLayoutConfig(...args),
    toggleAdminEmailEvent: (...args: unknown[]) => mockToggleAdminEmailEvent(...args),
  };
});

import { GET, POST } from "./route";
import { HttpError } from "@/lib/errors/route";

describe("SPEC-14 · /api/admin/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAdmin.mockResolvedValue({
      scope: "platform",
      role: "platform_owner",
      effectiveRoles: ["platform_owner"],
      user: { id: "u-admin", email: "owner@mocter.co" },
    });
  });

  it("rechaza peticiones sin sesión o sin rol platform_* (401/403 RFC 9457)", async () => {
    mockRequirePlatformAdmin.mockRejectedValueOnce(
      new HttpError(403, "Acceso restringido: requiere rol platform_owner o platform_admin."),
    );

    const req = new NextRequest("http://localhost:3003/api/admin/notifications");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("ejecuta toggle_event para activar/desactivar eventos configurables y devuelve 422 si es evento de sistema", async () => {
    mockToggleAdminEmailEvent.mockResolvedValueOnce({
      ok: true,
      data: { key: "tenant.inventory.low_stock", isEnabled: false },
    });

    const req1 = new NextRequest("http://localhost:3003/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_event",
        eventKey: "tenant.inventory.low_stock",
        isEnabled: false,
      }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.ok).toBe(true);
    expect(json1.data.isEnabled).toBe(false);

    mockToggleAdminEmailEvent.mockResolvedValueOnce({
      ok: false,
      code: "SYSTEM_EVENT_CANNOT_BE_DISABLED",
      error: "Los eventos críticos de sistema (auth.*) no pueden desactivarse.",
    });

    const req2 = new NextRequest("http://localhost:3003/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_event",
        eventKey: "auth.verify_email",
        isEnabled: false,
      }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(422);
    const json2 = await res2.json();
    expect(json2.code).toBe("SYSTEM_EVENT_CANNOT_BE_DISABLED");
  });

  it("ejecuta save_layout para guardar el encabezado y pie global en es/en", async () => {
    mockSaveAdminEmailLayoutConfig.mockResolvedValueOnce({
      ok: true,
      data: {
        id: "layout-es",
        locale: "es",
        headerHtml: "<div>Header</div>",
        footerHtml: "<div>Footer</div>",
        isEnabled: true,
      },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_layout",
        locale: "es",
        headerHtml: "<div>Header</div>",
        footerHtml: "<div>Footer</div>",
        isEnabled: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.locale).toBe("es");
  });

  it("ejecuta save_bilingual_template guardando es/en con remitente compartido y protege auth.* contra platform_admin", async () => {
    mockSaveAdminEmailBilingualTemplates.mockResolvedValueOnce({
      ok: true,
      data: { ids: { es: "tpl-es-1", en: "tpl-en-1" }, savedLocales: ["es", "en"] },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_bilingual_template",
        eventKey: "tenant.welcome",
        senderId: "sender-1",
        status: "published",
        translations: {
          es: { id: "tpl-es-1", subject: "Hola {{owner_name}}", bodyHtml: "<p>Bienvenido</p>" },
          en: { id: "tpl-en-1", subject: "Hi {{owner_name}}", bodyHtml: "<p>Welcome</p>" },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.savedLocales).toEqual(["es", "en"]);
    expect(mockSaveAdminEmailBilingualTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "tenant.welcome",
        senderId: "sender-1",
        status: "published",
      }),
    );

    mockRequirePlatformAdmin.mockResolvedValueOnce({
      scope: "platform",
      role: "platform_admin",
      effectiveRoles: ["platform_admin"],
      user: { id: "u-admin2", email: "admin@mocter.co" },
    });

    const forbiddenReq = new NextRequest("http://localhost:3003/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_bilingual_template",
        eventKey: "auth.verify_email",
        senderId: "sender-1",
        status: "published",
        translations: {
          es: { subject: "Verifica", bodyHtml: "<p>Hola</p>" },
        },
      }),
    });
    const forbiddenRes = await POST(forbiddenReq);
    expect(forbiddenRes.status).toBe(403);
  });
});
