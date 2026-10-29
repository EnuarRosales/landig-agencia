import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  GENERIC_FORGOT_PASSWORD_MESSAGE,
  type Session,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
} from "@mocter/domain";
import { POST as forgotPost } from "./forgot/route";
import { POST as resetPost } from "./reset/route";
import { POST as changePost } from "./change/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      changePassword: vi.fn(),
      validateSession: vi.fn(),
    },
  };
});

describe("AUTH-001 T-11, T-12 · Rutas de recuperación y cambio de contraseña con Redis Rate Limiting", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  function createMockRequest(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
    cookies?: Record<string, string>,
  ): NextRequest {
    const req = new NextRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3001",
        host: "localhost:3001",
        ...(headers ?? {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

    if (cookies) {
      for (const [name, val] of Object.entries(cookies)) {
        req.cookies.set(name, val);
      }
    }

    return req;
  }

  describe("POST /api/auth/password/forgot", () => {
    it("responde 202 Accepted con mensaje anti-enumeración uniforme", async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        ok: true,
        data: { message: GENERIC_FORGOT_PASSWORD_MESSAGE },
      });

      const req = createMockRequest("http://localhost:3001/api/auth/password/forgot", {
        email: "carlos@empresa.com",
      });

      const res = await forgotPost(req);
      const data = await res.json();

      expect(res.status).toBe(202);
      expect(data.ok).toBe(true);
      expect(data.message).toBe(GENERIC_FORGOT_PASSWORD_MESSAGE);
    });

    it("responde 400 Bad Request ante un formato de correo inválido", async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        ok: false,
        error: "El formato del correo electrónico es inválido.",
        code: "VALIDATION_ERROR",
      });

      const req = createMockRequest("http://localhost:3001/api/auth/password/forgot", {
        email: "correo-invalido",
      });

      const res = await forgotPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
    });

    it("responde 429 cuando se superan 3 solicitudes de recuperación para una cuenta", async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        ok: true,
        data: { message: GENERIC_FORGOT_PASSWORD_MESSAGE },
      });

      const payload = { email: "carlos@empresa.com" };

      for (let i = 0; i < 3; i++) {
        const res = await forgotPost(
          createMockRequest("http://localhost:3001/api/auth/password/forgot", payload),
        );
        expect(res.status).toBe(202);
      }

      const blockedRes = await forgotPost(
        createMockRequest("http://localhost:3001/api/auth/password/forgot", payload),
      );
      const blockedData = await blockedRes.json();

      expect(blockedRes.status).toBe(429);
      expect(blockedData.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("responde 503 Fail-Closed si Redis no está disponible en forgot password", async () => {
      mockRedis.simulateFailure(true);

      const req = createMockRequest("http://localhost:3001/api/auth/password/forgot", {
        email: "carlos@empresa.com",
      });

      const res = await forgotPost(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });

    it("responde 403 Forbidden ante un Origin malicioso", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/password/forgot",
        { email: "carlos@empresa.com" },
        { origin: "http://malicious-site.com" },
      );

      const res = await forgotPost(req);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/auth/password/reset", () => {
    it("responde 200 OK cuando el restablecimiento es exitoso", async () => {
      vi.mocked(authService.resetPassword).mockResolvedValue({
        ok: true,
        data: { message: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión." },
      });

      const req = createMockRequest("http://localhost:3001/api/auth/password/reset", {
        token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        password: "NewPassword123!",
      });

      const res = await resetPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it("responde 400 ante token inválido o expirado", async () => {
      vi.mocked(authService.resetPassword).mockResolvedValue({
        ok: false,
        error: "El enlace de restablecimiento ha expirado. Por favor solicite uno nuevo.",
        code: "TOKEN_EXPIRED",
      });

      const req = createMockRequest("http://localhost:3001/api/auth/password/reset", {
        token: "token-expirado",
        password: "NewPassword123!",
      });

      const res = await resetPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("TOKEN_EXPIRED");
    });

    it("bloquea con 429 tras superar el límite de 5 intentos por token", async () => {
      vi.mocked(authService.resetPassword).mockResolvedValue({
        ok: false,
        error: "Token inválido",
        code: "INVALID_TOKEN",
      });

      const payload = {
        token: "token-reset-limit-12345",
        password: "NewPassword123!",
      };

      for (let i = 0; i < 5; i++) {
        const res = await resetPost(
          createMockRequest("http://localhost:3001/api/auth/password/reset", payload),
        );
        expect(res.status).toBe(400);
      }

      const blockedRes = await resetPost(
        createMockRequest("http://localhost:3001/api/auth/password/reset", payload),
      );
      const blockedData = await blockedRes.json();

      expect(blockedRes.status).toBe(429);
      expect(blockedData.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
    });

    it("responde 503 Fail-Closed si Redis no está disponible en reset password", async () => {
      mockRedis.simulateFailure(true);

      const req = createMockRequest("http://localhost:3001/api/auth/password/reset", {
        token: "some-token",
        password: "NewPassword123!",
      });

      const res = await resetPost(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });
  });

  describe("POST /api/auth/password/change", () => {
    it("responde 401 si no hay cookie de sesión", async () => {
      const req = createMockRequest("http://localhost:3001/api/auth/password/change", {
        currentPassword: "Password123!",
        newPassword: "NewPassword456!",
      });

      const res = await changePost(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
    });

    it("responde 403 si falta el encabezado CSRF", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/password/change",
        { currentPassword: "Password123!", newPassword: "NewPassword456!" },
        {},
        { mocter_sid: "valid-sid" },
      );

      const res = await changePost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toContain("CSRF");
    });

    it("responde 200 OK y rota las cookies cuando el cambio es exitoso", async () => {
      const mockSession = {
        id: "uuid-session-1",
        userId: "uuid-user-1",
      } as unknown as Session;

      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { session: mockSession },
      });

      vi.mocked(authService.changePassword).mockResolvedValue({
        ok: true,
        data: {
          message: "Contraseña actualizada exitosamente.",
          sid: "new-rotated-sid",
          csrfToken: "new-rotated-csrf",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/password/change",
        { currentPassword: "Password123!", newPassword: "NewPassword456!" },
        { "x-csrf-token": "valid-csrf" },
        { mocter_sid: "valid-sid" },
      );

      const res = await changePost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verificar que se rotaron las cookies
      const newSidCookie = res.cookies.get("mocter_sid");
      const newCsrfCookie = res.cookies.get("mocter_csrf");

      expect(newSidCookie?.value).toBe("new-rotated-sid");
      expect(newCsrfCookie?.value).toBe("new-rotated-csrf");
    });

    it("responde 401 si la contraseña actual es errónea", async () => {
      const mockSession = {
        id: "uuid-session-1",
        userId: "uuid-user-1",
      } as unknown as Session;

      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { session: mockSession },
      });

      vi.mocked(authService.changePassword).mockResolvedValue({
        ok: false,
        error: "La contraseña actual es incorrecta.",
        code: "INVALID_CREDENTIALS",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/password/change",
        { currentPassword: "WrongPassword123!", newPassword: "NewPassword456!" },
        { "x-csrf-token": "valid-csrf" },
        { mocter_sid: "valid-sid" },
      );

      const res = await changePost(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
    });

    it("responde 403 con código MFA_REQUIRED si la cuenta exige doble factor", async () => {
      const mockSession = {
        id: "uuid-session-1",
        userId: "uuid-user-1",
      } as unknown as Session;

      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { session: mockSession },
      });

      vi.mocked(authService.changePassword).mockResolvedValue({
        ok: false,
        error: "Debe proporcionar el código de autenticación de dos factores.",
        code: "MFA_REQUIRED",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/password/change",
        { currentPassword: "Password123!", newPassword: "NewPassword456!" },
        { "x-csrf-token": "valid-csrf" },
        { mocter_sid: "valid-sid" },
      );

      const res = await changePost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("MFA_REQUIRED");
    });

    it("bloquea con 429 tras superar el límite de 3 cambios por usuario en 1 hora", async () => {
      const mockSession = {
        id: "uuid-session-1",
        userId: "uuid-user-1",
      } as unknown as Session;

      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { session: mockSession },
      });

      vi.mocked(authService.changePassword).mockResolvedValue({
        ok: true,
        data: {
          message: "Contraseña actualizada exitosamente.",
          sid: "new-rotated-sid",
          csrfToken: "new-rotated-csrf",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      });

      const reqFactory = () =>
        createMockRequest(
          "http://localhost:3001/api/auth/password/change",
          { currentPassword: "Password123!", newPassword: "NewPassword456!" },
          { "x-csrf-token": "valid-csrf" },
          { mocter_sid: "valid-sid" },
        );

      for (let i = 0; i < 3; i++) {
        const res = await changePost(reqFactory());
        expect(res.status).toBe(200);
      }

      const blockedRes = await changePost(reqFactory());
      const blockedData = await blockedRes.json();

      expect(blockedRes.status).toBe(429);
      expect(blockedData.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
    });

    it("responde 503 Fail-Closed si Redis no está disponible en change password", async () => {
      const mockSession = {
        id: "uuid-session-1",
        userId: "uuid-user-1",
      } as unknown as Session;

      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { session: mockSession },
      });

      mockRedis.simulateFailure(true);

      const req = createMockRequest(
        "http://localhost:3001/api/auth/password/change",
        { currentPassword: "Password123!", newPassword: "NewPassword456!" },
        { "x-csrf-token": "valid-csrf" },
        { mocter_sid: "valid-sid" },
      );

      const res = await changePost(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });
  });
});

