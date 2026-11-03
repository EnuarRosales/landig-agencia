import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { authService } from "@mocter/domain";

vi.mock("@mocter/domain", () => ({
  authService: {
    revokeSession: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("apps/admin · POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revoca la sesión en authService y limpia las cookies", async () => {
    const req = new NextRequest("http://localhost:3003/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: "mocter_sid=test-active-session-id",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(authService.revokeSession).toHaveBeenCalledWith("test-active-session-id", "user_logout");

    // Verificar headers de limpieza de cookies
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("mocter_sid=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("responde 200 aunque no exista cookie de sesión previa", async () => {
    const req = new NextRequest("http://localhost:3003/api/auth/logout", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(authService.revokeSession).not.toHaveBeenCalled();
  });
});

