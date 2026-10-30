import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "./login/route";
import { POST as registerPost } from "./register/route";
import { POST as changePasswordPost } from "./password/change/route";
import { POST as enrollTotpPost } from "./2fa/enroll/route";
import { authService, setRedisClientForTesting, type Session, type User } from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      login: vi.fn(),
      register: vi.fn(),
      validateSession: vi.fn(),
      changePassword: vi.fn(),
      enroll2fa: vi.fn(),
      isReauthValid: vi.fn().mockReturnValue(true),
    },
    authRateLimiter: {
      checkLoginRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkRegisterRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkPasswordChangeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkTotpEnrollRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      resetLoginFailure: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("AUTH-001 T-22 · Pruebas integrales de CSRF y validación de Origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  const mockSession: Session = {
    id: "uuid-session-t22",
    userId: "uuid-user-t22",
    clientId: "uuid-client-1",
    routingVersion: 1,
    sidHash: Buffer.alloc(32, 1),
    csrfHash: Buffer.alloc(32, 2),
    authMethod: "password",
    mfaAt: null,
    reauthAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    revokedAt: null,
    revokedReason: null,
    ipHash: null,
    userAgentHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "uuid-user-t22",
    updatedBy: "uuid-user-t22",
  };

  const mockUser: User = {
    id: "uuid-user-t22",
    email: "seguridad@mocter.co",
    displayName: "Usuario Mocter",
    status: "active",
    passwordHash: "hash-argon2id",
    passwordUpdatedAt: new Date(),
    identityLocation: "router",
    avatarUrl: null,
    totpEnabledAt: null,
    totpSecretCiphertext: null,
    totpKeyId: null,
    totpPendingSecretCiphertext: null,
    totpPendingKeyId: null,
    totpPendingCreatedAt: null,
    totpLastUsedStep: null,
    activeClientId: "uuid-client-1",
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  describe("Validación de Origin y Content-Type en POST públicos (login y registro)", () => {
    it("POST /api/auth/login rechaza peticiones con Origin cruzado o malicioso (403)", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://sitio-malicioso.com",
          host: "localhost:3001",
        },
        body: JSON.stringify({ email: "test@mocter.co", password: "Password123!" }),
      });

      const res = await loginPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toBe("Origen no autorizado");
    });

    it("POST /api/auth/login rechaza peticiones con Content-Type que no sea application/json (415)", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
        body: JSON.stringify({ email: "test@mocter.co", password: "Password123!" }),
      });

      const res = await loginPost(req);
      const data = await res.json();

      expect(res.status).toBe(415);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("INVALID_CONTENT_TYPE");
    });

    it("POST /api/auth/register rechaza peticiones con Origin cruzado (403)", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil-phishing.org",
          host: "localhost:3001",
        },
        body: JSON.stringify({
          email: "nuevo@mocter.co",
          password: "Password123!",
          fullName: "Nuevo Usuario",
        }),
      });

      const res = await registerPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toBe("Origen no autorizado");
    });

    it("POST /api/auth/register rechaza peticiones con Content-Type no JSON (415)", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
        body: "email=nuevo%40mocter.co&password=Password123!",
      });

      const res = await registerPost(req);
      const data = await res.json();

      expect(res.status).toBe(415);
      expect(data.ok).toBe(false);
      expect(data.code).toBe("INVALID_CONTENT_TYPE");
    });
  });

  describe("Exigencia de X-CSRF-Token en mutaciones autenticadas", () => {
    it("POST /api/auth/password/change rechaza si falta el encabezado X-CSRF-Token (403 CSRF ausente)", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/password/change", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
        body: JSON.stringify({
          currentPassword: "OldPassword123!",
          newPassword: "NewPassword456!",
        }),
      });
      req.cookies.set("mocter_sid", "session-valid-token");

      const res = await changePasswordPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toBe("Encabezado CSRF ausente.");
    });

    it("POST /api/auth/password/change rechaza si el token CSRF pertenece a otra sesión o es inválido (403 FORBIDDEN)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: false,
        error: "Token CSRF inválido.",
        code: "FORBIDDEN",
      });

      const req = new NextRequest("http://localhost:3001/api/auth/password/change", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3001",
          host: "localhost:3001",
          "x-csrf-token": "csrf-token-de-otra-sesion-o-falsificado",
        },
        body: JSON.stringify({
          currentPassword: "OldPassword123!",
          newPassword: "NewPassword456!",
        }),
      });
      req.cookies.set("mocter_sid", "session-valid-token");

      const res = await changePasswordPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toBe("Token CSRF inválido.");
    });

    it("POST /api/auth/password/change permite la mutación si el token CSRF coincide con la sesión", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      vi.mocked(authService.changePassword).mockResolvedValue({
        ok: true,
        data: {
          message: "Contraseña actualizada exitosamente.",
          sid: "sid-rotado-nuevo",
          csrfToken: "csrf-rotado-nuevo",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      });

      const req = new NextRequest("http://localhost:3001/api/auth/password/change", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3001",
          host: "localhost:3001",
          "x-csrf-token": "csrf-token-legitimo",
        },
        body: JSON.stringify({
          currentPassword: "OldPassword123!",
          newPassword: "NewPassword456!",
        }),
      });
      req.cookies.set("mocter_sid", "session-valid-token");

      const res = await changePasswordPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verificación de rotación de cookie CSRF tras cambio de contraseña
      const newCsrfCookie = res.cookies.get("mocter_csrf");
      expect(newCsrfCookie?.value).toBe("csrf-rotado-nuevo");
    });

    it("POST /api/auth/2fa/enroll exige X-CSRF-Token y valida Origin", async () => {
      // 1. Falla por Origin cruzado
      const reqCross = new NextRequest("http://localhost:3001/api/auth/2fa/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://malicious.com",
          host: "localhost:3001",
          "x-csrf-token": "token",
        },
        body: JSON.stringify({ password: "Password123!" }),
      });
      reqCross.cookies.set("mocter_sid", "session-token");
      const resCross = await enrollTotpPost(reqCross);
      expect(resCross.status).toBe(403);
      const dataCross = await resCross.json();
      expect(dataCross.code).toBe("INVALID_ORIGIN");

      // 2. Falla por ausencia de CSRF
      const reqNoCsrf = new NextRequest("http://localhost:3001/api/auth/2fa/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
        body: JSON.stringify({ password: "Password123!" }),
      });
      reqNoCsrf.cookies.set("mocter_sid", "session-token");
      const resNoCsrf = await enrollTotpPost(reqNoCsrf);
      expect(resNoCsrf.status).toBe(403);
      const dataNoCsrf = await resNoCsrf.json();
      expect(dataNoCsrf.code).toBe("CSRF_MISSING");
    });
  });
});
