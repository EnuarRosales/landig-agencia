import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "./route";

const mockGetTenantUsersSummary = vi.fn();
const mockIssueInvitation = vi.fn();
const mockRevokeInvitation = vi.fn();
const mockRemoveMember = vi.fn();

vi.mock("@mocter/domain", () => {
  return {
    DrizzleTenantContactsAndUsersRepository: class MockRepo {},
    TenantContactsAndUsersService: class MockService {
      getTenantUsersSummary = mockGetTenantUsersSummary;
      issueInvitation = mockIssueInvitation;
      revokeInvitation = mockRevokeInvitation;
      removeMember = mockRemoveMember;
    },
  };
});

describe("API /api/admin/tenants/[id]/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("retorna el resumen de miembros, invitaciones y cuota 'tenant_users'", async () => {
      mockGetTenantUsersSummary.mockResolvedValueOnce({
        activeMembers: [{ id: "m1", role: "tenant_owner", userId: "u1" }],
        invitations: [{ id: "inv1", email: "agente@example.com", status: "pending" }],
        quota: { mode: "LIMITED", value: 5 },
        usage: { activeUsers: 1, pendingInvitations: 1, totalConsumed: 2 },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/users");
      const res = await GET(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.usage.totalConsumed).toBe(2);
      expect(mockGetTenantUsersSummary).toHaveBeenCalledWith("t1");
    });
  });

  describe("POST", () => {
    it("emite una invitación con éxito retornando 201", async () => {
      mockIssueInvitation.mockResolvedValueOnce({
        ok: true,
        data: {
          invitation: { id: "inv10", email: "nuevo@example.com", status: "pending" },
          rawToken: "token123",
        },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/users", {
        method: "POST",
        body: JSON.stringify({
          email: "nuevo@example.com",
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.rawToken).toBe("token123");
    });

    it("retorna 403 con mensaje S10 si se alcanza la cuota de usuarios por inquilino", async () => {
      mockIssueInvitation.mockResolvedValueOnce({
        ok: false,
        error: "Has alcanzado el límite de usuarios por inquilino incluido en tu plan.",
        code: "QUOTA_EXCEEDED",
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/users", {
        method: "POST",
        body: JSON.stringify({
          email: "bloqueado@example.com",
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Has alcanzado el límite de usuarios por inquilino incluido en tu plan.");
    });
  });

  describe("DELETE", () => {
    it("revoca una invitación pendiente retornando 200", async () => {
      mockRevokeInvitation.mockResolvedValueOnce({ ok: true, data: true });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/users?invitationId=inv1", {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockRevokeInvitation).toHaveBeenCalledWith("t1", "inv1", "admin-api");
    });

    it("remueve a un agente retornando 200", async () => {
      mockRemoveMember.mockResolvedValueOnce({ ok: true, data: true });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/users?memberId=m2", {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockRemoveMember).toHaveBeenCalledWith("t1", "m2", "admin-api");
    });
  });
});
