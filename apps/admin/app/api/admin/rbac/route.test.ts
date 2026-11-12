import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import * as domain from "@mocter/domain";

vi.mock("@mocter/domain", () => ({
  fetchRbacOverview: vi.fn(),
  saveSystemUser: vi.fn(),
  saveSystemRole: vi.fn(),
  toggleRolePermission: vi.fn(),
  resendUserVerificationEmail: vi.fn(),
  sendUserPasswordResetLink: vi.fn(),
  toggleUserStatus: vi.fn(),
}));

describe("ADM-001 D-31 · Route Handler RBAC Governance (/api/admin/rbac)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET retorna el overview de RBAC con ok: true", async () => {
    vi.mocked(domain.fetchRbacOverview).mockResolvedValue({
      kpis: {
        totalUsers: 1,
        activeUsers: 1,
        totalRoles: 1,
        totalPermissions: 1,
        platformUsersCount: 1,
        tenantUsersCount: 0,
      },
      users: [],
      platformUsers: [],
      tenantUsers: [],
      roles: [],
      permissionModules: [],
    });

    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.kpis.totalUsers).toBe(1);
  });

  it("POST resend_verification reenvía verificación satisfactoriamente", async () => {
    vi.mocked(domain.resendUserVerificationEmail).mockResolvedValue({
      ok: true,
      data: { message: "Correo reenviado" },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/rbac", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resend_verification",
        userId: "usr-123",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(domain.resendUserVerificationEmail).toHaveBeenCalledWith({ userId: "usr-123" });
  });

  it("POST resend_verification rechaza sin userId con status 400", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/rbac", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resend_verification",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("POST send_password_reset envía enlace de recuperación con status 200", async () => {
    vi.mocked(domain.sendUserPasswordResetLink).mockResolvedValue({
      ok: true,
      data: { message: "Enlace enviado" },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/rbac", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_password_reset",
        userId: "usr-123",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(domain.sendUserPasswordResetLink).toHaveBeenCalledWith({ userId: "usr-123" });
  });

  it("POST toggle_status actualiza estado de usuario con status 200", async () => {
    vi.mocked(domain.toggleUserStatus).mockResolvedValue({
      ok: true,
      data: { id: "usr-123", status: "disabled" },
    });

    const req = new NextRequest("http://localhost:3003/api/admin/rbac", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_status",
        userId: "usr-123",
        status: "disabled",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(domain.toggleUserStatus).toHaveBeenCalledWith({ userId: "usr-123", status: "disabled" });
  });
});
