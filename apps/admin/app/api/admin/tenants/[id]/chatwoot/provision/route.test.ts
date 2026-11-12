import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { POST } from "./route";

const mockResolveAuthenticatedPortalContext = vi.fn();
const mockProvisionTenantChatwootAccount = vi.fn();
const mockGetTenantChatwootAccount = vi.fn();
const mockSelect = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@mocter/domain", () => ({
  resolveAuthenticatedPortalContext: (...args: unknown[]) => mockResolveAuthenticatedPortalContext(...args),
  provisionTenantChatwootAccount: (...args: unknown[]) => mockProvisionTenantChatwootAccount(...args),
  getTenantChatwootAccount: (...args: unknown[]) => mockGetTenantChatwootAccount(...args),
  getDb: () => ({
    select: () => mockSelect(),
  }),
  clients: { id: "id" },
  eq: vi.fn(),
  appLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("POST /api/admin/tenants/[id]/chatwoot/provision", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "sid-valid" }),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
  });

  it("responde 401 cuando no hay cookie de sesión", async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/provision", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(401);
  });

  it("responde 403 cuando el usuario no es platform_owner ni platform_admin", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-regular", email: "regular@store.com" },
      role: "tenant_owner",
      effectiveRoles: ["tenant_owner"],
    });

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/provision", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(403);
  });

  it("responde 404 cuando el inquilino no existe", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@mocter.co" },
      role: "platform_owner",
      effectiveRoles: ["platform_owner"],
    });

    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/non-existent/chatwoot/provision", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "non-existent" }) });

    expect(res.status).toBe(404);
  });

  it("aprovisiona exitosamente la cuenta de Chatwoot y retorna 200 con el registro", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@mocter.co" },
      role: "platform_admin",
      effectiveRoles: ["platform_admin"],
    });

    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "c1", planId: "p-pro", displayName: "Tienda Uno" }]),
        }),
      }),
    });

    mockProvisionTenantChatwootAccount.mockResolvedValueOnce({
      ok: true,
      data: { chatwootAccountId: 55, state: "active" },
    });

    mockGetTenantChatwootAccount.mockResolvedValueOnce({
      clientId: "c1",
      chatwootAccountId: 55,
      state: "active",
      lastError: null,
    });

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/provision", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.state).toBe("active");
    expect(body.data.chatwootAccountId).toBe(55);
  });

  it("retorna 502 con el estado fallido cuando el aprovisionamiento falla", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@mocter.co" },
      role: "platform_owner",
      effectiveRoles: ["platform_owner"],
    });

    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "c1", planId: "p-pro", displayName: "Tienda Uno" }]),
        }),
      }),
    });

    mockProvisionTenantChatwootAccount.mockResolvedValueOnce({
      ok: false,
      error: "Error de conexión con Chatwoot",
      code: "CHATWOOT_UNREACHABLE",
    });

    mockGetTenantChatwootAccount.mockResolvedValueOnce({
      clientId: "c1",
      chatwootAccountId: null,
      state: "failed",
      lastError: "Error de conexión con Chatwoot",
    });

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/provision", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Error de conexión con Chatwoot");
    expect(body.data.state).toBe("failed");
  });
});
