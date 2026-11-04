import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT, DELETE } from "./route";
import * as domain from "@mocter/domain";

vi.mock("@mocter/domain", () => ({
  fetchAdminPlans: vi.fn(),
  createAdminPlan: vi.fn(),
  updateAdminPlan: vi.fn(),
  deleteAdminPlan: vi.fn(),
  fetchAdminPlanDetails: vi.fn(),
  fetchChatwootCapabilitiesCatalog: vi.fn(),
}));

describe("BILL-001 / ADM-001 · Plans Route Handler (/api/admin/plans)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET: retorna el inventario de planes con métricas de inquilinos", async () => {
    vi.mocked(domain.fetchAdminPlans).mockResolvedValueOnce([
      {
        id: "plan-1",
        code: "starter",
        name: { es: "Inicial", en: "Starter" },
        description: { es: "Básico", en: "Basic" },
        status: "active",
        isPublic: true,
        isPopular: false,
        sortOrder: 1,
        trialDays: 14,
        graceDays: 7,
        billingCycles: ["monthly", "annual"],
        priceMonthlyCents: 9900000,
        priceAnnualCents: 99000000,
        currency: "COP",
        marketingFeatures: { es: [], en: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "op",
        updatedBy: "op",
        activeTenantsCount: 3,
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/plans");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].activeTenantsCount).toBe(3);
  });

  it("GET ?id=: retorna el detalle integral de un plan con límites y capacidades (T3)", async () => {
    vi.mocked(domain.fetchAdminPlanDetails).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "plan-1",
        code: "growth",
        name: { es: "Crecimiento", en: "Growth" },
        limits: {
          products: { mode: "LIMITED", value: 500 },
          contacts: { mode: "UNLIMITED", value: null },
        },
        capabilities: {
          channel_whatsapp: true,
          agent_management: true,
        },
        chatwootEnabled: true,
      } as any,
    });

    const req = new NextRequest("http://localhost/api/admin/plans?id=plan-1");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.limits.products.mode).toBe("LIMITED");
    expect(json.data.limits.contacts.mode).toBe("UNLIMITED");
    expect(json.data.chatwootEnabled).toBe(true);
  });

  it("GET ?capabilities=true: retorna el catálogo de capacidades Chatwoot v4.19.1 (T3)", async () => {
    vi.mocked(domain.fetchChatwootCapabilitiesCatalog).mockResolvedValueOnce([
      {
        code: "channel_whatsapp",
        name: { es: "Canal de WhatsApp", en: "WhatsApp Channel" },
        ownership: "mocter",
        commercialStatus: "commercial",
      } as any,
    ]);

    const req = new NextRequest("http://localhost/api/admin/plans?capabilities=true");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].code).toBe("channel_whatsapp");
  });

  it("POST: registra un nuevo plan comercial con límites y capacidades estructuradas (T3)", async () => {
    vi.mocked(domain.createAdminPlan).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "plan-new",
        code: "scale",
        name: { es: "Escala", en: "Scale" },
      } as any,
    });

    const req = new NextRequest("http://localhost/api/admin/plans", {
      method: "POST",
      body: JSON.stringify({
        code: "scale",
        nameEs: "Escala",
        priceMonthlyCop: 299000,
        limits: {
          products: { mode: "LIMITED", value: 1000 },
          contacts: { mode: "UNLIMITED", value: null },
        },
        capabilities: {
          channel_whatsapp: true,
        },
        chatwootEnabled: true,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(domain.createAdminPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "scale",
        limits: expect.objectContaining({
          products: { mode: "LIMITED", value: 1000 },
        }),
        chatwootEnabled: true,
      }),
    );
  });

  it("PUT: actualiza un plan comercial con límites y capacidades", async () => {
    vi.mocked(domain.updateAdminPlan).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "plan-1",
        name: { es: "Inicial Editado", en: "Starter Edited" },
      } as any,
    });

    const req = new NextRequest("http://localhost/api/admin/plans", {
      method: "PUT",
      body: JSON.stringify({
        id: "plan-1",
        nameEs: "Inicial Editado",
        priceMonthlyCop: 109000,
        limits: {
          products: { mode: "UNLIMITED", value: null },
        },
      }),
    });

    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(domain.updateAdminPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "plan-1",
        nameEs: "Inicial Editado",
        priceMonthlyCop: 109000,
        limits: {
          products: { mode: "UNLIMITED", value: null },
        },
      })
    );
  });

  it("DELETE: retira o elimina el plan aplicando política híbrida", async () => {
    vi.mocked(domain.deleteAdminPlan).mockResolvedValueOnce({
      ok: true,
      data: {
        action: "retired",
        planId: "plan-1",
        planCode: "starter",
        activeReferencesCount: 2,
      },
    });

    const req = new NextRequest("http://localhost/api/admin/plans?id=plan-1", {
      method: "DELETE",
    });

    const res = await DELETE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.action).toBe("retired");
    expect(domain.deleteAdminPlan).toHaveBeenCalledWith("plan-1");
  });
});

