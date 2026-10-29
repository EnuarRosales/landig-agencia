import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSessions } from "./route";
import { DELETE as deleteSession } from "./[id]/route";
import { POST as logoutPost } from "../logout/route";
import { POST as logoutAllPost } from "../logout-all/route";
import { authService, setRedisClientForTesting, type Session, type User, type SessionSummaryDto } from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      validateSession: vi.fn(),
      listUserSessions: vi.fn(),
      revokeSessionById: vi.fn(),
      revokeSession: vi.fn(),
      revokeUserSessions: vi.fn(),
    },
  };
});

describe("AUTH-001 T-23 · Endpoints de gestión de sesiones y logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  const mockSession: Session = {
    id: "session-uuid-current",
    userId: "uuid-user-t23",
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
    createdBy: "uuid-user-t23",
    updatedBy: "uuid-user-t23",
  };

  const mockUser: User = {
    id: "uuid-user-t23",
    email: "t23@mocter.co",
    displayName: "Usuario T23",
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

  const mockSummaries: SessionSummaryDto[] = [
    {
      id: "session-uuid-current",
      authMethod: "password",
      mfaAt: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      isCurrent: true,
    },
    {
      id: "session-uuid-other",
      authMethod: "google",
      mfaAt: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      isCurrent: false,
    },
  ];

  function createRequest(
    url: string,
    method: string,
    options?: {
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    },
  ): NextRequest {
    const req = new NextRequest(url, {
      method,
      headers: {
        origin: "http://localhost:3001",
        host: "localhost:3001",
        ...(options?.headers ?? {}),
      },
    });

    if (options?.cookies) {
      for (const [key, value] of Object.entries(options.cookies)) {
        req.cookies.set(key, value);
      }
    }

    return req;
  }

  describe("GET /api/auth/sessions", () => {
    it("responde 401 si no hay cookie de sesión activa", async () => {
      const req = createRequest("http://localhost:3001/api/auth/sessions", "GET");
      const res = await getSessions(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("responde 401 si la sesión está revocada o expiró", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: false,
        error: "Sesión no encontrada o revocada.",
        code: "UNAUTHORIZED",
      });

      const req = createRequest("http://localhost:3001/api/auth/sessions", "GET", {
        cookies: { mocter_sid: "sid-invalido" },
      });

      const res = await getSessions(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("responde 200 con la lista sanitizada de sesiones del usuario", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });
      vi.mocked(authService.listUserSessions).mockResolvedValueOnce({
        ok: true,
        data: mockSummaries,
      });

      const req = createRequest("http://localhost:3001/api/auth/sessions", "GET", {
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await getSessions(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data.sessions).toHaveLength(2);
      expect(data.data.sessions[0].isCurrent).toBe(true);
      expect(data.data.sessions[1].isCurrent).toBe(false);
    });
  });

  describe("DELETE /api/auth/sessions/:id", () => {
    it("responde 403 si el Origin es inválido o no autorizado", async () => {
      const req = createRequest("http://localhost:3001/api/auth/sessions/other-session", "DELETE", {
        headers: { origin: "https://sitio-malicioso.com" },
      });

      const res = await deleteSession(req, { params: Promise.resolve({ id: "other-session" }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("INVALID_ORIGIN");
    });

    it("responde 401 si no hay sesión activa", async () => {
      const req = createRequest("http://localhost:3001/api/auth/sessions/other-session", "DELETE", {
        headers: { "x-csrf-token": "valid-csrf" },
      });

      const res = await deleteSession(req, { params: Promise.resolve({ id: "other-session" }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("responde 403 si falta el encabezado X-CSRF-Token", async () => {
      const req = createRequest("http://localhost:3001/api/auth/sessions/other-session", "DELETE", {
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await deleteSession(req, { params: Promise.resolve({ id: "other-session" }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("CSRF_MISSING");
    });

    it("responde 404 si la sesión a revocar no existe o pertenece a otro usuario", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });
      vi.mocked(authService.revokeSessionById).mockResolvedValueOnce({
        ok: false,
        error: "Sesión no encontrada o ya revocada.",
        code: "NOT_FOUND",
      });

      const req = createRequest("http://localhost:3001/api/auth/sessions/other-session", "DELETE", {
        headers: { "x-csrf-token": "valid-csrf" },
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await deleteSession(req, { params: Promise.resolve({ id: "other-session" }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.code).toBe("NOT_FOUND");
    });

    it("responde 200 y revoca exitosamente una sesión remota del usuario", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });
      vi.mocked(authService.revokeSessionById).mockResolvedValueOnce({
        ok: true,
        data: { message: "Sesión revocada exitosamente." },
      });

      const req = createRequest("http://localhost:3001/api/auth/sessions/session-uuid-other", "DELETE", {
        headers: { "x-csrf-token": "valid-csrf" },
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await deleteSession(req, { params: Promise.resolve({ id: "session-uuid-other" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(authService.revokeSessionById).toHaveBeenCalledWith(
        "uuid-user-t23",
        "session-uuid-other",
      );
    });

    it("responde 200 y limpia cookies si el usuario revoca su sesión actual", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });
      vi.mocked(authService.revokeSessionById).mockResolvedValueOnce({
        ok: true,
        data: { message: "Sesión revocada exitosamente." },
      });

      const req = createRequest("http://localhost:3001/api/auth/sessions/session-uuid-current", "DELETE", {
        headers: { "x-csrf-token": "valid-csrf" },
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await deleteSession(req, { params: Promise.resolve({ id: "session-uuid-current" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verificación de cookies limpiadas
      expect(res.cookies.get("mocter_sid")?.value).toBe("");
      expect(res.cookies.get("mocter_csrf")?.value).toBe("");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("responde 403 si el Origin no es autorizado", async () => {
      const req = createRequest("http://localhost:3001/api/auth/logout", "POST", {
        headers: { origin: "https://evil.com" },
      });

      const res = await logoutPost(req);
      expect(res.status).toBe(403);
    });

    it("responde 200, revoca la sesión en AuthService y limpia todas las cookies", async () => {
      vi.mocked(authService.revokeSession).mockResolvedValueOnce({
        ok: true,
        data: { message: "Sesión revocada exitosamente." },
      });

      const req = createRequest("http://localhost:3001/api/auth/logout", "POST", {
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await logoutPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(authService.revokeSession).toHaveBeenCalledWith("valid-sid", "user_logout");

      // Verificación de cookies eliminadas
      expect(res.cookies.get("mocter_sid")?.value).toBe("");
      expect(res.cookies.get("mocter_csrf")?.value).toBe("");
      expect(res.cookies.get("mocter_challenge")?.value).toBe("");
    });
  });

  describe("POST /api/auth/logout-all", () => {
    it("responde 403 si el Origin es inválido", async () => {
      const req = createRequest("http://localhost:3001/api/auth/logout-all", "POST", {
        headers: { origin: "http://malicious-site.com" },
      });

      const res = await logoutAllPost(req);
      expect(res.status).toBe(403);
    });

    it("responde 401 si no hay sesión activa", async () => {
      const req = createRequest("http://localhost:3001/api/auth/logout-all", "POST", {
        headers: { "x-csrf-token": "valid-csrf" },
      });

      const res = await logoutAllPost(req);
      expect(res.status).toBe(401);
    });

    it("responde 403 si falta el encabezado X-CSRF-Token", async () => {
      const req = createRequest("http://localhost:3001/api/auth/logout-all", "POST", {
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await logoutAllPost(req);
      expect(res.status).toBe(403);
    });

    it("responde 200, revoca todas las sesiones del usuario y limpia cookies", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });
      vi.mocked(authService.revokeUserSessions).mockResolvedValueOnce({
        ok: true,
        data: { message: "Sesiones de usuario revocadas exitosamente." },
      });

      const req = createRequest("http://localhost:3001/api/auth/logout-all", "POST", {
        headers: { "x-csrf-token": "valid-csrf" },
        cookies: { mocter_sid: "valid-sid" },
      });

      const res = await logoutAllPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(authService.revokeUserSessions).toHaveBeenCalledWith(
        "uuid-user-t23",
        "user_logout_all",
      );

      // Verificación de cookies eliminadas
      expect(res.cookies.get("mocter_sid")?.value).toBe("");
      expect(res.cookies.get("mocter_csrf")?.value).toBe("");
    });
  });
});
