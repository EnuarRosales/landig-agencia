import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getChatwootEmbedDirect } from "./route";
import { GET as getChatwootEmbedApi } from "@/app/api/auth/chatwoot/embed/route";
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

describe("AUTH-001 §5.10 / T-38 · GET /auth/chatwoot/embed (Handoff embebido del SSO)", () => {
  const validClientId = "a0000000-0000-0000-0000-000000000001";
  const foreignClientId = "b0000000-0000-0000-0000-000000000002";

  const mockUser: User = {
    id: "user-uuid-chatwoot-1",
    email: "operador@mocter.co",
    displayName: "Operador Mocter",
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
    options?: {
      cookies?: Record<string, string>;
    },
  ): NextRequest {
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        origin: "https://admin.mocter.co",
        host: "admin.mocter.co",
      },
    });

    if (options?.cookies) {
      for (const [name, value] of Object.entries(options.cookies)) {
        req.cookies.set(name, value);
      }
    }

    return req;
  }

  it("retorna 401 con HTML de reautenticación si no existe cookie de sesión", async () => {
    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const html = await res.text();
    expect(html).toContain("La sesión venció");
    expect(html).toContain("MOCTER_CHATWOOT_REAUTH_REQUIRED");
  });

  it("retorna 401 si la sesión es inválida o expiró", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: false,
      error: "Sesión inválida o expirada",
      code: "UNAUTHORIZED",
    });

    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { mocter_sid: "sid-invalido" } },
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const html = await res.text();
    expect(html).toContain("Sesión inválida");
  });

  it("retorna 400 si falta el parámetro client_id", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });

    const req = createRequest("https://admin.mocter.co/auth/chatwoot/embed", {
      cookies: { mocter_sid: "sid-valido" },
    });

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("client_id is required");
  });

  it("retorna 400 si client_id no tiene formato UUID válido", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });

    const req = createRequest("https://admin.mocter.co/auth/chatwoot/embed?client_id=no-es-uuid", {
      cookies: { mocter_sid: "sid-valido" },
    });

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("UUID válido");
  });

  it("retorna 403 si el usuario no tiene membresía en el inquilino solicitado", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: {
        session: { ...mockSession, clientId: foreignClientId },
        user: { ...mockUser, activeClientId: foreignClientId },
      },
    });

    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { mocter_sid: "sid-valido" } },
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("no posee una membresía activa");
  });

  it("retorna 429 si se excede el límite de tasa de emisión de SSO", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });
    vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
      retryAfter: 60,
    });

    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { mocter_sid: "sid-valido" } },
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    const html = await res.text();
    expect(html).toContain("Demasiadas solicitudes");
  });

  it("retorna 503 si Redis no está disponible (Fail-Closed)", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });
    vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockRejectedValueOnce(
      new RedisUnavailableError("Redis caído"),
    );

    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { mocter_sid: "sid-valido" } },
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("Servicio de autenticación temporalmente no disponible");
  });

  it("retorna 403 si la cuenta de usuario no se encuentra activa", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });
    vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 900000,
      retryAfter: 0,
    });
    vi.mocked(authService.issueChatwootSso).mockResolvedValueOnce({
      ok: false,
      error: "La cuenta de usuario no se encuentra activa.",
      code: "ACCOUNT_NOT_ACTIVE",
    });

    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { mocter_sid: "sid-valido" } },
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("La cuenta de usuario no se encuentra activa");
  });

  it("emite documento HTML con auto-submit, token en formulario POST y Cache-Control: no-store", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });
    vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 900000,
      retryAfter: 0,
    });
    vi.mocked(authService.issueChatwootSso).mockResolvedValueOnce({
      ok: true,
      data: {
        token: "jwt-sso-token-ephemeral-123",
        expiresAt: new Date(Date.now() + 300000),
        claims: {
          email: mockUser.email,
          name: mockUser.displayName ?? "Operador",
          identifier: mockUser.id,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
          jti: "jti-uuid-single-use",
        },
      },
    });

    const req = createRequest(
      `https://admin.mocter.co/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { __Host_mocter_sid: "sid-valido-prod", mocter_sid: "sid-valido" } },
    );

    const res = await getChatwootEmbedDirect(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate, private");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");

    const html = await res.text();
    // Verifica que contiene el formulario con método POST hacia el callback SSO
    expect(html).toContain('id="ssoForm"');
    expect(html).toContain('method="POST"');
    expect(html).toContain('action="https://chat.mocter.co/auth/sso/callback"');
    // Verifica que el token viaja en un campo oculto del formulario (no en la URL)
    expect(html).toContain('name="sso_token"');
    expect(html).toContain('value="jwt-sso-token-ephemeral-123"');
    // Verifica que incluye script para auto-submit inmediato
    expect(html).toContain('document.getElementById("ssoForm")');
    expect(html).toContain("form.submit()");
  });

  it("funciona de manera idéntica a través de la ruta /api/auth/chatwoot/embed", async () => {
    vi.mocked(authService.validateSession).mockResolvedValueOnce({
      ok: true,
      data: { session: mockSession, user: mockUser },
    });
    vi.mocked(authRateLimiter.checkChatwootSsoRateLimit).mockResolvedValueOnce({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 900000,
      retryAfter: 0,
    });
    vi.mocked(authService.issueChatwootSso).mockResolvedValueOnce({
      ok: true,
      data: {
        token: "jwt-token-api-test",
        expiresAt: new Date(Date.now() + 300000),
        claims: {
          email: mockUser.email,
          name: mockUser.displayName ?? "Operador",
          identifier: mockUser.id,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
          jti: "jti-uuid-api-test",
        },
      },
    });

    const req = createRequest(
      `https://admin.mocter.co/api/auth/chatwoot/embed?client_id=${validClientId}`,
      { cookies: { mocter_sid: "sid-valido" } },
    );

    const res = await getChatwootEmbedApi(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('value="jwt-token-api-test"');
  });
});
