import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT, DELETE } from "./route";
import * as domain from "@mocter/domain";

vi.mock("@mocter/domain", () => ({
  fetchAdminPlans: vi.fn(),
  createAdminPlan: vi.fn(),
  updateAdminPlan: vi.fn(),
  deleteAdminPlan: vi.fn(),
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

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].activeTenantsCount).toBe(3);
  });

  it("POST: registra un nuevo plan comercial exitosamente", async () => {
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
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.code).toBe("scale");
  });

  it("PUT: actualiza un plan comercial existente", async () => {
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
