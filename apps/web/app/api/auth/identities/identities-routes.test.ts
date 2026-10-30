import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
  type Session,
} from "@mocter/domain";
import { DELETE as unlinkHandler } from "./[provider]/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn(),
      unlinkProviderIdentity: vi.fn(),
    },
  };
});

describe("AUTH-001 T-16 · Rutas de Desvinculación de Identidades (/api/auth/identities/*)", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  describe("DELETE /api/auth/identities/:provider", () => {
    it("responde 400 si el proveedor no está soportado", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/identities/twitter", {
        method: "DELETE",
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "twitter" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_PROVIDER");
    });

    it("responde 401 si no hay cookie de sesión activa", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/identities/google", {
        method: "DELETE",
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("responde 403 si el token CSRF es inválido", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: false,
        error: "Token CSRF inválido o ausente.",
        code: "FORBIDDEN",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/identities/google", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-invalido",
        },
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("responde 429 si se excede el límite de tasa de desvinculación (5/15 min por usuario)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-spam-unlink",
            authMethod: "password",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as unknown as Session,
        },
      });

      vi.mocked(authService.unlinkProviderIdentity).mockResolvedValue({
        ok: true,
        data: {
          message: "Identidad de Google desvinculada exitosamente.",
        },
      });

      // Agotar los 5 intentos permitidos
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/identities/google", {
          method: "DELETE",
          headers: {
            cookie: "mocter_sid=sid-valido",
            "x-csrf-token": "csrf-valido",
          },
        });
        const res = await unlinkHandler(req, {
          params: Promise.resolve({ provider: "google" }),
        });
        expect(res.status).toBe(200);
      }

      // El 6.º intento debe ser bloqueado con 429
      const reqBlocked = new NextRequest("http://localhost:3000/api/auth/identities/google", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
        },
      });
      const resBlocked = await unlinkHandler(reqBlocked, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(resBlocked.status).toBe(429);
      const json = await resBlocked.json();
      expect(json.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("responde 422 si el usuario tiene contraseña nativa pero no la envía para confirmar", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-with-pass",
            authMethod: "password",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as unknown as Session,
        },
      });

      vi.mocked(authService.unlinkProviderIdentity).mockResolvedValue({
        ok: false,
        error: "Se requiere la contraseña actual para desvincular el proveedor.",
        code: "PASSWORD_REQUIRED",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/identities/facebook", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
        },
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "facebook" }),
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("PASSWORD_REQUIRED");
    });

    it("responde 401 si la contraseña proporcionada es incorrecta", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-with-pass",
            authMethod: "password",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as unknown as Session,
        },
      });

      vi.mocked(authService.unlinkProviderIdentity).mockResolvedValue({
        ok: false,
        error: "Contraseña incorrecta.",
        code: "INVALID_CREDENTIALS",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/identities/facebook", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
          "content-type": "application/json",
        },
        body: JSON.stringify({ currentPassword: "wrong-password" }),
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "facebook" }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("INVALID_CREDENTIALS");
    });

    it("responde 400 si se intenta desvincular el único método de acceso de la cuenta", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-only-google",
            authMethod: "google",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as unknown as Session,
        },
      });

      vi.mocked(authService.unlinkProviderIdentity).mockResolvedValue({
        ok: false,
        error: "No podés desvincular el único método de acceso a tu cuenta.",
        code: "CANNOT_UNLINK_LAST_METHOD",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/identities/google", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
        },
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("CANNOT_UNLINK_LAST_METHOD");
    });

    it("desvincula exitosamente sin rotar sesión si el método activo no coincide con el desvinculado", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-with-pass",
            authMethod: "password",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as unknown as Session,
        },
      });

      vi.mocked(authService.unlinkProviderIdentity).mockResolvedValue({
        ok: true,
        data: {
          message: "Identidad de Facebook desvinculada exitosamente.",
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/identities/facebook", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
          "content-type": "application/json",
        },
        body: JSON.stringify({ currentPassword: "valid-password" }),
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "facebook" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.message).toContain("Facebook desvinculada exitosamente");

      // No se emitieron nuevas cookies de sesión porque el login fue con password
      expect(res.cookies.get("mocter_sid")).toBeUndefined();
    });

    it("desvincula exitosamente y rota la sesión si se desvincula el método del login activo (§5.4)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-with-pass",
            authMethod: "google",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as unknown as Session,
        },
      });

      vi.mocked(authService.unlinkProviderIdentity).mockResolvedValue({
        ok: true,
        data: {
          message: "Identidad de Google desvinculada exitosamente.",
          rotatedSession: {
            sid: "new-sid-rotated",
            csrfToken: "new-csrf-rotated",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
      });

      const req = new NextRequest("http://localhost:3000/api/auth/identities/google", {
        method: "DELETE",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
          "content-type": "application/json",
        },
        body: JSON.stringify({ currentPassword: "valid-password" }),
      });

      const res = await unlinkHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verificamos que se actualizaron las cookies de sesión con la sesión rotada
      const newSidCookie = res.cookies.get("mocter_sid");
      expect(newSidCookie?.value).toBe("new-sid-rotated");
      expect(newSidCookie?.httpOnly).toBe(true);

      const newCsrfCookie = res.cookies.get("mocter_csrf");
      expect(newCsrfCookie?.value).toBe("new-csrf-rotated");
    });
  });
});
