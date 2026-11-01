import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockOverview = {
  kpis: { totalTenants: 1, activeTenants: 1, suspendedTenants: 0, onboardingTenants: 0 },
  tenants: [],
  availablePlans: [],
  availableCells: [],
};

vi.mock("@mocter/domain", () => ({
  fetchAdminTenantsOverview: vi.fn().mockImplementation(() => Promise.resolve(mockOverview)),
  createAdminTenant: vi.fn().mockImplementation((input) => {
    if (input.slug === "invalido@") {
      return Promise.resolve({ ok: false, error: "Slug inválido", code: "INVALID_SLUG" });
    }
    return Promise.resolve({
      ok: true,
      data: {
        id: "new-tenant-id",
        slug: input.slug,
        displayName: input.displayName,
        lifecycleStatus: "activo",
      },
    });
  }),
  updateAdminTenantLifecycle: vi.fn().mockImplementation((input) => {
    if (input.clientId === "inexistente") {
      return Promise.resolve({ ok: false, error: "No existe", code: "NOT_FOUND" });
    }
    return Promise.resolve({ ok: true, data: { success: true, lifecycleStatus: input.lifecycleStatus } });
  }),
}));

describe("ADM-001 §6 · Route Handler (/api/admin/tenants)", () => {
  it("GET responde 200 con el resumen integral de inquilinos", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.kpis.totalTenants).toBe(1);
  });

  it("POST rechaza con 400 si faltan campos obligatorios para alta manual", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Zapatería" }), // faltan slug, ownerEmail, planId
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("POST ejecuta alta manual exitosamente y retorna 201", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Zapatería Andina",
        slug: "zapateria-andina",
        ownerEmail: "owner@zapateria.com",
        planId: "plan-pro-id",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.slug).toBe("zapateria-andina");
  });

  it("POST action=update_lifecycle actualiza el estado y retorna 200", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_lifecycle",
        clientId: "tenant-01",
        lifecycleStatus: "suspendido",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.lifecycleStatus).toBe("suspendido");
  });
});
