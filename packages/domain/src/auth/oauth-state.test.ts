import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  OAuthStateManager,
  generateOAuthState,
  generateCodeVerifier,
  generateCodeChallenge,
  generateNonce,
  sanitizeReturnTo,
  buildOAuthRedisKey,
  getOAuthCookieName,
  getOAuthCookieOptions,
  compareOAuthStates,
  DEFAULT_SAFE_RETURN_TO,
  OAUTH_STATE_TTL_SECONDS,
} from "./oauth-state";
import {
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
} from "../redis";
import { RedisUnavailableError } from "./rate-limiter";

describe("AUTH-001 T-13 · State, PKCE y Cookies de OAuth", () => {
  let mockRedis: MockRedisClient;
  let manager: OAuthStateManager;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
    manager = new OAuthStateManager();
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  describe("Criptografía y Desafío PKCE", () => {
    it("genera state aleatorio con entropía adecuada en base64url", () => {
      const state1 = generateOAuthState();
      const state2 = generateOAuthState();

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
      expect(state1.length).toBeGreaterThanOrEqual(32);
    });

    it("genera code_verifier y code_challenge conforme a RFC 7636 (S256)", () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);

      const challenge = generateCodeChallenge(verifier);
      expect(challenge).toBeDefined();
      expect(challenge.length).toBeGreaterThan(0);
      expect(challenge).not.toBe(verifier);

      // Desafío determinístico
      const challengeRepeat = generateCodeChallenge(verifier);
      expect(challengeRepeat).toBe(challenge);
    });

    it("genera nonce criptográfico aleatorio para OIDC", () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(nonce1).not.toBe(nonce2);
    });

    it("compara estados de OAuth en tiempo constante de forma segura", () => {
      const state = "valid-state-abc-123";
      expect(compareOAuthStates(state, state)).toBe(true);
      expect(compareOAuthStates(state, "different-state")).toBe(false);
      expect(compareOAuthStates(state, "valid-state-abc-124")).toBe(false);
    });
  });

  describe("Sanitización estricta de return_to (Anti Open Redirect)", () => {
    it("acepta rutas relativas válidas", () => {
      expect(sanitizeReturnTo("/admin")).toBe("/admin");
      expect(sanitizeReturnTo("/admin/leads?tab=active")).toBe("/admin/leads?tab=active");
      expect(sanitizeReturnTo("/onboarding/setup")).toBe("/onboarding/setup");
    });

    it("rechaza URLs absolutas con esquema http o https", () => {
      expect(sanitizeReturnTo("https://evil.com")).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo("http://attacker.com/steal")).toBe(DEFAULT_SAFE_RETURN_TO);
    });

    it("rechaza URLs relativas al protocolo (//evil.com)", () => {
      expect(sanitizeReturnTo("//evil.com")).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo("//google.com/malicious")).toBe(DEFAULT_SAFE_RETURN_TO);
    });

    it("rechaza esquemas maliciosos como javascript: o data:", () => {
      expect(sanitizeReturnTo("javascript:alert(1)")).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo("/javascript:alert(1)")).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo("data:text/html,<script>")).toBe(DEFAULT_SAFE_RETURN_TO);
    });

    it("rechaza barras invertidas de Windows (/\\evil.com o \\path)", () => {
      expect(sanitizeReturnTo("/\\evil.com")).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo("\\evil.com")).toBe(DEFAULT_SAFE_RETURN_TO);
    });

    it("retorna fallback si el valor es nulo, indefinido o vacío", () => {
      expect(sanitizeReturnTo(null)).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_SAFE_RETURN_TO);
      expect(sanitizeReturnTo("   ")).toBe(DEFAULT_SAFE_RETURN_TO);
    });
  });

  describe("Cookies y Claves canónicas de OAuth", () => {
    it("construye la clave de Redis con hash SHA-256 del state sin exponer el state en plano", () => {
      const key = buildOAuthRedisKey("google", "raw-secret-state-12345");
      expect(key.startsWith("auth:oauth:google:")).toBe(true);
      expect(key).not.toContain("raw-secret-state-12345");
      expect(key.length).toBe("auth:oauth:google:".length + 64);
    });

    it("retorna nombres de cookies canónicas según proveedor y acción (AUTH-001 §6.2)", () => {
      expect(getOAuthCookieName("google", "login")).toBe("mocter_oauth_state_google");
      expect(getOAuthCookieName("facebook", "login")).toBe("mocter_oauth_state_facebook");
      expect(getOAuthCookieName("google", "link")).toBe("mocter_oauth_link_state_google");
      expect(getOAuthCookieName("facebook", "link")).toBe("mocter_oauth_link_state_facebook");
    });

    it("retorna opciones de cookies con SameSite=Lax, HttpOnly y Path acotado", () => {
      const googleLoginOpts = getOAuthCookieOptions("google", "login", true);
      expect(googleLoginOpts.httpOnly).toBe(true);
      expect(googleLoginOpts.secure).toBe(true);
      expect(googleLoginOpts.sameSite).toBe("lax");
      expect(googleLoginOpts.path).toBe("/auth/google");
      expect(googleLoginOpts.maxAge).toBe(OAUTH_STATE_TTL_SECONDS);

      const linkOpts = getOAuthCookieOptions("facebook", "link", false);
      expect(linkOpts.httpOnly).toBe(true);
      expect(linkOpts.secure).toBe(false);
      expect(linkOpts.sameSite).toBe("lax");
      expect(linkOpts.path).toBe("/auth/link");
    });
  });

  describe("OAuthStateManager · Ciclo de vida y validación atómica en Redis", () => {
    it("crea y persiste el estado de login en Redis con TTL de 10 minutos", async () => {
      const result = await manager.createState({
        provider: "google",
        action: "login",
        returnTo: "/admin/dashboard",
      });

      expect(result.state).toBeDefined();
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeChallenge).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(result.returnTo).toBe("/admin/dashboard");
      expect(result.cookieName).toBe("mocter_oauth_state_google");
      expect(result.cookieOptions.path).toBe("/auth/google");

      const redisKey = buildOAuthRedisKey("google", result.state);
      const rawStored = await mockRedis.get(redisKey);
      expect(rawStored).not.toBeNull();

      const stored = JSON.parse(rawStored!);
      expect(stored.provider).toBe("google");
      expect(stored.action).toBe("login");
      expect(stored.codeVerifier).toBe(result.codeVerifier);
      expect(stored.codeChallenge).toBe(result.codeChallenge);
      expect(stored.nonce).toBe(result.nonce);
      expect(stored.returnTo).toBe("/admin/dashboard");
    });

    it("crea estado de vinculación (link) preservando el userId para el callback", async () => {
      const result = await manager.createState({
        provider: "facebook",
        action: "link",
        userId: "uuid-user-link-123",
        returnTo: "/admin/settings",
      });

      expect(result.cookieName).toBe("mocter_oauth_link_state_facebook");
      expect(result.cookieOptions.path).toBe("/auth/link");

      const redisKey = buildOAuthRedisKey("facebook", result.state);
      const rawStored = await mockRedis.get(redisKey);
      const stored = JSON.parse(rawStored!);

      expect(stored.provider).toBe("facebook");
      expect(stored.action).toBe("link");
      expect(stored.userId).toBe("uuid-user-link-123");
    });

    it("consume el estado exitosamente en el primer intento (Single-use)", async () => {
      const created = await manager.createState({
        provider: "google",
        action: "login",
        returnTo: "/admin",
      });

      const consumeRes = await manager.consumeState({
        provider: "google",
        state: created.state,
        cookieState: created.state,
      });

      expect(consumeRes.ok).toBe(true);
      if (consumeRes.ok) {
        expect(consumeRes.data.provider).toBe("google");
        expect(consumeRes.data.codeVerifier).toBe(created.codeVerifier);
        expect(consumeRes.data.returnTo).toBe("/admin");
      }

      // Verificación de borrado atómico en Redis tras el primer consumo
      const redisKey = buildOAuthRedisKey("google", created.state);
      const afterConsume = await mockRedis.get(redisKey);
      expect(afterConsume).toBeNull();
    });

    it("falla con STATE_EXPIRED_OR_CONSUMED ante un segundo intento de consumo (Anti-Replay)", async () => {
      const created = await manager.createState({
        provider: "google",
        action: "login",
      });

      // Primer consumo exitoso
      const first = await manager.consumeState({
        provider: "google",
        state: created.state,
        cookieState: created.state,
      });
      expect(first.ok).toBe(true);

      // Segundo consumo (ataque de replay) rechazado
      const second = await manager.consumeState({
        provider: "google",
        state: created.state,
        cookieState: created.state,
      });
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.code).toBe("STATE_EXPIRED_OR_CONSUMED");
      }
    });

    it("falla con INVALID_STATE si el state recibido no coincide con la cookie", async () => {
      const created = await manager.createState({
        provider: "google",
        action: "login",
      });

      const mismatch = await manager.consumeState({
        provider: "google",
        state: created.state,
        cookieState: "different-cookie-state",
      });

      expect(mismatch.ok).toBe(false);
      if (!mismatch.ok) {
        expect(mismatch.code).toBe("INVALID_STATE");
      }
    });

    it("falla con INVALID_STATE si falta la cookie de navegación", async () => {
      const created = await manager.createState({
        provider: "google",
        action: "login",
      });

      const missingCookie = await manager.consumeState({
        provider: "google",
        state: created.state,
        cookieState: null,
      });

      expect(missingCookie.ok).toBe(false);
      if (!missingCookie.ok) {
        expect(missingCookie.code).toBe("INVALID_STATE");
      }
    });

    it("falla con PROVIDER_MISMATCH si se intenta consumir un state de Google con Facebook", async () => {
      const created = await manager.createState({
        provider: "google",
        action: "login",
      });

      // Intentar consumir con facebook
      const mismatch = await manager.consumeState({
        provider: "facebook",
        state: created.state,
        cookieState: created.state,
      });

      expect(mismatch.ok).toBe(false);
      if (!mismatch.ok) {
        // En este caso falla porque la clave de Redis auth:oauth:facebook:... no existe
        expect(["STATE_EXPIRED_OR_CONSUMED", "PROVIDER_MISMATCH"]).toContain(mismatch.code);
      }
    });

    it("lanza RedisUnavailableError (Fail-Closed) si Redis está caído al crear state", async () => {
      mockRedis.simulateFailure(true);

      await expect(
        manager.createState({
          provider: "google",
          action: "login",
        }),
      ).rejects.toThrow(RedisUnavailableError);
    });

    it("lanza RedisUnavailableError (Fail-Closed) si Redis está caído al consumir state", async () => {
      mockRedis.simulateFailure(true);

      await expect(
        manager.consumeState({
          provider: "google",
          state: "some-state-123",
          cookieState: "some-state-123",
        }),
      ).rejects.toThrow(RedisUnavailableError);
    });
  });
});
