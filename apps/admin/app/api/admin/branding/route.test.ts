import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockSettings = {
  platformBranding: {
    brandName: "Mocter",
    logoUrl: null,
    faviconUrl: null,
    palette: {
      primary: "#2F6BFF",
      primaryForeground: "#FFFFFF",
      accent: "#22D3EE",
      accentForeground: "#0F172A",
    },
    customDomain: "mocter.co",
    customFont: "Chakra Petch, Inter, sans-serif",
    removeMocterBranding: false,
  },
  tenantsBrandings: [
    {
      clientId: "tenant-01",
      clientDisplayName: "Café Origen",
      clientSlug: "cafe-origen",
      brandName: "Café Especial",
      logoUrl: "https://cafe.com/logo.png",
      primaryColor: "#78350F",
      customDomain: "cafe.com",
      hasCustomBranding: true,
      updatedAt: new Date(),
    },
  ],
};

vi.mock("@mocter/domain", () => ({
  fetchAdminBrandingSettings: vi.fn().mockImplementation(() => Promise.resolve(mockSettings)),
  saveAdminBrandingSettings: vi.fn().mockImplementation((input) => {
    if (input.primaryColor === "#FFFF00" && input.primaryForeground === "#FFFFFF") {
      return Promise.resolve({
        ok: false,
        error: "El contraste entre #FFFFFF y #FFFF00 es inferior al mínimo exigido de 4.5:1",
        code: "CONTRAST_RATIO_FAILED",
      });
    }
    return Promise.resolve({
      ok: true,
      data: {
        clientId: input.clientId || "platform-client",
        brandName: input.brandName || "Mocter",
        palette: {
          primary: input.primaryColor || "#2F6BFF",
          primaryForeground: input.primaryForeground || "#FFFFFF",
        },
      },
    });
  }),
  resetAdminTenantBranding: vi.fn().mockImplementation((clientId) => {
    if (!clientId) {
      return Promise.resolve({ ok: false, error: "ID requerido", code: "VALIDATION_ERROR" });
    }
    return Promise.resolve({ ok: true, data: { restored: true } });
  }),
}));

describe("ADM-001 / DSN-001 · Route Handler (/api/admin/branding)", () => {
  it("GET responde 200 con la configuración de identidad institucional y de inquilinos", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.platformBranding.brandName).toBe("Mocter");
    expect(json.data.tenantsBrandings.length).toBe(1);
  });

  it("POST guarda la configuración de marca corporativa y responde 200", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandName: "Mocter Cloud",
        primaryColor: "#2F6BFF",
        primaryForeground: "#FFFFFF",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.brandName).toBe("Mocter Cloud");
  });

  it("POST rechaza con 400 cuando el contraste accesible no cumple la norma WCAG 2.2 AA", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryColor: "#FFFF00",
        primaryForeground: "#FFFFFF",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("CONTRAST_RATIO_FAILED");
  });

  it("POST con acción reset restaura la marca de un inquilino a los valores predeterminados", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", clientId: "tenant-01" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.restored).toBe(true);
  });
});
