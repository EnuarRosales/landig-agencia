import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  GENERIC_FORGOT_PASSWORD_MESSAGE,
  type Session,
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

describe("AUTH-001 T-11 · Rutas de recuperación y cambio de contraseña", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
