import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  defaultAuthRepository,
} from "@mocter/domain";
import { POST } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    defaultAuthRepository: {
      ...actual.defaultAuthRepository,
      countPlatformOperators: vi.fn(),
    },
    authService: {
      ...actual.authService,
      setupInitialPlatformOwner: vi.fn(),
    },
  };
});

describe("POST /api/auth/setup-owner (AUTH-001 T-27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(
    body: unknown,
    headers?: Record<string, string>,
  ): NextRequest {
    return new NextRequest("http://localhost:3001/api/auth/setup-owner", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3001",
        host: "localhost:3001",
        ...(headers ?? {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("responde 403 Forbidden si el Origin no es válido", async () => {
    const req = createMockRequest({}, { origin: "https://malicious-site.com" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("responde 404 Not Found permanentemente si ya existen operadores corporativos", async () => {
    vi.mocked(defaultAuthRepository.countPlatformOperators).mockResolvedValueOnce(1);

    const req = createMockRequest({
      token: "secret",
      name: "Admin",
      email: "admin@mocter.co",
      password: "Password123!",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(authService.setupInitialPlatformOwner).not.toHaveBeenCalled();
  });

  it("responde 401 si el setup token es incorrecto", async () => {
    vi.mocked(defaultAuthRepository.countPlatformOperators).mockResolvedValueOnce(0);
    vi.mocked(authService.setupInitialPlatformOwner).mockResolvedValueOnce({
      ok: false,
      code: "INVALID_SETUP_TOKEN",
      error: "Token de configuración inválido.",
    });

    const req = createMockRequest({
      token: "wrong-token",
      name: "Admin",
      email: "admin@mocter.co",
      password: "Password123!",
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Token de configuración inválido");
  });

  it("responde 404 si authService reporta que ya fue completado", async () => {
    vi.mocked(defaultAuthRepository.countPlatformOperators).mockResolvedValueOnce(0);
    vi.mocked(authService.setupInitialPlatformOwner).mockResolvedValueOnce({
      ok: false,
      code: "SETUP_OWNER_ALREADY_COMPLETED",
      error: "El asistente de configuración ya fue completado.",
    });

    const req = createMockRequest({
      token: "secret",
      name: "Admin",
      email: "admin@mocter.co",
      password: "Password123!",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it("responde 201 Created y setea cookies de sesión y CSRF cuando la inicialización es exitosa", async () => {
    vi.mocked(defaultAuthRepository.countPlatformOperators).mockResolvedValueOnce(0);
    vi.mocked(authService.setupInitialPlatformOwner).mockResolvedValueOnce({
      ok: true,
      data: {
        user: {
          id: "platform-owner-uuid-1",
          email: "admin@mocter.co",
          fullName: "Platform Admin",
          status: "active",
        },
        sid: "raw-sid-session-123",
        csrfToken: "raw-csrf-token-456",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    const req = createMockRequest({
      token: "super-secret-bootstrap-token",
      name: "Platform Admin",
      email: "admin@mocter.co",
      password: "Password123!",
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.user.email).toBe("admin@mocter.co");

    // Cookies
    const setCookieHeaders = res.headers.getSetCookie();
    expect(setCookieHeaders.some((c) => c.includes("mocter_sid=raw-sid-session-123"))).toBe(true);
    expect(setCookieHeaders.some((c) => c.includes("mocter_csrf=raw-csrf-token-456"))).toBe(true);
  });
});
