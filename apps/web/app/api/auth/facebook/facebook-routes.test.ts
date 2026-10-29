import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  oauthStateManager,
  defaultFacebookOAuthClient,
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
      authenticateWithFacebook: vi.fn(),
    },
    defaultFacebookOAuthClient: {
      ...actual.defaultFacebookOAuthClient,
      getAuthorizationUrl: vi.fn(),
    },
    oauthStateManager: {
      ...actual.oauthStateManager,
      createState: vi.fn(),
      consumeState: vi.fn(),
    },
  };
});

describe("AUTH-001 T-15 · Rutas de Facebook OAuth (/api/auth/facebook/*)", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
    process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
    process.env.FACEBOOK_APP_SECRET = "test-facebook-app-secret";
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  describe("GET /api/auth/facebook/start", () => {
    it("inicia el flujo OAuth, genera state en Redis y redirige a Facebook con cookie de state", async () => {
      vi.mocked(oauthStateManager.createState).mockResolvedValue({
        state: "test-state-fb-32-bytes",
        codeVerifier: "",
        codeChallenge: "",
        returnTo: "/admin",
        cookieName: "mocter_oauth_state_facebook",
        cookieOptions: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/auth/facebook",
          maxAge: 600,
        },
      });

      vi.mocked(defaultFacebookOAuthClient.getAuthorizationUrl).mockReturnValue(
        "https://www.facebook.com/v19.0/dialog/oauth?client_id=test-facebook-app-id&state=test-state-fb-32-bytes",
      );

      const req = new NextRequest("http://localhost:3000/api/auth/facebook/start", {
        method: "GET",
        headers: { host: "localhost:3000" },
      });

      const res = await startHandler(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("facebook.com/v19.0/dialog/oauth");

      // Validar cookie de state fijada
      const stateCookie = res.cookies.get("mocter_oauth_state_facebook");
      expect(stateCookie?.value).toBe("test-state-fb-32-bytes");
      expect(stateCookie?.path).toBe("/auth/facebook");
    });

    it("responde 429 si se excede el límite de tasa de OAuth (20/15 min)", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/facebook/start", {
        method: "GET",
        headers: {
          "x-forwarded-for": "203.0.113.200",
          host: "localhost:3000",
        },
      });

      // Agotar los 20 intentos
      for (let i = 0; i < 20; i++) {
        vi.mocked(oauthStateManager.createState).mockResolvedValue({
          state: `state-${i}`,
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          cookieName: "mocter_oauth_state_facebook",
          cookieOptions: { httpOnly: true, secure: false, sameSite: "lax", path: "/auth/facebook", maxAge: 600 },
        });
        vi.mocked(defaultFacebookOAuthClient.getAuthorizationUrl).mockReturnValue("https://www.facebook.com");
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

      const req = new NextRequest("http://localhost:3000/api/auth/facebook/start", {
        method: "GET",
        headers: { host: "localhost:3000" },
      });

      const res = await startHandler(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.code).toBe("REDIS_UNAVAILABLE");
    });
  });

  describe("GET /api/auth/facebook/callback", () => {
    it("procesa callback exitoso, crea sesión opaca y limpia cookie de estado", async () => {
      vi.mocked(authService.authenticateWithFacebook).mockResolvedValue({
        ok: true,
        data: {
          user: {
            id: "uuid-user-fb-1",
            email: "carlos@empresa.com",
            fullName: "Carlos Gómez",
            status: "active",
          },
          emailVerified: true,
          clientId: null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          sid: "generated-sid-facebook-32-bytes",
          csrfToken: "generated-csrf-token-fb",
        },
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/facebook/callback?code=valid-code&state=valid-state",
        {
          method: "GET",
          headers: {
            host: "localhost:3000",
            cookie: "mocter_oauth_state_facebook=valid-state",
            accept: "application/json",
          },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.user.id).toBe("uuid-user-fb-1");

      // Validar cookies de sesión y CSRF
      expect(res.cookies.get("mocter_sid")?.value).toBe("generated-sid-facebook-32-bytes");
      expect(res.cookies.get("mocter_csrf")?.value).toBe("generated-csrf-token-fb");

      // Validar que la cookie de state se limpia (maxAge: 0)
      expect(res.cookies.get("mocter_oauth_state_facebook")?.maxAge).toBe(0);
    });

    it("responde 400 si el proveedor devuelve error o denegación", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/auth/facebook/callback?error=access_denied",
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
        "http://localhost:3000/api/auth/facebook/callback",
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

    it("responde 503 con texto exacto «Proveedor temporalmente fuera de servicio» ante caída de Facebook", async () => {
      vi.mocked(authService.authenticateWithFacebook).mockResolvedValue({
        ok: false,
        error: "Proveedor temporalmente fuera de servicio",
        code: "PROVIDER_UNAVAILABLE",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/facebook/callback?code=c&state=s",
        {
          method: "GET",
          headers: {
            host: "localhost:3000",
            cookie: "mocter_oauth_state_facebook=s",
          },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("Proveedor temporalmente fuera de servicio");
      expect(data.code).toBe("PROVIDER_UNAVAILABLE");
    });

    it("responde 422 con texto exacto «El proveedor no devolvió un correo verificado.» si no hay correo", async () => {
      vi.mocked(authService.authenticateWithFacebook).mockResolvedValue({
        ok: false,
        error: "El proveedor no devolvió un correo verificado.",
        code: "MISSING_OR_UNVERIFIED_EMAIL",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/facebook/callback?code=c&state=s",
        {
          method: "GET",
          headers: {
            host: "localhost:3000",
            cookie: "mocter_oauth_state_facebook=s",
          },
        },
      );

      const res = await callbackHandler(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("El proveedor no devolvió un correo verificado.");
      expect(data.code).toBe("MISSING_OR_UNVERIFIED_EMAIL");
    });
  });
});
