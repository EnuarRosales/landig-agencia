import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT, DELETE } from "./route";

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
  updateAdminTenant: vi.fn().mockImplementation((input) => {
    if (input.clientId === "inexistente") {
      return Promise.resolve({ ok: false, error: "No existe", code: "NOT_FOUND" });
    }
    return Promise.resolve({
      ok: true,
      data: {
        id: input.clientId,
        displayName: input.displayName || "Comercio Actualizado",
        slug: input.slug || "comercio-actualizado",
        lifecycleStatus: input.lifecycleStatus || "activo",
      },
    });
  }),
  deleteAdminTenant: vi.fn().mockImplementation((clientId) => {
    if (clientId === "inexistente") {
      return Promise.resolve({ ok: false, error: "No existe", code: "NOT_FOUND" });
    }
    return Promise.resolve({ ok: true, data: { success: true, clientId } });
  }),
  resendTenantOnboardingEmail: vi.fn().mockImplementation((clientId) => {
    if (clientId === "inexistente") {
      return Promise.resolve({ ok: false, error: "No existe", code: "NOT_FOUND" });
    }
    return Promise.resolve({ ok: true, data: { success: true, emailSentTo: "owner@test.com" } });
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

  it("POST action=update_tenant actualiza la información y PUT actualiza el inquilino", async () => {
    const reqPost = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_tenant",
        clientId: "tenant-01",
        displayName: "Zapatería Andina Modificada",
      }),
    });

    const resPost = await POST(reqPost);
    expect(resPost.status).toBe(200);
    const jsonPost = await resPost.json();
    expect(jsonPost.ok).toBe(true);
    expect(jsonPost.data.displayName).toBe("Zapatería Andina Modificada");

    const reqPut = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "tenant-01",
        displayName: "Zapatería Andina PUT",
      }),
    });

    const resPut = await PUT(reqPut);
    expect(resPut.status).toBe(200);
    const jsonPut = await resPut.json();
    expect(jsonPut.ok).toBe(true);
  });

  it("POST action=delete_tenant y DELETE dan de baja al inquilino", async () => {
    const reqPost = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_tenant",
        clientId: "tenant-01",
      }),
    });

    const resPost = await POST(reqPost);
    expect(resPost.status).toBe(200);
    const jsonPost = await resPost.json();
    expect(jsonPost.ok).toBe(true);
    expect(jsonPost.data.success).toBe(true);

    const reqDelete = new NextRequest("http://localhost:3003/api/admin/tenants?clientId=tenant-01", {
      method: "DELETE",
    });

    const resDelete = await DELETE(reqDelete);
    expect(resDelete.status).toBe(200);
    const jsonDelete = await resDelete.json();
    expect(jsonDelete.ok).toBe(true);
  });

  it("POST action=resend_onboarding despacha correo de bienvenida y verificación", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resend_onboarding",
        clientId: "tenant-01",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.emailSentTo).toBe("owner@test.com");
  });
});
