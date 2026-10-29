import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  oauthStateManager,
  defaultGoogleOidcClient,
  defaultFacebookOAuthClient,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
} from "@mocter/domain";
import { POST as startHandler } from "./[provider]/start/route";
import { GET as callbackHandler } from "./[provider]/callback/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn(),
      linkProviderIdentity: vi.fn(),
    },
    defaultGoogleOidcClient: {
      ...actual.defaultGoogleOidcClient,
      getAuthorizationUrl: vi.fn(),
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

describe("AUTH-001 T-16 · Rutas de Vinculación de Identidades (/api/auth/link/*)", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
    process.env.FACEBOOK_APP_SECRET = "test-facebook-app-secret";
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  describe("POST /api/auth/link/:provider/start", () => {
    it("responde 400 si el proveedor no está soportado", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/link/github/start", {
        method: "POST",
      });

      const res = await startHandler(req, {
        params: Promise.resolve({ provider: "github" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_PROVIDER");
    });

    it("responde 401 si no hay cookie de sesión activa", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/link/google/start", {
        method: "POST",
      });

      const res = await startHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("responde 403 si la sesión es válida pero el token CSRF es inválido", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: false,
        error: "Token CSRF inválido o ausente.",
        code: "FORBIDDEN",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/link/google/start", {
        method: "POST",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-invalido",
        },
      });

      const res = await startHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("inicia vinculación exitosa con Google OIDC, genera state en Redis y fija cookie con Path=/auth/link", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-uuid-1",
            authMethod: "password",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as any,
        },
      });

      vi.mocked(oauthStateManager.createState).mockResolvedValue({
        state: "state-link-google-32b",
        codeVerifier: "verifier-link",
        codeChallenge: "challenge-link",
        nonce: "nonce-link",
        returnTo: "/admin/settings",
        cookieName: "mocter_oauth_link_state_google",
        cookieOptions: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/auth/link",
          maxAge: 600,
        },
      });

      vi.mocked(defaultGoogleOidcClient.getAuthorizationUrl).mockReturnValue(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test-google-client-id&state=state-link-google-32b",
      );

      const req = new NextRequest(
        "http://localhost:3000/api/auth/link/google/start?return_to=/admin/settings",
        {
          method: "POST",
          headers: {
            cookie: "mocter_sid=sid-valido",
            "x-csrf-token": "csrf-valido",
          },
        },
      );

      const res = await startHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("accounts.google.com");

      // Verificar que se guardó en Redis con action: link y userId
      expect(oauthStateManager.createState).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          action: "link",
          userId: "user-uuid-1",
          returnTo: "/admin/settings",
        }),
        false,
      );

      // Verificar cookie fijada con Path=/auth/link
      const linkCookie = res.cookies.get("mocter_oauth_link_state_google");
      expect(linkCookie?.value).toBe("state-link-google-32b");
      expect(linkCookie?.path).toBe("/auth/link");
    });

    it("responde 429 si se excede el límite de tasa de vinculación (10/15 min por usuario)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: {
          session: {
            id: "sess-1",
            userId: "user-uuid-spam",
            authMethod: "password",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          } as any,
        },
      });

      vi.mocked(oauthStateManager.createState).mockResolvedValue({
        state: "state-spam",
        codeVerifier: "v",
        codeChallenge: "c",
        returnTo: "/admin",
        cookieName: "mocter_oauth_link_state_google",
        cookieOptions: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/auth/link",
          maxAge: 600,
        },
      });

      // Agotar los 10 intentos
      for (let i = 0; i < 10; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/link/google/start", {
          method: "POST",
          headers: {
            cookie: "mocter_sid=sid-valido",
            "x-csrf-token": "csrf-valido",
          },
        });
        const res = await startHandler(req, {
          params: Promise.resolve({ provider: "google" }),
        });
        expect(res.status).toBe(307);
      }

      // El 11.º intento debe ser bloqueado con 429
      const reqBlocked = new NextRequest("http://localhost:3000/api/auth/link/google/start", {
        method: "POST",
        headers: {
          cookie: "mocter_sid=sid-valido",
          "x-csrf-token": "csrf-valido",
        },
      });
      const resBlocked = await startHandler(reqBlocked, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(resBlocked.status).toBe(429);
      const json = await resBlocked.json();
      expect(json.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("GET /api/auth/link/:provider/callback", () => {
    it("responde 400 si el proveedor devuelve error de cancelación", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/auth/link/google/callback?error=access_denied",
      );

      const res = await callbackHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("OAUTH_ACCESS_DENIED");
    });

    it("responde 400 si faltan los parámetros code o state", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/auth/link/google/callback?code=some-code",
      );

      const res = await callbackHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    it("responde 409 si la identidad federada ya pertenece a otro usuario en el sistema", async () => {
      vi.mocked(authService.linkProviderIdentity).mockResolvedValue({
        ok: false,
        error: "Esta cuenta de Google ya está vinculada a otro usuario.",
        code: "IDENTITY_ALREADY_LINKED",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/link/google/callback?code=code-dup&state=state-dup",
        {
          headers: {
            cookie: "mocter_oauth_link_state_google=state-dup",
          },
        },
      );

      const res = await callbackHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("IDENTITY_ALREADY_LINKED");
    });

    it("responde 422 si el proveedor no devolvió correo verificado", async () => {
      vi.mocked(authService.linkProviderIdentity).mockResolvedValue({
        ok: false,
        error: "El proveedor no devolvió un correo verificado.",
        code: "MISSING_OR_UNVERIFIED_EMAIL",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/auth/link/facebook/callback?code=code-fb&state=state-fb",
        {
          headers: {
            cookie: "mocter_oauth_link_state_facebook=state-fb",
          },
        },
      );

      const res = await callbackHandler(req, {
        params: Promise.resolve({ provider: "facebook" }),
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("MISSING_OR_UNVERIFIED_EMAIL");
    });

    it("vincula exitosamente sin requerir cookie de sesión, emite sesión y limpia cookie de estado", async () => {
      vi.mocked(authService.linkProviderIdentity).mockResolvedValue({
        ok: true,
        data: {
          user: {
            id: "uuid-user-1",
            email: "carlos@empresa.com",
            fullName: "Carlos",
            status: "active",
          },
          clientId: null,
          expiresAt: new Date(Date.now() + 43200000).toISOString(),
          emailVerified: true,
          sid: "sid-nuevo-vinculado",
          csrfToken: "csrf-nuevo-vinculado",
          returnTo: "/admin/perfil",
        },
      });

      // No se envía cookie mocter_sid porque es SameSite=Strict y el navegador no la adjunta en el callback
      const req = new NextRequest(
        "http://localhost:3000/api/auth/link/google/callback?code=valid-code&state=valid-state",
        {
          headers: {
            cookie: "mocter_oauth_link_state_google=valid-state",
          },
        },
      );

      const res = await callbackHandler(req, {
        params: Promise.resolve({ provider: "google" }),
      });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("http://localhost:3000/admin/perfil");

      // Verifica que se fijaron las nuevas cookies de sesión opaca
      const sidCookie = res.cookies.get("mocter_sid");
      expect(sidCookie?.value).toBe("sid-nuevo-vinculado");
      expect(sidCookie?.httpOnly).toBe(true);

      const csrfCookie = res.cookies.get("mocter_csrf");
      expect(csrfCookie?.value).toBe("csrf-nuevo-vinculado");

      // Verifica que la cookie de estado de vinculación se limpió
      const clearedCookie = res.cookies.get("mocter_oauth_link_state_google");
      expect(clearedCookie?.maxAge).toBe(0);
    });
  });
});
