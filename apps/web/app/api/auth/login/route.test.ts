import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authService, GENERIC_INVALID_CREDENTIALS_MESSAGE } from "@mocter/domain";
import { POST } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      login: vi.fn(),
    },
  };
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(
    body: unknown,
    headers?: Record<string, string>,
  ): NextRequest {
    return new NextRequest("http://localhost:3001/api/auth/login", {
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

  it("responde 200 OK y setea cookies de sesión y CSRF cuando el login es exitoso", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      ok: true,
      data: {
        user: {
          id: "uuid-user-1",
          email: "carlos@empresa.com",
          fullName: "Carlos Gómez",
          status: "active",
        },
        emailVerified: true,
        clientId: "uuid-client-1",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        sid: "raw-session-id-base64url",
        csrfToken: "raw-csrf-token-hex",
      },
    });

    const req = createMockRequest({
      email: "carlos@empresa.com",
      password: "Password123!",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.user.email).toBe("carlos@empresa.com");
    expect(data.data.emailVerified).toBe(true);

    // Cookies
    const sidCookie = res.cookies.get("mocter_sid");
    const csrfCookie = res.cookies.get("mocter_csrf");

    expect(sidCookie).toBeDefined();
    expect(sidCookie?.value).toBe("raw-session-id-base64url");
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie?.value).toBe("raw-csrf-token-hex");
  });

  it("responde 401 Unauthorized ante credenciales incorrectas", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      ok: false,
      error: GENERIC_INVALID_CREDENTIALS_MESSAGE,
      code: "INVALID_CREDENTIALS",
    });

    const req = createMockRequest({
      email: "carlos@empresa.com",
      password: "WrongPassword999!",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe(GENERIC_INVALID_CREDENTIALS_MESSAGE);
  });

  it("responde 400 Bad Request cuando el body es JSON inválido", async () => {
    const req = createMockRequest("not-valid-json");
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it("responde 403 Forbidden ante un Origin malicioso", async () => {
    const req = createMockRequest(
      { email: "carlos@empresa.com", password: "Password123!" },
      { origin: "http://malicious-site.com" },
    );

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.ok).toBe(false);
  });

  it("responde 503 Service Unavailable si la celda no responde", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      ok: false,
      error: "Celda temporalmente fuera de servicio.",
      code: "CELL_UNAVAILABLE",
    });

    const req = createMockRequest({
      email: "carlos@empresa.com",
      password: "Password123!",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.ok).toBe(false);
    expect(data.code).toBe("CELL_UNAVAILABLE");
  });

  it("responde 200 con mfaRequired y setea cookie de challenge cuando la cuenta exige 2FA", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      ok: true,
      data: {
        mfaRequired: true,
        userId: "uuid-user-1",
        challengeToken: "raw-challenge-token-32b",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
    });

    const req = createMockRequest({
      email: "carlos@empresa.com",
      password: "Password123!",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.mfaRequired).toBe(true);

    const challengeCookie = res.cookies.get("mocter_challenge");
    expect(challengeCookie).toBeDefined();
    expect(challengeCookie?.value).toBe("raw-challenge-token-32b");
  });
});
