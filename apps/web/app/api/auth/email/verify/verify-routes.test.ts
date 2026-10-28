import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authService } from "@mocter/domain";
import { POST as requestRoute } from "./request/route";
import { POST as confirmRoute } from "./confirm/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      requestEmailVerification: vi.fn(),
      confirmEmailVerification: vi.fn(),
    },
  };
});

describe("POST /api/auth/email/verify/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(body: unknown, headers?: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost:3001/api/auth/email/verify/request", {
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

  it("responde 202 Accepted cuando la solicitud de reenvío es procesada", async () => {
    vi.mocked(authService.requestEmailVerification).mockResolvedValue({
      ok: true,
      data: {
        message: "Si la cuenta requiere verificación, hemos enviado un enlace a su correo.",
      },
    });

    const req = createRequest({ email: "carlos@empresa.com" });
    const res = await requestRoute(req);
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data.ok).toBe(true);
    expect(data.message).toContain("enviado un enlace");
  });

  it("responde 422 Unprocessable Entity cuando falta el correo o es inválido", async () => {
    const req = createRequest({});
    const res = await requestRoute(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.ok).toBe(false);
  });
});

describe("POST /api/auth/email/verify/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(body: unknown, headers?: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost:3001/api/auth/email/verify/confirm", {
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

  it("responde 200 OK cuando el token es válido y no ha sido consumido", async () => {
    vi.mocked(authService.confirmEmailVerification).mockResolvedValue({
      ok: true,
      data: {
        message: "Correo electrónico verificado exitosamente.",
        email: "carlos@empresa.com",
      },
    });

    const req = createRequest({ token: "token-valido-123" });
    const res = await confirmRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.email).toBe("carlos@empresa.com");
  });

  it("responde 400 Bad Request cuando el token es inválido o ya fue usado", async () => {
    vi.mocked(authService.confirmEmailVerification).mockResolvedValue({
      ok: false,
      error: "Este enlace de verificación ya fue utilizado.",
      code: "TOKEN_ALREADY_USED",
    });

    const req = createRequest({ token: "token-ya-usado" });
    const res = await confirmRoute(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.code).toBe("TOKEN_ALREADY_USED");
  });

  it("responde 400 Bad Request cuando no se proporciona el token", async () => {
    const req = createRequest({});
    const res = await confirmRoute(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
  });
});
