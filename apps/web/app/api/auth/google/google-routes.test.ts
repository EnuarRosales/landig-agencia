import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  oauthStateManager,
  defaultGoogleOidcClient,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
} from "@mocter/domain";
import { GET as startHandler } from "./start/route";
import { GET as callbackHandler } from "./callback/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      authenticateWithGoogle: vi.fn(),
    },
    defaultGoogleOidcClient: {
      ...actual.defaultGoogleOidcClient,
      getAuthorizationUrl: vi.fn(),
    },
    oauthStateManager: {
      ...actual.oauthStateManager,
      createState: vi.fn(),
      consumeState: vi.fn(),
    },
  };
});

describe("AUTH-001 T-14 · Rutas de Google OIDC (/api/auth/google/*)", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  describe("GET /api/auth/google/start", () => {
    it("inicia el flujo OAuth, genera state en Redis y redirige a Google con cookie de state", async () => {
      vi.mocked(oauthStateManager.createState).mockResolvedValue({
        state: "test-state-32-bytes",
        codeVerifier: "test-verifier",
        codeChallenge: "test-challenge",
        nonce: "test-nonce",
        returnTo: "/admin",
        cookieName: "mocter_oauth_state_google",
        cookieOptions: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/auth/google",
          maxAge: 600,
        },
      });

      vi.mocked(defaultGoogleOidcClient.getAuthorizationUrl).mockReturnValue(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test-google-client-id&state=test-state-32-bytes",
      );

      const req = new NextRequest("http://localhost:3000/api/auth/google/start", {
        method: "GET",
        headers: { host: "localhost:3000" },
      });

      const res = await startHandler(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("accounts.google.com");

      // Validar cookie de state fijada
      const stateCookie = res.cookies.get("mocter_oauth_state_google");
      expect(stateCookie?.value).toBe("test-state-32-bytes");
      expect(stateCookie?.path).toBe("/auth/google");
    });

    it("responde 429 si se excede el límite de tasa de OAuth (20/15 min)", async () => {
      // Consumir 20 intentos en Redis
      for (let i = 0; i < 20; i++) {
        await mockRedis.eval("return {1, 0, 900}", 1, "auth:ratelimit:oauth:google:dummy");
      }

      // Mock para simular rechazo por límite de tasa
      const req = new NextRequest("http://localhost:3000/api/auth/google/start", {
        method: "GET",
        headers: {
          "x-forwarded-for": "203.0.113.199",
          host: "localhost:3000",
        },
      });

      // Hacer 21 llamadas para agotar cuota
      for (let i = 0; i < 20; i++) {
        vi.mocked(oauthStateManager.createState).mockResolvedValue({
          state: `state-${i}`,
          codeVerifier: "v",
          codeChallenge: "c",
          returnTo: "/admin",
          cookieName: "mocter_oauth_state_google",
          cookieOptions: { httpOnly: true, secure: false, sameSite: "lax", path: "/auth/google", maxAge: 600 },
        });
        vi.mocked(defaultGoogleOidcClient.getAuthorizationUrl).mockReturnValue("https://accounts.google.com");
        await startHandler(req);
      }

      // Intento 21 debe ser bloqueado con 429
      const blockedRes = await startHandler(req);
      expect(blockedRes.status).toBe(429);
      const data = await blockedRes.json();
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("responde 503 Fail-Closed si Redis no está disponible", async () => {
      mockRedis.simulateFailure(true);

      const req = new NextRequest("http://localhost:3000/api/auth/google/start", {
        method: "GET",
        headers: { host: "localhost:3000" },
      });

      const res = await startHandler(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });
  });

  describe("GET /api/auth/google/callback", () => {
    it("procesa callback exitoso, crea sesión opaca y limpia cookie de estado", async () => {
      vi.mocked(authService.authenticateWithGoogle).mockResolvedValue({
        ok: true,
        data: {
          user: {
            id: "uuid-user-google-1",
            email: "carlos@empresa.com",
            fullName: "Carlos Gómez",
            status: "active",
          },
          emailVerified: true,
          clientId: null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          sid: "generated-sid-google-32-bytes",
          csrfToken: "generated-csrf-token",
        },
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/google/callback?code=valid-code&state=valid-state",
        {
          method: "GET",
          headers: {
            host: "localhost:3000",
            cookie: "mocter_oauth_state_google=valid-state",
            accept: "application/json",
          },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.user.id).toBe("uuid-user-google-1");

      // Validar cookies de sesión y CSRF
      expect(res.cookies.get("mocter_sid")?.value).toBe("generated-sid-google-32-bytes");
      expect(res.cookies.get("mocter_csrf")?.value).toBe("generated-csrf-token");

      // Validar que la cookie de state se limpia (maxAge: 0)
      expect(res.cookies.get("mocter_oauth_state_google")?.maxAge).toBe(0);
    });

    it("responde 400 si el proveedor devuelve error o denegación", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/auth/google/callback?error=access_denied",
        {
          method: "GET",
          headers: { host: "localhost:3000" },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("OAUTH_ACCESS_DENIED");
    });

    it("responde 400 si faltan los parámetros code o state", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/auth/google/callback",
        {
          method: "GET",
          headers: { host: "localhost:3000" },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_REQUEST");
    });

    it("responde 503 con texto exacto «Proveedor temporalmente fuera de servicio» ante caída de Google", async () => {
      vi.mocked(authService.authenticateWithGoogle).mockResolvedValue({
        ok: false,
        error: "Proveedor temporalmente fuera de servicio",
        code: "PROVIDER_UNAVAILABLE",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/google/callback?code=c&state=s",
        {
          method: "GET",
          headers: {
            host: "localhost:3000",
            cookie: "mocter_oauth_state_google=s",
          },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("Proveedor temporalmente fuera de servicio");
      expect(data.code).toBe("PROVIDER_UNAVAILABLE");
    });

    it("responde 422 con texto exacto «El proveedor no devolvió un correo verificado.» si no está verificado", async () => {
      vi.mocked(authService.authenticateWithGoogle).mockResolvedValue({
        ok: false,
        error: "El proveedor no devolvió un correo verificado.",
        code: "EMAIL_NOT_VERIFIED",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/google/callback?code=c&state=s",
        {
          method: "GET",
          headers: {
            host: "localhost:3000",
            cookie: "mocter_oauth_state_google=s",
          },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("El proveedor no devolvió un correo verificado.");
      expect(data.code).toBe("EMAIL_NOT_VERIFIED");
    });
  });
});
