import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getChatwootSso } from "./sso/route";
import { GET as getChatwootSsoAlias } from "../sso/chatwoot/route";
import { POST as postChatwootSsoConsume } from "./sso/consume/route";
import {
  authService,
  authRateLimiter,
  RedisUnavailableError,
  type Session,
  type User,
} from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn(),
      issueChatwootSso: vi.fn(),
      verifyAndConsumeChatwootSsoToken: vi.fn(),
    },
    authRateLimiter: {
      ...actual.authRateLimiter,
      checkChatwootSsoRateLimit: vi.fn(),
    },
  };
});

describe("AUTH-001 T-25 · Endpoints de SSO para Chatwoot (GET /api/auth/chatwoot/sso, POST /api/auth/chatwoot/sso/consume)", () => {
  const validClientId = "a0000000-0000-0000-0000-000000000001";
  const foreignClientId = "b0000000-0000-0000-0000-000000000002";

  const mockUser: User = {
    id: "user-uuid-chatwoot-1",
    email: "agente@mocter.co",
    displayName: "Agente Mocter",
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
    activeClientId: validClientId,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const mockSession: Session = {
    id: "session-uuid-chatwoot",
    userId: mockUser.id,
    clientId: validClientId,
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
    createdBy: mockUser.id,
    updatedBy: mockUser.id,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(
    url: string,
    method: string,
    options?: {
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
      body?: unknown;
    },
  ): NextRequest {
    const req = new NextRequest(url, {
      method,
      headers: {
        origin: "http://localhost:3001",
        host: "localhost:3001",
        ...(options?.headers ?? {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (options?.cookies) {
      for (const [key, value] of Object.entries(options.cookies)) {
        req.cookies.set(key, value);
      }
    }

    return req;
  }

  describe("GET /api/auth/chatwoot/sso", () => {
    it("responde 401 si no hay cookie de sesión activa", async () => {
      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("responde 401 si la validación de sesión de authService falla", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: false,
        error: "Sesión no encontrada o revocada.",
        code: "UNAUTHORIZED",
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "invalid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("responde 401 si la sesión es válida pero no tiene objeto user", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: undefined },
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("responde 400 si falta el parámetro client_id", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/chatwoot/sso",
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("MISSING_CLIENT_ID");
    });

    it("responde 400 si client_id no tiene formato UUID", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/chatwoot/sso?client_id=not-a-uuid",
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("INVALID_CLIENT_ID");
    });

    it("responde 403 si el client_id solicitado no coincide con la membresía activa (inquilino ajeno)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${foreignClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("FORBIDDEN");
    });

    it("responde 429 si el usuario excede la tasa de 30 solicitudes cada 15 min", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfter: 600,
        resetAt: Date.now() + 600000,
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.code).toBe("TOO_MANY_REQUESTS");
      expect(res.headers.get("Retry-After")).toBe("600");
    });

    it("responde 503 Fail-Closed si Redis no está disponible durante el chequeo de tasa", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockRejectedValueOnce(
        new RedisUnavailableError("Redis connection lost"),
      );

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("responde 503 si el secreto SSO no está configurado en el backend", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 29,
        retryAfter: 0,
        resetAt: Date.now() + 900000,
      });

      vi.mocked(authService.issueChatwootSso).mockResolvedValueOnce({
        ok: false,
        error: "Secreto de SSO de Chatwoot no configurado.",
        code: "SSO_SECRET_MISSING",
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("emite el token JWT exitosamente con 200 y cabeceras Cache-Control: no-store", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 29,
        retryAfter: 0,
        resetAt: Date.now() + 900000,
      });

      const expiresAt = new Date(Date.now() + 300 * 1000);
      vi.mocked(authService.issueChatwootSso).mockResolvedValueOnce({
        ok: true,
        data: {
          token: "mocked.jwt.token",
          expiresAt,
          claims: {
            email: mockUser.email,
            name: mockUser.displayName!,
            identifier: mockUser.id,
            jti: "mock-jti",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(expiresAt.getTime() / 1000),
          },
        },
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/chatwoot/sso?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSso(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data.token).toBe("mocked.jwt.token");
      expect(data.data.email).toBe(mockUser.email);
      expect(data.data.name).toBe(mockUser.displayName);
      expect(data.data.identifier).toBe(mockUser.id);
      expect(res.headers.get("Cache-Control")).toContain("no-store");
    });
  });

  describe("GET /api/auth/sso/chatwoot (Alias canónico)", () => {
    it("opera de forma equivalente al endpoint primario", async () => {
      vi.mocked(authService.validateSession).mockResolvedValueOnce({
        ok: true,
        data: { session: mockSession, user: mockUser },
      });

      vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
        allowed: true,
        remaining: 29,
        retryAfter: 0,
        resetAt: Date.now() + 900000,
      });

      const expiresAt = new Date(Date.now() + 300 * 1000);
      vi.mocked(authService.issueChatwootSso).mockResolvedValueOnce({
        ok: true,
        data: {
          token: "alias.jwt.token",
          expiresAt,
          claims: {
            email: mockUser.email,
            name: mockUser.displayName!,
            identifier: mockUser.id,
            jti: "alias-jti",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(expiresAt.getTime() / 1000),
          },
        },
      });

      const req = createRequest(
        `http://localhost:3001/api/auth/sso/chatwoot?client_id=${validClientId}`,
        "GET",
        { cookies: { mocter_sid: "valid-sid" } },
      );
      const res = await getChatwootSsoAlias(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data.token).toBe("alias.jwt.token");
    });
  });

  describe("POST /api/auth/chatwoot/sso/consume", () => {
    it("responde 400 si el cuerpo no contiene token", async () => {
      const req = createRequest(
        "http://localhost:3001/api/auth/chatwoot/sso/consume",
        "POST",
        { body: {} },
      );
      const res = await postChatwootSsoConsume(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("INVALID_REQUEST");
    });

    it("responde 401 si el token es inválido o adulterado", async () => {
      vi.mocked(authService.verifyAndConsumeChatwootSsoToken).mockResolvedValueOnce({
        ok: false,
        error: "Firma o formato de token JWT inválido.",
        code: "INVALID_TOKEN",
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/chatwoot/sso/consume",
        "POST",
        { body: { token: "invalid.token.signature" } },
      );
      const res = await postChatwootSsoConsume(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("INVALID_TOKEN");
    });

    it("responde 401 con TOKEN_ALREADY_USED si el token ya fue consumido (un solo uso)", async () => {
      vi.mocked(authService.verifyAndConsumeChatwootSsoToken).mockResolvedValueOnce({
        ok: false,
        error: "El token SSO ya ha sido utilizado (un solo uso permitido).",
        code: "TOKEN_ALREADY_USED",
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/chatwoot/sso/consume",
        "POST",
        { body: { token: "already.used.token" } },
      );
      const res = await postChatwootSsoConsume(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("TOKEN_ALREADY_USED");
    });

    it("responde 200 y retorna claims al consumirse exitosamente en el primer intento", async () => {
      const claims = {
        email: mockUser.email,
        name: mockUser.displayName!,
        identifier: mockUser.id,
        jti: "fresh-jti-token",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };

      vi.mocked(authService.verifyAndConsumeChatwootSsoToken).mockResolvedValueOnce({
        ok: true,
        data: { claims },
      });

      const req = createRequest(
        "http://localhost:3001/api/auth/chatwoot/sso/consume",
        "POST",
        { body: { token: "fresh.valid.token" } },
      );
      const res = await postChatwootSsoConsume(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data.claims.identifier).toBe(mockUser.id);
      expect(data.data.claims.email).toBe(mockUser.email);
    });
  });
});
