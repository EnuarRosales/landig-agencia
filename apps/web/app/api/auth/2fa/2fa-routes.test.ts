import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
  type Session,
} from "@mocter/domain";
import { POST as enrollPost } from "./enroll/route";
import { POST as confirmPost } from "./confirm/route";
import { POST as disablePost } from "./disable/route";
import { POST as verifyPost } from "./verify/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn(),
      enroll2fa: vi.fn(),
      confirm2fa: vi.fn(),
      disable2fa: vi.fn(),
      verify2faChallenge: vi.fn(),
    },
  };
});

describe("AUTH-001 T-18 · Endpoints 2FA TOTP (Enroll, Confirm, Disable)", () => {
  let mockRedis: MockRedisClient;

  const mockSession = {
    id: "sess_test_123",
    userId: "usr_test_123",
    sidHash: Buffer.alloc(32, 1),
    csrfHash: Buffer.alloc(32, 2),
    mfaAt: null,
    reauthAt: new Date(),
    expiresAt: new Date(Date.now() + 43200000),
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    clientId: null,
    routingVersion: null,
    authMethod: "password",
    lastSeenAt: new Date(),
    absoluteExpiresAt: new Date(Date.now() + 43200000),
    ipHash: null,
    userAgentHash: null,
    createdBy: "system",
    updatedBy: "system",
  } as Session;

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
    body?: unknown,
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
      body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });

    if (cookies) {
      for (const [name, val] of Object.entries(cookies)) {
        req.cookies.set(name, val);
      }
    }

    return req;
  }

  describe("POST /api/auth/2fa/enroll", () => {
    it("responde 403 Forbidden ante un Origin no permitido", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { origin: "http://malicious-site.com" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("INVALID_ORIGIN");
    });

    it("responde 401 Unauthorized si falta la cookie de sesión", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { "x-csrf-token": "csrf-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("responde 403 Forbidden si falta el encabezado CSRF", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        {},
        { mocter_sid: "sid-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("CSRF_MISSING");
    });

    it("responde 401 si la sesión no es válida en BD", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: false,
        error: "Sesión vencida.",
        code: "UNAUTHORIZED",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-invalido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("responde 403 si el token CSRF es inválido contra la sesión en BD", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: false,
        error: "Token CSRF inválido.",
        code: "FORBIDDEN",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { "x-csrf-token": "csrf-invalido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("responde 503 Fail-Closed si Redis no está disponible", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      mockRedis.simulateFailure(true);

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("responde 429 cuando se superan 5 solicitudes de enrolamiento en 15 min", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.enroll2fa).mockResolvedValue({
        ok: true,
        data: {
          otpauthUri: "otpauth://totp/Mocter:test@mocter.co?secret=JBSWY3DPEHPK3PXP",
          secret: "JBSWY3DPEHPK3PXP",
          expiresAt: new Date().toISOString(),
        },
      });

      const makeReq = () =>
        createMockRequest(
          "http://localhost:3001/api/auth/2fa/enroll",
          {},
          { "x-csrf-token": "csrf-valido" },
          { mocter_sid: "sid-valido" },
        );

      for (let i = 0; i < 5; i++) {
        const res = await enrollPost(makeReq());
        expect(res.status).toBe(200);
      }

      const blockedRes = await enrollPost(makeReq());
      expect(blockedRes.status).toBe(429);
      const blockedJson = await blockedRes.json();
      expect(blockedJson.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("responde 403 MFA_NOT_AVAILABLE para cuentas exclusivamente federadas", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.enroll2fa).mockResolvedValue({
        ok: false,
        error: "2FA requiere una contraseña nativa establecida.",
        code: "MFA_NOT_AVAILABLE",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("MFA_NOT_AVAILABLE");
    });

    it("responde 401 REAUTH_REQUIRED si expiró la ventana de 5 minutos", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: { ...mockSession, reauthAt: new Date(Date.now() - 600000) },
        },
      });

      vi.mocked(authService.enroll2fa).mockResolvedValue({
        ok: false,
        error: "Se requiere reautenticación.",
        code: "REAUTH_REQUIRED",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        {},
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("REAUTH_REQUIRED");
    });

    it("responde 200 OK con otpauthUri y secret ante enrolamiento exitoso", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.enroll2fa).mockResolvedValue({
        ok: true,
        data: {
          otpauthUri: "otpauth://totp/Mocter:test@mocter.co?secret=JBSWY3DPEHPK3PXP",
          secret: "JBSWY3DPEHPK3PXP",
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/enroll",
        { password: "Password123!" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await enrollPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.secret).toBe("JBSWY3DPEHPK3PXP");
      expect(json.data.otpauthUri).toContain("otpauth://totp/Mocter:");
    });
  });

  describe("POST /api/auth/2fa/confirm", () => {
    it("responde 403 Forbidden ante un Origin no permitido", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/confirm",
        { code: "123456" },
        { origin: "http://malicious-site.com" },
      );

      const res = await confirmPost(req);
      expect(res.status).toBe(403);
    });

    it("responde 401 si no hay sesión activa", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/confirm",
        { code: "123456" },
        { "x-csrf-token": "csrf-valido" },
      );

      const res = await confirmPost(req);
      expect(res.status).toBe(401);
    });

    it("responde 401 si el código TOTP no tiene 6 dígitos o no es numérico", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/confirm",
        { code: "123" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await confirmPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("INVALID_TOTP_CODE");
    });

    it("responde 401 si el código TOTP es incorrecto o vencido", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.confirm2fa).mockResolvedValue({
        ok: false,
        error: "Código de verificación inválido o vencido.",
        code: "INVALID_TOTP_CODE",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/confirm",
        { code: "654321" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await confirmPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("INVALID_TOTP_CODE");
    });

    it("responde 200 OK y rota las cookies ante confirmación exitosa", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.confirm2fa).mockResolvedValue({
        ok: true,
        data: {
          message: "Autenticación de dos factores activada exitosamente.",
          rotatedSession: {
            sid: "new_rotated_sid",
            csrfToken: "new_rotated_csrf",
            expiresAt: new Date(Date.now() + 43200000).toISOString(),
          },
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/confirm",
        { code: "123456" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await confirmPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.message).toContain("activada exitosamente");

      // Verificar rotación de cookies
      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes("mocter_sid=new_rotated_sid"))).toBe(true);
      expect(setCookies.some((c) => c.includes("mocter_csrf=new_rotated_csrf"))).toBe(true);
    });
  });

  describe("POST /api/auth/2fa/disable", () => {
    it("responde 403 Forbidden ante un Origin no permitido", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/disable",
        { password: "Password123!", code: "123456" },
        { origin: "http://malicious-site.com" },
      );

      const res = await disablePost(req);
      expect(res.status).toBe(403);
    });

    it("responde 400 si faltan campos en el cuerpo", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/disable",
        { password: "Password123!" }, // falta code
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await disablePost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("responde 400 si 2FA no está habilitado", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.disable2fa).mockResolvedValue({
        ok: false,
        error: "2FA no está activado para este usuario.",
        code: "MFA_NOT_ENABLED",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/disable",
        { password: "Password123!", code: "123456" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await disablePost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("MFA_NOT_ENABLED");
    });

    it("responde 401 si la contraseña o el código TOTP son inválidos", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.disable2fa).mockResolvedValue({
        ok: false,
        error: "Código de verificación inválido o vencido.",
        code: "INVALID_TOTP_CODE",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/disable",
        { password: "Password123!", code: "000000" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await disablePost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("INVALID_TOTP_CODE");
    });

    it("responde 200 OK y rota cookies ante desactivación exitosa", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: mockSession,
        },
      });

      vi.mocked(authService.disable2fa).mockResolvedValue({
        ok: true,
        data: {
          message: "Autenticación de dos factores desactivada exitosamente.",
          rotatedSession: {
            sid: "new_disabled_sid",
            csrfToken: "new_disabled_csrf",
            expiresAt: new Date(Date.now() + 43200000).toISOString(),
          },
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/disable",
        { password: "Password123!", code: "123456" },
        { "x-csrf-token": "csrf-valido" },
        { mocter_sid: "sid-valido" },
      );

      const res = await disablePost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.message).toContain("desactivada exitosamente");

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes("mocter_sid=new_disabled_sid"))).toBe(true);
      expect(setCookies.some((c) => c.includes("mocter_csrf=new_disabled_csrf"))).toBe(true);
    });
  });

  describe("POST /api/auth/2fa/verify (T-19)", () => {
    const validChallenge = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    it("responde 403 Forbidden ante un Origin no permitido", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "123456" },
        { origin: "http://malicious-site.com" },
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("INVALID_ORIGIN");
    });

    it("responde 401 Unauthorized si falta la cookie de challenge", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "123456" },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("CHALLENGE_EXPIRED");
    });

    it("responde 400 Bad Request si el cuerpo no es JSON válido", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        "invalid-json{",
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("responde 400 Bad Request si el código no tiene 6 dígitos numéricos", async () => {
      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "abc" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_TOTP_CODE");
    });

    it("responde 503 Service Unavailable si Redis está caído (Fail-Closed)", async () => {
      mockRedis.simulateFailure(true);

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "123456" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("responde 429 Too Many Requests si se excede la limitación de tasa por challenge", async () => {
      // Agotar la cuota de 5 intentos en Redis para este challenge
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest(
          "http://localhost:3001/api/auth/2fa/verify",
          { code: "123456" },
          undefined,
          { mocter_challenge: validChallenge },
        );
        vi.mocked(authService.verify2faChallenge).mockResolvedValue({
          ok: false,
          error: "Código de verificación inválido.",
          code: "INVALID_TOTP_CODE",
        });
        await verifyPost(req);
      }

      // El 6to intento debe ser bloqueado por rate limit
      const reqBlocked = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "123456" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(reqBlocked);
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(res.headers.get("Retry-After")).toBeDefined();
    });

    it("responde 401 y limpia la cookie si el challenge expiró en el servicio", async () => {
      vi.mocked(authService.verify2faChallenge).mockResolvedValue({
        ok: false,
        error: "El desafío de autenticación ha vencido o no existe.",
        code: "CHALLENGE_EXPIRED",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "123456" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("CHALLENGE_EXPIRED");

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes("mocter_challenge=") && c.includes("Max-Age=0"))).toBe(true);
    });

    it("responde 401 y limpia la cookie si el challenge agotó sus 5 intentos", async () => {
      vi.mocked(authService.verify2faChallenge).mockResolvedValue({
        ok: false,
        error: "Ha superado el número máximo de intentos. Inicie sesión de nuevo.",
        code: "CHALLENGE_EXHAUSTED",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "123456" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("CHALLENGE_EXHAUSTED");

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes("mocter_challenge=") && c.includes("Max-Age=0"))).toBe(true);
    });

    it("responde 401 sin limpiar la cookie si el código TOTP es inválido (permite reintentos)", async () => {
      vi.mocked(authService.verify2faChallenge).mockResolvedValue({
        ok: false,
        error: "Código de verificación inválido o vencido.",
        code: "INVALID_TOTP_CODE",
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "000000" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("INVALID_TOTP_CODE");

      const setCookies = res.headers.getSetCookie();
      // No debe limpiar la cookie (para permitir reintentos hasta el agotamiento)
      expect(setCookies.some((c) => c.includes("mocter_challenge=") && c.includes("Max-Age=0"))).toBe(false);
    });

    it("responde 200 OK, emite cookies sid y csrf, y elimina la cookie de challenge ante éxito", async () => {
      vi.mocked(authService.verify2faChallenge).mockResolvedValue({
        ok: true,
        data: {
          sid: "sid_mfa_valid_123",
          csrfToken: "csrf_mfa_valid_456",
          expiresAt: new Date(Date.now() + 43200000).toISOString(),
          user: {
            id: "usr_test_123",
            email: "carlos@empresa.com",
            fullName: "Carlos Mocter",
            status: "active",
          },
          emailVerified: true,
          clientId: null,
        },
      });

      const req = createMockRequest(
        "http://localhost:3001/api/auth/2fa/verify",
        { code: "654321" },
        undefined,
        { mocter_challenge: validChallenge },
      );

      const res = await verifyPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.user.email).toBe("carlos@empresa.com");

      const setCookies = res.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes("mocter_sid=sid_mfa_valid_123"))).toBe(true);
      expect(setCookies.some((c) => c.includes("mocter_csrf=csrf_mfa_valid_456"))).toBe(true);
      expect(setCookies.some((c) => c.includes("mocter_challenge=") && c.includes("Max-Age=0"))).toBe(true);
    });
  });
});
