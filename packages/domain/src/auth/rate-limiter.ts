import { createHmac } from "node:crypto";
import { getRedisClient } from "../redis/client";
import { appLogger } from "../utils/logger";
import { normalizeEmail } from "./validation";

/**
 * Excepción lanzada cuando el servicio Redis del plano de control no responde o se encuentra caído.
 *
 * Permite a los Route Handlers aplicar la política de fallo cerrado (Fail-Closed, HTTP 503)
 * según lo exigido por AUTH-001 §7.4 y AGENTS.md.
 */
export class RedisUnavailableError extends Error {
  constructor(message = "Redis del plano de control no disponible", cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "RedisUnavailableError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Decisión y métricas de evaluación retornadas por el limitador de tasa distribuido en Redis.
 */
export interface RateLimitDecision {
  /** Indica si la petición actual tiene permitido proceder. */
  allowed: boolean;
  /** Cantidad de intentos restantes dentro de la ventana de tiempo activa. */
  remaining: number;
  /** Marca de tiempo Unix en milisegundos en la que se restablece la cuota. */
  resetAt: number;
  /** Segundos que el cliente debe esperar antes de reintentar (para encabezado HTTP `Retry-After`). */
  retryAfter: number;
  /** Causa o regla específica que originó el bloqueo en caso de cuota excedida. */
  blockedBy?: string;
}

/**
 * Reglas canónicas de limitación de tasa por endpoint y propósito (AUTH-001 design.md §7.3).
 */
export const RATE_LIMIT_RULES = {
  login: {
    accountIp: { limit: 5, windowSeconds: 15 * 60 }, // 5 fallos en 15 min
    account: { limit: 10, windowSeconds: 15 * 60 },  // 10 fallos en 15 min
    ip: { limit: 30, windowSeconds: 15 * 60 },       // 30 fallos en 15 min
  },
  register: {
    ip: { limit: 5, windowSeconds: 60 * 60 },        // 5 solicitudes en 1 hora
  },
  verifyRequest: {
    user: { limit: 3, windowSeconds: 15 * 60 },      // 3 reenvíos en 15 min
    ip: { limit: 10, windowSeconds: 60 * 60 },       // 10 reenvíos en 1 hora
  },
  verifyConfirm: {
    ip: { limit: 5, windowSeconds: 15 * 60 },        // 5 confirmaciones en 15 min
  },
  forgotPassword: {
    account: { limit: 3, windowSeconds: 60 * 60 },   // 3 solicitudes en 1 hora
    ip: { limit: 10, windowSeconds: 60 * 60 },       // 10 solicitudes en 1 hora
  },
  passwordReset: {
    token: { limit: 5, windowSeconds: 15 * 60 },     // 5 intentos en 15 min
  },
  passwordChange: {
    user: { limit: 3, windowSeconds: 60 * 60 },      // 3 cambios en 1 hora
  },
  oauth: {
    ip: { limit: 20, windowSeconds: 15 * 60 },       // 20 solicitudes en 15 min por IP (design.md §6.1)
  },
  linkIdentity: {
    user: { limit: 10, windowSeconds: 15 * 60 },     // 10 vinculaciones en 15 min por usuario (design.md §7.3)
  },
  unlinkIdentity: {
    user: { limit: 5, windowSeconds: 15 * 60 },      // 5 desvinculaciones en 15 min por usuario (design.md §7.3)
  },
  totpEnroll: {
    user: { limit: 5, windowSeconds: 15 * 60 },      // 5 peticiones en 15 min por usuario (design.md §6.1)
  },
  totpConfirm: {
    user: { limit: 5, windowSeconds: 15 * 60 },      // 5 peticiones en 15 min por usuario (design.md §6.1)
  },
  totpDisable: {
    user: { limit: 5, windowSeconds: 15 * 60 },      // 5 peticiones en 15 min por usuario (design.md §6.1)
  },
  totpChallenge: {
    challenge: { limit: 5, windowSeconds: 5 * 60 },  // 5 intentos en 5 min por challenge (design.md §6.1)
  },
} as const;

/**
 * Script Lua para verificar si una clave ha superado su límite sin consumir cuota adicional (inspección atómica).
 */
const LUA_CHECK = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])

local current = tonumber(redis.call('GET', key) or '0')
local ttl = redis.call('TTL', key)
if ttl < 0 then
  ttl = 0
end

local allowed = current < limit
local remaining = math.max(0, limit - current)
return { allowed and 1 or 0, remaining, ttl }
`;

/**
 * Script Lua para incrementar atómicamente el contador de fallos con asignación de TTL en el primer fallo.
 */
const LUA_INCR_FAILURE = `
local key = KEYS[1]
local windowSeconds = tonumber(ARGV[1])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, windowSeconds)
end
local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIRE', key, windowSeconds)
  ttl = windowSeconds
end
return { current, ttl }
`;

/**
 * Script Lua para consumir atómicamente 1 unidad de cuota con asignación de ventana y evaluación de límite.
 */
const LUA_CONSUME = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, windowSeconds)
end

local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIRE', key, windowSeconds)
  ttl = windowSeconds
end

local allowed = current <= limit
local remaining = math.max(0, limit - current)
return { allowed and 1 or 0, remaining, ttl }
`;

/**
 * Calcula el hash HMAC-SHA-256 de una cadena utilizando el pepper del sistema (AUTH-001 §7.3).
 *
 * Previene la persistencia en texto plano de correos, direcciones IP o tokens dentro de las claves de Redis.
 *
 * @param value - Valor confidencial a anonimizar.
 * @param pepper - Clave secreta estática del sistema (`AUTH_RATE_LIMIT_PEPPER`).
 * @returns Hash hexadecimal de 64 caracteres.
 */
export function hashHmacSha256(value: string, pepper?: string): string {
  const activePepper = pepper || process.env.AUTH_RATE_LIMIT_PEPPER || "mocter-dev-pepper";
  return createHmac("sha256", activePepper).update(value).digest("hex");
}

/**
 * Limitador de tasa distribuido en Redis del plano de control (`redis-control`) para autenticación.
 */
export class AuthRateLimiter {
  /**
   * Evalúa si una solicitud de inicio de sesión nativo está autorizada a proceder (AUTH-001 §7.3).
   *
   * Inspecciona simultáneamente tres contadores atómicos sin incrementarlos:
   * 1. `account_ip`: Máximo 5 fallos por cuenta + IP en 15 minutos.
   * 2. `account`: Máximo 10 fallos por cuenta en 15 minutos.
   * 3. `ip`: Máximo 30 fallos por IP en 15 minutos.
   *
   * @param params - Correo del usuario, IP del cliente y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkLoginRateLimit(params: {
    email: string;
    ip: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { email, ip, pepper } = params;
    const client = getRedisClient();

    const ipHash = hashHmacSha256(ip, pepper);
    const accountHash = hashHmacSha256(normalizeEmail(email), pepper);

    const keyAccountIp = `auth:ratelimit:login:account_ip:${accountHash}:${ipHash}`;
    const keyAccount = `auth:ratelimit:login:account:${accountHash}`;
    const keyIp = `auth:ratelimit:login:ip:${ipHash}`;

    try {
      const [resAccountIp, resAccount, resIp] = await Promise.all([
        client.eval(
          LUA_CHECK,
          1,
          keyAccountIp,
          String(RATE_LIMIT_RULES.login.accountIp.limit),
        ) as Promise<[number, number, number]>,
        client.eval(
          LUA_CHECK,
          1,
          keyAccount,
          String(RATE_LIMIT_RULES.login.account.limit),
        ) as Promise<[number, number, number]>,
        client.eval(
          LUA_CHECK,
          1,
          keyIp,
          String(RATE_LIMIT_RULES.login.ip.limit),
        ) as Promise<[number, number, number]>,
      ]);

      const allowedAccountIp = resAccountIp[0] === 1;
      const allowedAccount = resAccount[0] === 1;
      const allowedIp = resIp[0] === 1;

      if (!allowedAccountIp || !allowedAccount || !allowedIp) {
        const ttlAccountIp = Number(resAccountIp[2]);
        const ttlAccount = Number(resAccount[2]);
        const ttlIp = Number(resIp[2]);

        let maxTtl = Math.max(
          !allowedAccountIp ? ttlAccountIp : 0,
          !allowedAccount ? ttlAccount : 0,
          !allowedIp ? ttlIp : 0,
        );
        if (maxTtl <= 0) maxTtl = 1;

        let blockedBy = "account_ip";
        if (!allowedAccountIp) blockedBy = "account_ip";
        else if (!allowedAccount) blockedBy = "account";
        else blockedBy = "ip";

        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + maxTtl * 1000,
          retryAfter: maxTtl,
          blockedBy,
        };
      }

      const minRemaining = Math.min(
        Number(resAccountIp[1]),
        Number(resAccount[1]),
        Number(resIp[1]),
      );

      return {
        allowed: true,
        remaining: minRemaining,
        resetAt: Date.now() + RATE_LIMIT_RULES.login.accountIp.windowSeconds * 1000,
        retryAfter: 0,
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkLoginRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Registra atómicamente un intento fallido de inicio de sesión (credenciales incorrectas).
   *
   * Incrementa los contadores para cuenta+IP, cuenta global e IP global.
   *
   * @param params - Correo del usuario, IP del cliente y pepper del sistema.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async recordLoginFailure(params: {
    email: string;
    ip: string;
    pepper: string;
  }): Promise<void> {
    const { email, ip, pepper } = params;
    const client = getRedisClient();

    const ipHash = hashHmacSha256(ip, pepper);
    const accountHash = hashHmacSha256(normalizeEmail(email), pepper);

    const keyAccountIp = `auth:ratelimit:login:account_ip:${accountHash}:${ipHash}`;
    const keyAccount = `auth:ratelimit:login:account:${accountHash}`;
    const keyIp = `auth:ratelimit:login:ip:${ipHash}`;

    try {
      await Promise.all([
        client.eval(
          LUA_INCR_FAILURE,
          1,
          keyAccountIp,
          String(RATE_LIMIT_RULES.login.accountIp.windowSeconds),
        ),
        client.eval(
          LUA_INCR_FAILURE,
          1,
          keyAccount,
          String(RATE_LIMIT_RULES.login.account.windowSeconds),
        ),
        client.eval(
          LUA_INCR_FAILURE,
          1,
          keyIp,
          String(RATE_LIMIT_RULES.login.ip.windowSeconds),
        ),
      ]);
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.recordLoginFailure] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Reinicia el contador de fallos para la combinación de cuenta + IP tras un inicio de sesión exitoso.
   *
   * Cumple con la exigencia de T-12: "el éxito reinicia el contador de cuenta+IP".
   *
   * @param params - Correo del usuario, IP del cliente y pepper del sistema.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async resetLoginFailure(params: {
    email: string;
    ip: string;
    pepper: string;
  }): Promise<void> {
    const { email, ip, pepper } = params;
    const client = getRedisClient();

    const ipHash = hashHmacSha256(ip, pepper);
    const accountHash = hashHmacSha256(normalizeEmail(email), pepper);
    const keyAccountIp = `auth:ratelimit:login:account_ip:${accountHash}:${ipHash}`;

    try {
      await client.del(keyAccountIp);
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.resetLoginFailure] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota de solicitudes de registro nativo por dirección IP (AUTH-001 §7.3).
   *
   * Límite: 5 registros por IP en una ventana deslizante de 1 hora.
   *
   * @param params - IP del cliente remitente y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkRegisterRateLimit(params: {
    ip: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { ip, pepper } = params;
    const client = getRedisClient();
    const ipHash = hashHmacSha256(ip, pepper);
    const key = `auth:ratelimit:register:ip:${ipHash}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.register.ip.limit),
        String(RATE_LIMIT_RULES.register.ip.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "ip",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkRegisterRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota para solicitudes de reenvío de correo de verificación (AUTH-001 §7.3).
   *
   * Límites:
   * - Por usuario: 3 reenvíos en 15 minutos.
   * - Por IP: 10 reenvíos en 1 hora.
   *
   * @param params - Identificador del usuario (o correo), IP del cliente y pepper.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkEmailVerifyRequestRateLimit(params: {
    user: string;
    ip: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { user, ip, pepper } = params;
    const client = getRedisClient();
    const userHash = hashHmacSha256(user, pepper);
    const ipHash = hashHmacSha256(ip, pepper);

    const keyUser = `auth:ratelimit:verify_req:user:${userHash}`;
    const keyIp = `auth:ratelimit:verify_req:ip:${ipHash}`;

    try {
      const [resUser, resIp] = await Promise.all([
        client.eval(
          LUA_CONSUME,
          1,
          keyUser,
          String(RATE_LIMIT_RULES.verifyRequest.user.limit),
          String(RATE_LIMIT_RULES.verifyRequest.user.windowSeconds),
        ) as Promise<[number, number, number]>,
        client.eval(
          LUA_CONSUME,
          1,
          keyIp,
          String(RATE_LIMIT_RULES.verifyRequest.ip.limit),
          String(RATE_LIMIT_RULES.verifyRequest.ip.windowSeconds),
        ) as Promise<[number, number, number]>,
      ]);

      const allowedUser = resUser[0] === 1;
      const allowedIp = resIp[0] === 1;

      if (!allowedUser || !allowedIp) {
        const ttlUser = Number(resUser[2]);
        const ttlIp = Number(resIp[2]);
        const maxTtl = Math.max(!allowedUser ? ttlUser : 0, !allowedIp ? ttlIp : 0);

        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + maxTtl * 1000,
          retryAfter: Math.max(1, maxTtl),
          blockedBy: !allowedUser ? "user" : "ip",
        };
      }

      return {
        allowed: true,
        remaining: Math.min(Number(resUser[1]), Number(resIp[1])),
        resetAt: Date.now() + Math.min(Number(resUser[2]), Number(resIp[2])) * 1000,
        retryAfter: 0,
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkEmailVerifyRequestRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota para confirmaciones de token de verificación por IP (AUTH-001 §7.3).
   *
   * Límite: 5 intentos de confirmación en 15 minutos.
   *
   * @param params - IP del cliente remitente y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkEmailVerifyConfirmRateLimit(params: {
    ip: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { ip, pepper } = params;
    const client = getRedisClient();
    const ipHash = hashHmacSha256(ip, pepper);
    const key = `auth:ratelimit:verify_confirm:ip:${ipHash}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.verifyConfirm.ip.limit),
        String(RATE_LIMIT_RULES.verifyConfirm.ip.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "ip",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkEmailVerifyConfirmRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota para solicitudes de recuperación de contraseña (forgot password, AUTH-001 §7.3).
   *
   * Límites:
   * - Por cuenta: 3 solicitudes en 1 hora.
   * - Por IP: 10 solicitudes en 1 hora.
   *
   * @param params - Correo del usuario, IP del cliente y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkForgotPasswordRateLimit(params: {
    email: string;
    ip: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { email, ip, pepper } = params;
    const client = getRedisClient();
    const accountHash = hashHmacSha256(normalizeEmail(email), pepper);
    const ipHash = hashHmacSha256(ip, pepper);

    const keyAccount = `auth:ratelimit:forgot:account:${accountHash}`;
    const keyIp = `auth:ratelimit:forgot:ip:${ipHash}`;

    try {
      const [resAccount, resIp] = await Promise.all([
        client.eval(
          LUA_CONSUME,
          1,
          keyAccount,
          String(RATE_LIMIT_RULES.forgotPassword.account.limit),
          String(RATE_LIMIT_RULES.forgotPassword.account.windowSeconds),
        ) as Promise<[number, number, number]>,
        client.eval(
          LUA_CONSUME,
          1,
          keyIp,
          String(RATE_LIMIT_RULES.forgotPassword.ip.limit),
          String(RATE_LIMIT_RULES.forgotPassword.ip.windowSeconds),
        ) as Promise<[number, number, number]>,
      ]);

      const allowedAccount = resAccount[0] === 1;
      const allowedIp = resIp[0] === 1;

      if (!allowedAccount || !allowedIp) {
        const ttlAccount = Number(resAccount[2]);
        const ttlIp = Number(resIp[2]);
        const maxTtl = Math.max(!allowedAccount ? ttlAccount : 0, !allowedIp ? ttlIp : 0);

        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + maxTtl * 1000,
          retryAfter: Math.max(1, maxTtl),
          blockedBy: !allowedAccount ? "account" : "ip",
        };
      }

      return {
        allowed: true,
        remaining: Math.min(Number(resAccount[1]), Number(resIp[1])),
        resetAt: Date.now() + Math.min(Number(resAccount[2]), Number(resIp[2])) * 1000,
        retryAfter: 0,
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkForgotPasswordRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota para intentos de restablecimiento de contraseña por token (AUTH-001 §7.3).
   *
   * Límite: 5 intentos por token en 15 minutos.
   *
   * @param params - Token en claro a anonimizar y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkPasswordResetRateLimit(params: {
    token: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { token, pepper } = params;
    const client = getRedisClient();
    const tokenHash = hashHmacSha256(token, pepper);
    const key = `auth:ratelimit:reset:token:${tokenHash}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.passwordReset.token.limit),
        String(RATE_LIMIT_RULES.passwordReset.token.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "token",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkPasswordResetRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota para cambios autenticados de contraseña por usuario (AUTH-001 §7.3).
   *
   * Límite: 3 cambios de contraseña por usuario en 1 hora.
   *
   * @param params - Identificador del usuario autenticado y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkPasswordChangeRateLimit(params: {
    userId: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { userId, pepper } = params;
    const client = getRedisClient();
    const userHash = hashHmacSha256(userId, pepper);
    const key = `auth:ratelimit:change:user:${userHash}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.passwordChange.user.limit),
        String(RATE_LIMIT_RULES.passwordChange.user.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "user",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkPasswordChangeRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume la cuota para endpoints OAuth federados (AUTH-001 §6.1, T-14, T-15).
   *
   * Límite: 20 peticiones por ventana de 15 minutos (900 s) por dirección IP.
   *
   * @param params - Proveedor federado ("google" | "facebook"), IP del cliente y pepper del sistema.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkOAuthRateLimit(params: {
    provider: "google" | "facebook";
    ip: string;
    pepper: string;
  }): Promise<RateLimitDecision> {
    const { provider, ip, pepper } = params;
    const client = getRedisClient();
    const ipHash = hashHmacSha256(ip, pepper);
    const key = `auth:ratelimit:oauth:${provider}:${ipHash}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.oauth.ip.limit),
        String(RATE_LIMIT_RULES.oauth.ip.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "ip",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkOAuthRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume el límite de tasa para vinculación de identidad federada (AUTH-001 §7.3).
   *
   * Límite: 10 peticiones por ventana de 15 minutos (900 s) por usuario.
   *
   * @param userId - Identificador UUID del usuario autenticado.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkLinkIdentityRateLimit(userId: string): Promise<RateLimitDecision> {
    const client = getRedisClient();
    const key = `auth:ratelimit:link:user:${userId}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.linkIdentity.user.limit),
        String(RATE_LIMIT_RULES.linkIdentity.user.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "user",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkLinkIdentityRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume el límite de tasa para desvinculación de identidad federada (AUTH-001 §7.3).
   *
   * Límite: 5 peticiones por ventana de 15 minutos (900 s) por usuario.
   *
   * @param userId - Identificador UUID del usuario autenticado.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkUnlinkIdentityRateLimit(userId: string): Promise<RateLimitDecision> {
    const client = getRedisClient();
    const key = `auth:ratelimit:unlink:user:${userId}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.unlinkIdentity.user.limit),
        String(RATE_LIMIT_RULES.unlinkIdentity.user.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "user",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkUnlinkIdentityRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume el límite de tasa para solicitudes de enrolamiento 2FA (AUTH-001 §6.1).
   *
   * Límite: 5 peticiones por ventana de 15 minutos (900 s) por usuario.
   *
   * @param userId - Identificador UUID del usuario autenticado.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkTotpEnrollRateLimit(userId: string): Promise<RateLimitDecision> {
    const client = getRedisClient();
    const key = `auth:ratelimit:totp:enroll:user:${userId}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.totpEnroll.user.limit),
        String(RATE_LIMIT_RULES.totpEnroll.user.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "user",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkTotpEnrollRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume el límite de tasa para confirmación de enrolamiento 2FA (AUTH-001 §6.1).
   *
   * Límite: 5 peticiones por ventana de 15 minutos (900 s) por usuario.
   *
   * @param userId - Identificador UUID del usuario autenticado.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkTotpConfirmRateLimit(userId: string): Promise<RateLimitDecision> {
    const client = getRedisClient();
    const key = `auth:ratelimit:totp:confirm:user:${userId}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.totpConfirm.user.limit),
        String(RATE_LIMIT_RULES.totpConfirm.user.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "user",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkTotpConfirmRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume el límite de tasa para desactivación de 2FA (AUTH-001 §6.1).
   *
   * Límite: 5 peticiones por ventana de 15 minutos (900 s) por usuario.
   *
   * @param userId - Identificador UUID del usuario autenticado.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkTotpDisableRateLimit(userId: string): Promise<RateLimitDecision> {
    const client = getRedisClient();
    const key = `auth:ratelimit:totp:disable:user:${userId}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.totpDisable.user.limit),
        String(RATE_LIMIT_RULES.totpDisable.user.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "user",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkTotpDisableRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }

  /**
   * Evalúa y consume los intentos de resolución de un challenge 2FA (AUTH-001 §6.1).
   *
   * Límite: 5 intentos por ventana de 5 minutos (300 s) por challenge.
   *
   * @param challengeTokenHash - Hash SHA-256 en hexadecimal del token de challenge.
   * @returns Decisión {@link RateLimitDecision}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async checkTotpChallengeRateLimit(challengeTokenHash: string): Promise<RateLimitDecision> {
    const client = getRedisClient();
    const key = `auth:ratelimit:totp:challenge:${challengeTokenHash}`;

    try {
      const res = (await client.eval(
        LUA_CONSUME,
        1,
        key,
        String(RATE_LIMIT_RULES.totpChallenge.challenge.limit),
        String(RATE_LIMIT_RULES.totpChallenge.challenge.windowSeconds),
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Number(res[1]);
      const ttl = Number(res[2]);

      return {
        allowed,
        remaining,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: allowed ? 0 : Math.max(1, ttl),
        blockedBy: allowed ? undefined : "account",
      };
    } catch (error) {
      if (error instanceof RedisUnavailableError) throw error;
      appLogger.error(
        `[AuthRateLimiter.checkTotpChallengeRateLimit] Error en Redis: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new RedisUnavailableError();
    }
  }
}

/**
 * Instancia singleton canónica del limitador de tasa de autenticación.
 */
export const authRateLimiter = new AuthRateLimiter();
