import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FacebookOAuthClient,
  FacebookProviderUnavailableError,
  FacebookOAuthValidationError,
} from "./facebook-oauth.service";

describe("FacebookOAuthClient (AUTH-001 T-15)", () => {
  let client: FacebookOAuthClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new FacebookOAuthClient();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("getAuthorizationUrl", () => {
    it("construye la URL de Facebook con OAuth 2.0, state y scopes requeridos", () => {
      const urlString = client.getAuthorizationUrl({
        clientId: "facebook-app-id-123",
        redirectUri: "http://localhost:3000/api/auth/facebook/callback",
        state: "random-state-facebook-32-bytes",
      });

      const parsed = new URL(urlString);
      expect(parsed.origin).toBe("https://www.facebook.com");
      expect(parsed.pathname).toBe("/v19.0/dialog/oauth");
      expect(parsed.searchParams.get("client_id")).toBe("facebook-app-id-123");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/facebook/callback");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toBe("email,public_profile");
      expect(parsed.searchParams.get("state")).toBe("random-state-facebook-32-bytes");
    });
  });

  describe("exchangeCodeForAccessToken", () => {
    it("canjea el código por token de acceso exitosamente", async () => {
      const mockResponse = {
        access_token: "fb-access-token-xyz",
        token_type: "bearer",
        expires_in: 5184000,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as unknown as Response);

      const tokens = await client.exchangeCodeForAccessToken({
        code: "fb-code-123",
        clientId: "app-id-1",
        clientSecret: "app-secret-1",
        redirectUri: "http://localhost:3000/api/auth/facebook/callback",
      });

      expect(tokens.access_token).toBe("fb-access-token-xyz");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("graph.facebook.com/v19.0/oauth/access_token"),
        expect.any(Object),
      );
    });

    it("lanza FacebookProviderUnavailableError con texto exacto ante error de red", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

      await expect(
        client.exchangeCodeForAccessToken({
          code: "fb-code-123",
          clientId: "app-id-1",
          clientSecret: "app-secret-1",
          redirectUri: "http://localhost:3000/api/auth/facebook/callback",
        }),
      ).rejects.toThrow("Proveedor temporalmente fuera de servicio");
    });

    it("lanza FacebookProviderUnavailableError ante respuesta 500 de Facebook", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as unknown as Response);

      await expect(
        client.exchangeCodeForAccessToken({
          code: "fb-code-123",
          clientId: "app-id-1",
          clientSecret: "app-secret-1",
          redirectUri: "http://localhost:3000/api/auth/facebook/callback",
        }),
      ).rejects.toThrow(FacebookProviderUnavailableError);
    });
  });

  describe("fetchUserProfile (Validación estricta de correo en Graph API)", () => {
    it("retorna el perfil del usuario cuando el correo está presente", async () => {
      const mockProfile = {
        id: "fb-user-12345",
        name: "Carlos Gómez",
        email: "carlos@empresa.com",
        picture: {
          data: {
            url: "https://platform-lookaside.fbsbx.com/avatar.jpg",
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProfile,
      } as unknown as Response);

      const profile = await client.fetchUserProfile("mock-token");
      expect(profile.id).toBe("fb-user-12345");
      expect(profile.email).toBe("carlos@empresa.com");
      expect(profile.name).toBe("Carlos Gómez");
      expect(profile.picture?.data?.url).toBe("https://platform-lookaside.fbsbx.com/avatar.jpg");
    });

    it("lanza FacebookOAuthValidationError con texto exacto «El proveedor no devolvió un correo verificado.» si no hay correo", async () => {
      const mockProfileWithoutEmail = {
        id: "fb-user-sin-correo",
        name: "Usuario Sin Correo",
        // email ausente (registro por teléfono o permiso revocado)
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProfileWithoutEmail,
      } as unknown as Response);

      await expect(client.fetchUserProfile("mock-token")).rejects.toThrow(
        "El proveedor no devolvió un correo verificado.",
      );

      try {
        await client.fetchUserProfile("mock-token");
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(FacebookOAuthValidationError);
        expect((err as FacebookOAuthValidationError).code).toBe("MISSING_OR_UNVERIFIED_EMAIL");
        expect((err as FacebookOAuthValidationError).message).toBe(
          "El proveedor no devolvió un correo verificado.",
        );
      }
    });

    it("lanza FacebookProviderUnavailableError ante falla de red en Graph API", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Timeout"));

      await expect(client.fetchUserProfile("mock-token")).rejects.toThrow(
        FacebookProviderUnavailableError,
      );
    });
  });
});
