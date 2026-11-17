import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockResolveTenantSession = vi.fn();
const mockGetTenantChatwootAccount = vi.fn();
const mockProvisionTenantChatwootAccount = vi.fn();
const mockGetDb = vi.fn();

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: (...args: unknown[]) => mockResolveTenantSession(...args),
}));

vi.mock("@mocter/domain", () => ({
  isTenantOwnerRole: (role?: string | null, effectiveRoles?: string[] | null) =>
    (Array.isArray(effectiveRoles) && effectiveRoles.includes("tenant_owner")) ||
    role === "tenant_owner",
  getTenantChatwootAccount: (...args: unknown[]) => mockGetTenantChatwootAccount(...args),
  provisionTenantChatwootAccount: (...args: unknown[]) =>
    mockProvisionTenantChatwootAccount(...args),
  getDb: () => mockGetDb(),
  clients: { id: "id", planId: "plan_id" },
  eq: vi.fn(),
  appLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("apps/admin · POST /api/tenant/conversations/retry (SPEC-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza con 403 cuando quien solicita no es tenant_owner", async () => {
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "c-1",
      context: {
        user: { id: "u-agent", email: "agent@store.com" },
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
        capabilities: { chatwoot_inboxes: true },
        activeClient: { id: "c-1", planId: "plan-pro" },
      },
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/conversations/retry", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(mockProvisionTenantChatwootAccount).not.toHaveBeenCalled();
  });

  it("rechaza con 403 cuando el plan no incluye chatwoot_inboxes o la cuenta está suspendida", async () => {
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "c-1",
      context: {
        user: { id: "u-owner", email: "owner@store.com" },
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        capabilities: { chatwoot_inboxes: false },
        activeClient: { id: "c-1", planId: "plan-free" },
      },
    });

    const reqNoCap = new NextRequest("http://localhost:3003/api/tenant/conversations/retry", {
      method: "POST",
    });
    const resNoCap = await POST(reqNoCap);
    expect(resNoCap.status).toBe(403);

    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "c-1",
      context: {
        user: { id: "u-owner", email: "owner@store.com" },
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        capabilities: { chatwoot_inboxes: true },
        activeClient: { id: "c-1", planId: "plan-pro" },
      },
    });
    mockGetTenantChatwootAccount.mockResolvedValueOnce({
      clientId: "c-1",
      chatwootAccountId: 42,
      state: "suspended",
    });

    const reqSusp = new NextRequest("http://localhost:3003/api/tenant/conversations/retry", {
      method: "POST",
    });
    const resSusp = await POST(reqSusp);
    expect(resSusp.status).toBe(403);
    expect(mockProvisionTenantChatwootAccount).not.toHaveBeenCalled();
  });

  it("ejecuta reintento idempotente cuando la cuenta estaba en failed y retorna 200", async () => {
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "c-1",
      context: {
        user: { id: "u-owner", email: "owner@store.com" },
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        capabilities: { chatwoot_inboxes: true },
        activeClient: { id: "c-1", planId: "plan-pro" },
      },
    });

    mockGetTenantChatwootAccount
      .mockResolvedValueOnce({
        clientId: "c-1",
        chatwootAccountId: null,
        state: "failed",
      })
      .mockResolvedValueOnce({
        clientId: "c-1",
        chatwootAccountId: 42,
        state: "active",
      });

    mockProvisionTenantChatwootAccount.mockResolvedValueOnce({
      ok: true,
      data: { clientId: "c-1", chatwootAccountId: 42, state: "active" },
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/conversations/retry", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        state: "active",
        chatwootAccountId: 42,
      },
    });
    expect(mockProvisionTenantChatwootAccount).toHaveBeenCalledWith({
      clientId: "c-1",
      planId: "plan-pro",
      actor: "owner@store.com",
    });
  });

  it("retorna 502 RFC 9457 cuando la provisión vuelve a fallar", async () => {
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "c-1",
      context: {
        user: { id: "u-owner", email: "owner@store.com" },
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        capabilities: { chatwoot_inboxes: true },
        activeClient: { id: "c-1", planId: "plan-pro" },
      },
    });

    mockGetTenantChatwootAccount
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        clientId: "c-1",
        chatwootAccountId: null,
        state: "failed",
      });

    mockProvisionTenantChatwootAccount.mockResolvedValueOnce({
      ok: false,
      error: "Connection error upstream",
      code: "CHATWOOT_SYNC_FAILED",
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/conversations/retry", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body.title).toBe("BAD_GATEWAY");
    expect(body.detail).not.toContain("upstream");
  });
});
