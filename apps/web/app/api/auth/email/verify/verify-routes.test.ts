import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
} from "@mocter/domain";
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

describe("AUTH-001 T-09, T-12 · Rutas de verificación de correo con Redis Rate Limiting", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  function createRequest(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): NextRequest {
    return new NextRequest(url, {
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

  describe("POST /api/auth/email/verify/request", () => {
    it("responde 202 Accepted cuando la solicitud de reenvío es procesada", async () => {
      vi.mocked(authService.requestEmailVerification).mockResolvedValue({
        ok: true,
        data: {
          message: "Si la cuenta requiere verificación, hemos enviado un enlace a su correo.",
        },
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/email/verify/request",
        { email: "carlos@empresa.com" },
      );
      const res = await requestRoute(req);
      const data = await res.json();

      expect(res.status).toBe(202);
      expect(data.ok).toBe(true);
      expect(data.message).toContain("enviado un enlace");
    });

    it("responde 429 cuando se superan los límites de reenvío de verificación", async () => {
      vi.mocked(authService.requestEmailVerification).mockResolvedValue({
        ok: true,
        data: {
          message: "Si la cuenta requiere verificación, hemos enviado un enlace a su correo.",
        },
      });

      const payload = { email: "carlos@empresa.com" };

      // 3 reenvíos permitidos por usuario en 15 minutos
      for (let i = 0; i < 3; i++) {
        const res = await requestRoute(
          createRequest("http://localhost:3001/api/auth/email/verify/request", payload),
        );
        expect(res.status).toBe(202);
      }

      // 4to reenvío bloqueado
      const blockedRes = await requestRoute(
        createRequest("http://localhost:3001/api/auth/email/verify/request", payload),
      );
      const blockedData = await blockedRes.json();

      expect(blockedRes.status).toBe(429);
      expect(blockedData.ok).toBe(false);
      expect(blockedData.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
    });

    it("responde 503 Fail-Closed cuando Redis no responde en verify request", async () => {
      mockRedis.simulateFailure(true);

      const req = createRequest(
        "http://localhost:3001/api/auth/email/verify/request",
        { email: "carlos@empresa.com" },
      );
      const res = await requestRoute(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });

    it("responde 422 Unprocessable Entity cuando falta el correo o es inválido", async () => {
      const req = createRequest("http://localhost:3001/api/auth/email/verify/request", {});
      const res = await requestRoute(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.ok).toBe(false);
    });
  });

  describe("POST /api/auth/email/verify/confirm", () => {
    it("responde 200 OK cuando el token es válido y no ha sido consumido", async () => {
      vi.mocked(authService.confirmEmailVerification).mockResolvedValue({
        ok: true,
        data: {
          message: "Correo electrónico verificado exitosamente.",
          email: "carlos@empresa.com",
        },
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/email/verify/confirm",
        { token: "token-valido-123" },
      );
      const res = await confirmRoute(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.email).toBe("carlos@empresa.com");
    });

    it("responde 429 cuando se superan 5 intentos de confirmación por IP", async () => {
      vi.mocked(authService.confirmEmailVerification).mockResolvedValue({
        ok: true,
        data: {
          message: "Correo electrónico verificado exitosamente.",
          email: "carlos@empresa.com",
        },
      });

      const payload = { token: "token-123" };

      // 5 confirmaciones permitidas por IP en 15 min
      for (let i = 0; i < 5; i++) {
        const res = await confirmRoute(
          createRequest("http://localhost:3001/api/auth/email/verify/confirm", payload),
        );
        expect(res.status).toBe(200);
      }

      // 6ta confirmación bloqueada
      const blockedRes = await confirmRoute(
        createRequest("http://localhost:3001/api/auth/email/verify/confirm", payload),
      );
      const blockedData = await blockedRes.json();

      expect(blockedRes.status).toBe(429);
      expect(blockedData.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("responde 503 Fail-Closed cuando Redis no responde en confirmación", async () => {
      mockRedis.simulateFailure(true);

      const req = createRequest(
        "http://localhost:3001/api/auth/email/verify/confirm",
        { token: "token-valido-123" },
      );
      const res = await confirmRoute(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });

    it("responde 400 Bad Request cuando el token es inválido o ya fue usado", async () => {
      vi.mocked(authService.confirmEmailVerification).mockResolvedValue({
        ok: false,
        error: "Este enlace de verificación ya fue utilizado.",
        code: "TOKEN_ALREADY_USED",
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/email/verify/confirm",
        { token: "token-ya-usado" },
      );
      const res = await confirmRoute(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("TOKEN_ALREADY_USED");
    });

    it("responde 400 Bad Request cuando no se proporciona el token", async () => {
      const req = createRequest("http://localhost:3001/api/auth/email/verify/confirm", {});
      const res = await confirmRoute(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
    });
  });
});
