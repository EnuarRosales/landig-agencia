import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AuthRateLimiter,
  RedisUnavailableError,
  hashHmacSha256,
  RATE_LIMIT_RULES,
} from "./rate-limiter";
import {
  MockRedisClient,
  createMockRedisClient,
} from "../redis/mock-redis";
import { setRedisClientForTesting } from "../redis/client";

describe("AUTH-001 T-12 · Limitador de tasa distribuido en Redis (AuthRateLimiter)", () => {
  let mockRedis: MockRedisClient;
  let limiter: AuthRateLimiter;
  const pepper = "test-secret-pepper-32-chars-long!";
  const testEmail = "carlos@empresa.com";
  const testIp = "192.168.1.100";

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
    limiter = new AuthRateLimiter();
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  describe("Login Rate Limiting (design.md §7.3, tasks.md T-12)", () => {
    it("permite el primer intento de inicio de sesión con cuota intacta", async () => {
      const decision = await limiter.checkLoginRateLimit({
        email: testEmail,
        ip: testIp,
        pepper,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(5);
      expect(decision.retryAfter).toBe(0);
    });

    it("el sexto intento falla tras 5 fallos consecutivos (bloqueo por cuenta+IP)", async () => {
      // 5 intentos fallidos
      for (let i = 1; i <= 5; i++) {
        const check = await limiter.checkLoginRateLimit({
          email: testEmail,
          ip: testIp,
          pepper,
        });
        expect(check.allowed).toBe(true);

        await limiter.recordLoginFailure({
          email: testEmail,
          ip: testIp,
          pepper,
        });
      }

      // El 6to intento debe fallar (allowed: false, Retry-After > 0)
      const sixthCheck = await limiter.checkLoginRateLimit({
        email: testEmail,
        ip: testIp,
        pepper,
      });

      expect(sixthCheck.allowed).toBe(false);
      expect(sixthCheck.remaining).toBe(0);
      expect(sixthCheck.retryAfter).toBeGreaterThan(0);
      expect(sixthCheck.retryAfter).toBeLessThanOrEqual(15 * 60);
      expect(sixthCheck.blockedBy).toBe("account_ip");
    });

    it("el login exitoso reinicia el contador de cuenta+IP permitiendo nuevos accesos", async () => {
      // 4 fallos previos
      for (let i = 0; i < 4; i++) {
        await limiter.recordLoginFailure({
          email: testEmail,
          ip: testIp,
          pepper,
        });
      }

      // Éxito de credenciales -> reset de cuenta+IP
      await limiter.resetLoginFailure({
        email: testEmail,
        ip: testIp,
        pepper,
      });

      // El siguiente intento vuelve a tener la cuota completa para cuenta+IP
      const decision = await limiter.checkLoginRateLimit({
        email: testEmail,
        ip: testIp,
        pepper,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(5);
    });

    it("dos réplicas comparten el contador en Redis", async () => {
      const replicaA = new AuthRateLimiter();
      const replicaB = new AuthRateLimiter();

      // Replica A registra 3 fallos
      for (let i = 0; i < 3; i++) {
        await replicaA.recordLoginFailure({
          email: testEmail,
          ip: testIp,
          pepper,
        });
      }

      // Replica B registra 2 fallos adicionales
      for (let i = 0; i < 2; i++) {
        await replicaB.recordLoginFailure({
          email: testEmail,
          ip: testIp,
          pepper,
        });
      }

      // Ambas réplicas observan el bloqueo en el 6to intento
      const checkA = await replicaA.checkLoginRateLimit({
        email: testEmail,
        ip: testIp,
        pepper,
      });
      const checkB = await replicaB.checkLoginRateLimit({
        email: testEmail,
        ip: testIp,
        pepper,
      });

      expect(checkA.allowed).toBe(false);
      expect(checkB.allowed).toBe(false);
      expect(checkA.retryAfter).toBeGreaterThan(0);
    });

    it("falla cerrado con RedisUnavailableError si Redis no responde", async () => {
      mockRedis.simulateFailure(true);

      await expect(
        limiter.checkLoginRateLimit({
          email: testEmail,
          ip: testIp,
          pepper,
        }),
      ).rejects.toThrow(RedisUnavailableError);

      await expect(
        limiter.recordLoginFailure({
          email: testEmail,
          ip: testIp,
          pepper,
        }),
      ).rejects.toThrow(RedisUnavailableError);

      await expect(
        limiter.resetLoginFailure({
          email: testEmail,
          ip: testIp,
          pepper,
        }),
      ).rejects.toThrow(RedisUnavailableError);
    });
  });

  describe("Registro Nativo (design.md §7.3)", () => {
    it("permite hasta 5 registros por IP en 1 hora y bloquea el sexto", async () => {
      for (let i = 1; i <= 5; i++) {
        const decision = await limiter.checkRegisterRateLimit({
          ip: testIp,
          pepper,
        });
        expect(decision.allowed).toBe(true);
        expect(decision.remaining).toBe(5 - i);
      }

      // 6to intento bloqueado
      const blocked = await limiter.checkRegisterRateLimit({
        ip: testIp,
        pepper,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfter).toBeGreaterThan(0);
      expect(blocked.retryAfter).toBeLessThanOrEqual(3600);
      expect(blocked.blockedBy).toBe("ip");
    });

    it("falla cerrado con RedisUnavailableError si Redis no responde en registro", async () => {
      mockRedis.simulateFailure(true);

      await expect(
        limiter.checkRegisterRateLimit({
          ip: testIp,
          pepper,
        }),
      ).rejects.toThrow(RedisUnavailableError);
    });
  });

  describe("Reenvío y Confirmación de Verificación de Correo (design.md §7.3)", () => {
    it("aplica límite de 3 reenvíos de verificación por usuario", async () => {
      for (let i = 1; i <= 3; i++) {
        const decision = await limiter.checkEmailVerifyRequestRateLimit({
          user: "uuid-user-1",
          ip: testIp,
          pepper,
        });
        expect(decision.allowed).toBe(true);
      }

      const blocked = await limiter.checkEmailVerifyRequestRateLimit({
        user: "uuid-user-1",
        ip: testIp,
        pepper,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedBy).toBe("user");
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it("aplica límite de 5 confirmaciones de correo por IP", async () => {
      for (let i = 1; i <= 5; i++) {
        const decision = await limiter.checkEmailVerifyConfirmRateLimit({
          ip: testIp,
          pepper,
        });
        expect(decision.allowed).toBe(true);
      }

      const blocked = await limiter.checkEmailVerifyConfirmRateLimit({
        ip: testIp,
        pepper,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });
  });

  describe("Recuperación, Reset y Cambio de Contraseña (design.md §7.3)", () => {
    it("aplica límite de 3 solicitudes de recuperación (forgot) por cuenta", async () => {
      for (let i = 1; i <= 3; i++) {
        const decision = await limiter.checkForgotPasswordRateLimit({
          email: testEmail,
          ip: testIp,
          pepper,
        });
        expect(decision.allowed).toBe(true);
      }

      const blocked = await limiter.checkForgotPasswordRateLimit({
        email: testEmail,
        ip: testIp,
        pepper,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedBy).toBe("account");
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it("aplica límite de 5 intentos de reset por token en 15 minutos", async () => {
      const resetToken = "raw-password-reset-token-32-bytes";
      for (let i = 1; i <= 5; i++) {
        const decision = await limiter.checkPasswordResetRateLimit({
          token: resetToken,
          pepper,
        });
        expect(decision.allowed).toBe(true);
      }

      const blocked = await limiter.checkPasswordResetRateLimit({
        token: resetToken,
        pepper,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedBy).toBe("token");
    });

    it("aplica límite de 3 cambios de contraseña por usuario en 1 hora", async () => {
      const userId = "uuid-user-active";
      for (let i = 1; i <= 3; i++) {
        const decision = await limiter.checkPasswordChangeRateLimit({
          userId,
          pepper,
        });
        expect(decision.allowed).toBe(true);
      }

      const blocked = await limiter.checkPasswordChangeRateLimit({
        userId,
        pepper,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.blockedBy).toBe("user");
    });
  });

  describe("Seguridad criptográfica de claves en Redis (AUTH-001 §7.3)", () => {
    it("las claves de Redis utilizan exclusivamente hashes HMAC-SHA-256 y nunca texto plano", async () => {
      await limiter.recordLoginFailure({
        email: "sensible-usuario@empresa.com",
        ip: "203.0.113.195",
        pepper,
      });

      await limiter.checkRegisterRateLimit({
        ip: "203.0.113.195",
        pepper,
      });

      const storedKeys = mockRedis.getAllKeys();
      expect(storedKeys.length).toBeGreaterThan(0);

      for (const key of storedKeys) {
        expect(key).not.toContain("sensible-usuario@empresa.com");
        expect(key).not.toContain("203.0.113.195");
        // Verifica que la clave contenga el prefijo de auth
        expect(key.startsWith("auth:ratelimit:")).toBe(true);
        // Verifica que el hash sea hexadecimal de 64 caracteres
        const parts = key.split(":");
        const lastPart = parts[parts.length - 1];
        expect(lastPart?.length).toBe(64);
      }
    });
  });
});
