import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GoogleOidcClient,
  GoogleProviderUnavailableError,
  GoogleTokenValidationError,
  type GoogleIdTokenPayload,
} from "./google-oidc.service";

describe("GoogleOidcClient (AUTH-001 T-14)", () => {
  let client: GoogleOidcClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new GoogleOidcClient();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createTestJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = Buffer.from("dummy-signature").toString("base64url");
    return `${header}.${body}.${sig}`;
  }

  describe("getAuthorizationUrl", () => {
    it("construye la URL con PKCE S256, state, nonce y scopes requeridos", () => {
      const urlString = client.getAuthorizationUrl({
        clientId: "test-client-id.apps.googleusercontent.com",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        state: "random-state-32-bytes",
        codeChallenge: "test-code-challenge",
        nonce: "test-nonce-value",
        prompt: "select_account",
      });

      const parsed = new URL(urlString);
      expect(parsed.origin).toBe("https://accounts.google.com");
      expect(parsed.pathname).toBe("/o/oauth2/v2/auth");
      expect(parsed.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/google/callback");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toBe("openid email profile");
      expect(parsed.searchParams.get("state")).toBe("random-state-32-bytes");
      expect(parsed.searchParams.get("code_challenge")).toBe("test-code-challenge");
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("nonce")).toBe("test-nonce-value");
      expect(parsed.searchParams.get("prompt")).toBe("select_account");
    });
  });

  describe("discover (OIDC Discovery)", () => {
    it("obtiene y almacena en caché el documento .well-known/openid-configuration", async () => {
      const mockDoc = {
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDoc,
      } as unknown as Response);

      const result1 = await client.discover();
      expect(result1.authorization_endpoint).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Segunda llamada usa caché en memoria
      const result2 = await client.discover();
      expect(result2).toEqual(mockDoc);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("utiliza respaldo canónico si la petición de discovery falla", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

      const result = await client.discover();
      expect(result.issuer).toBe("https://accounts.google.com");
      expect(result.authorization_endpoint).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(result.token_endpoint).toBe("https://oauth2.googleapis.com/token");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("canjea código exitosamente y retorna id_token", async () => {
      const mockResponse = {
        access_token: "mock-access-token",
        id_token: "mock-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as unknown as Response);

      const tokens = await client.exchangeCodeForTokens({
        code: "auth-code-123",
        clientId: "client-id-1",
        clientSecret: "client-secret-1",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        codeVerifier: "verifier-123",
      });

      expect(tokens.id_token).toBe("mock-id-token");
      expect(tokens.access_token).toBe("mock-access-token");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      );
    });

    it("lanza GoogleProviderUnavailableError con texto exacto ante error de red", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        client.exchangeCodeForTokens({
          code: "auth-code-123",
          clientId: "client-id-1",
          clientSecret: "client-secret-1",
          redirectUri: "http://localhost:3000/api/auth/google/callback",
          codeVerifier: "verifier-123",
        }),
      ).rejects.toThrow("Proveedor temporalmente fuera de servicio");
    });

    it("lanza GoogleProviderUnavailableError ante respuesta 503 de Google", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      } as unknown as Response);

      await expect(
        client.exchangeCodeForTokens({
          code: "auth-code-123",
          clientId: "client-id-1",
          clientSecret: "client-secret-1",
          redirectUri: "http://localhost:3000/api/auth/google/callback",
          codeVerifier: "verifier-123",
        }),
      ).rejects.toThrow(GoogleProviderUnavailableError);
    });
  });

  describe("verifyIdToken (Validación estricta de claims OIDC)", () => {
    const validClientId = "my-client-id.apps.googleusercontent.com";
    const validNonce = "nonce-xyz-123";

    const createValidPayload = (): GoogleIdTokenPayload => ({
      iss: "https://accounts.google.com",
      sub: "google-user-id-999",
      aud: validClientId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      nonce: validNonce,
      email: "usuario@empresa.com",
      email_verified: true,
      name: "Usuario Google",
      picture: "https://google.com/avatar.jpg",
    });

    it("valida y retorna el payload cuando todos los claims son correctos", async () => {
      const payload = createValidPayload();
      const token = createTestJwt(payload);

      const verified = await client.verifyIdToken(token, validNonce, validClientId);
      expect(verified.sub).toBe("google-user-id-999");
      expect(verified.email).toBe("usuario@empresa.com");
      expect(verified.email_verified).toBe(true);
    });

    it("falla si el JWT no tiene 3 segmentos (MALFORMED_TOKEN)", async () => {
      await expect(
        client.verifyIdToken("token.invalido", validNonce, validClientId),
      ).rejects.toThrow(GoogleTokenValidationError);

      try {
        await client.verifyIdToken("token.invalido", validNonce, validClientId);
      } catch (err) {
        expect((err as GoogleTokenValidationError).code).toBe("MALFORMED_TOKEN");
      }
    });

    it("falla si el emisor iss no es de Google (INVALID_ISSUER)", async () => {
      const payload = { ...createValidPayload(), iss: "https://hacker.com" };
      const token = createTestJwt(payload);

      try {
        await client.verifyIdToken(token, validNonce, validClientId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(GoogleTokenValidationError);
        expect((err as GoogleTokenValidationError).code).toBe("INVALID_ISSUER");
      }
    });

    it("falla si la audiencia aud no coincide con el clientId esperado (INVALID_AUDIENCE)", async () => {
      const payload = { ...createValidPayload(), aud: "otro-client-id.com" };
      const token = createTestJwt(payload);

      try {
        await client.verifyIdToken(token, validNonce, validClientId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(GoogleTokenValidationError);
        expect((err as GoogleTokenValidationError).code).toBe("INVALID_AUDIENCE");
      }
    });

    it("falla si el token ha expirado (TOKEN_EXPIRED)", async () => {
      const payload = {
        ...createValidPayload(),
        exp: Math.floor(Date.now() / 1000) - 60, // Expirado hace 1 minuto
      };
      const token = createTestJwt(payload);

      try {
        await client.verifyIdToken(token, validNonce, validClientId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(GoogleTokenValidationError);
        expect((err as GoogleTokenValidationError).code).toBe("TOKEN_EXPIRED");
      }
    });

    it("falla si el nonce no coincide con el esperado (INVALID_NONCE)", async () => {
      const payload = { ...createValidPayload(), nonce: "nonce-diferente" };
      const token = createTestJwt(payload);

      try {
        await client.verifyIdToken(token, validNonce, validClientId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(GoogleTokenValidationError);
        expect((err as GoogleTokenValidationError).code).toBe("INVALID_NONCE");
      }
    });

    it("falla si email_verified no es true (EMAIL_NOT_VERIFIED)", async () => {
      const payload = { ...createValidPayload(), email_verified: false };
      const token = createTestJwt(payload);

      try {
        await client.verifyIdToken(token, validNonce, validClientId);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(GoogleTokenValidationError);
        expect((err as GoogleTokenValidationError).code).toBe("EMAIL_NOT_VERIFIED");
        expect((err as GoogleTokenValidationError).message).toBe("El proveedor no devolvió un correo verificado.");
      }
    });
  });
});
