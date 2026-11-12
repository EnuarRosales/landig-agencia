import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { GET } from "./route";

const mockResolveAuthenticatedPortalContext = vi.fn();
const mockGetTenantChatwootAccount = vi.fn();
const mockSelect = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@mocter/domain", () => ({
  resolveAuthenticatedPortalContext: (...args: unknown[]) => mockResolveAuthenticatedPortalContext(...args),
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

describe("GET /api/admin/tenants/[id]/chatwoot/status", () => {
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

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/status");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(401);
  });

  it("responde 403 cuando el usuario no es platform_owner ni platform_admin", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-regular", email: "regular@store.com" },
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
    });

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/status");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });

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

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/non-existent/chatwoot/status");
    const res = await GET(req, { params: Promise.resolve({ id: "non-existent" }) });

    expect(res.status).toBe(404);
  });

  it("retorna 200 con el estado de la cuenta de Chatwoot", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@mocter.co" },
      role: "platform_admin",
      effectiveRoles: ["platform_admin"],
    });

    mockSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "c1" }]),
        }),
      }),
    });

    mockGetTenantChatwootAccount.mockResolvedValueOnce({
      clientId: "c1",
      chatwootAccountId: 99,
      state: "active",
      webchatInboxId: 10,
      lastError: null,
    });

    const req = new NextRequest("http://localhost:3003/api/admin/tenants/c1/chatwoot/status");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.state).toBe("active");
    expect(body.data.chatwootAccountId).toBe(99);
  });
});
