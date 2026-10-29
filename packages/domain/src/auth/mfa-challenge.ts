import { createHash, randomBytes } from "node:crypto";
import { getRedisClient } from "../redis/client";
import { RedisUnavailableError } from "./rate-limiter";
import { appLogger } from "../utils/logger";

/**
 * Tiempo de vida (TTL) en segundos para el challenge de segundo factor (AUTH-001 §5.5, design §5.2).
 * 5 minutos = 300 segundos.
 */
export const MFA_CHALLENGE_TTL_SECONDS = 300;

/**
 * Límite máximo de intentos fallidos permitidos antes de invalidar el challenge (AUTH-001 §5.5).
 */
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

/**
 * Carga útil almacenada en Redis bajo la clave de challenge 2FA (AUTH-001 design §5.2).
 */
export interface MfaChallengePayload {
  /** Identificador UUID del usuario en proceso de autenticación. */
  readonly userId: string;
  /** Identificador del inquilino propuesto o activo para la sesión. */
  readonly clientId: string | null;
  /** Versión de enrutamiento del inquilino. */
  readonly routingVersion: number | null;
  /** Ubicación de identidad del usuario ("router" o UUID de celda). */
  readonly identityLocation: string;
  /** Cantidad de intentos fallidos registrados. */
  attempts: number;
  /** Marca de tiempo de creación en milisegundos. */
  readonly createdAt: number;
}

/**
 * Parámetros para inicializar un nuevo challenge de autenticación 2FA.
 */
export interface CreateMfaChallengeParams {
  userId: string;
  clientId: string | null;
  routingVersion: number | null;
  identityLocation: string;
}

/**
 * Resultado de la emisión de un challenge 2FA.
 */
export interface CreateMfaChallengeResult {
  /** Token en claro de 32 bytes (64 caracteres hexadecimales) para la cookie `__Host-mocter_challenge`. */
  challengeToken: string;
  /** Fecha y hora UTC de expiración del challenge (5 minutos). */
  expiresAt: Date;
}

/**
 * Script Lua para registrar un intento fallido y autodestruir el challenge si alcanza 5 fallos.
 *
 * Retorna [attempts, exhausted (1 o 0)].
 */
const LUA_RECORD_FAILED_ATTEMPT = `
local key = KEYS[1]
local raw = redis.call('GET', key)
if not raw then
  return { -1, 1 }
end
local data = cjson.decode(raw)
data.attempts = (data.attempts or 0) + 1
if data.attempts >= 5 then
  redis.call('DEL', key)
  return { data.attempts, 1 }
else
  local ttl = redis.call('TTL', key)
  if ttl > 0 then
    redis.call('SET', key, cjson.encode(data), 'EX', ttl)
  else
    redis.call('DEL', key)
    return { data.attempts, 1 }
  end
  return { data.attempts, 0 }
end
`;

/**
 * Script Lua para lectura y consumo atómico (un solo uso) del challenge.
 */
const LUA_CONSUME_CHALLENGE = `
local raw = redis.call('GET', KEYS[1])
if raw then
  redis.call('DEL', KEYS[1])
end
return raw
`;

/**
 * Obtiene el hash SHA-256 en hexadecimal del token de challenge para usarlo como identificador en Redis.
 *
 * El token en claro NUNCA se persiste en Redis; solo su hash SHA-256 (AUTH-001 design §5.2).
 *
 * @param challengeToken - Token de 32 bytes en texto claro.
 * @returns Hash SHA-256 en hexadecimal (64 caracteres).
 */
export function hashChallengeToken(challengeToken: string): string {
  return createHash("sha256").update(challengeToken.trim()).digest("hex");
}

/**
 * Construye la clave canónica de Redis para el challenge: `auth:challenge:<sha256(challenge)>`.
 *
 * @param challengeToken - Token de 32 bytes en texto claro.
 * @returns Clave estructurada en Redis.
 */
export function buildChallengeRedisKey(challengeToken: string): string {
  return `auth:challenge:${hashChallengeToken(challengeToken)}`;
}

/**
 * Gestor de challenges de autenticación de dos factores (TOTP) en Redis (AUTH-001 §5.5, design §5.2).
 */
export class MfaChallengeManager {
  /**
   * Crea y almacena un nuevo challenge 2FA en Redis con TTL de 5 minutos.
   *
   * @param params - Parámetros del usuario y contexto de autenticación.
   * @returns El token seguro generado y la fecha de vencimiento.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async createChallenge(params: CreateMfaChallengeParams): Promise<CreateMfaChallengeResult> {
    const redis = getRedisClient();
    if (!redis) {
      throw new RedisUnavailableError("Redis no está disponible para emitir challenge 2FA.");
    }

    const challengeToken = randomBytes(32).toString("hex");
    const redisKey = buildChallengeRedisKey(challengeToken);
    const now = Date.now();
    const expiresAt = new Date(now + MFA_CHALLENGE_TTL_SECONDS * 1000);

    const payload: MfaChallengePayload = {
      userId: params.userId,
      clientId: params.clientId,
      routingVersion: params.routingVersion,
      identityLocation: params.identityLocation,
      attempts: 0,
      createdAt: now,
    };

    try {
      await redis.set(redisKey, JSON.stringify(payload), "EX", MFA_CHALLENGE_TTL_SECONDS);
      return { challengeToken, expiresAt };
    } catch (err: unknown) {
      if (err instanceof RedisUnavailableError) throw err;
      appLogger.error(
        `[MfaChallengeManager.createChallenge] Error al persistir challenge: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      throw new RedisUnavailableError("Fallo de comunicación con Redis al crear challenge 2FA.", err);
    }
  }

  /**
   * Consulta el challenge en Redis sin consumirlo.
   *
   * @param challengeToken - Token seguro en claro.
   * @returns La carga útil o `null` si venció o no existe.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async getChallenge(challengeToken: string): Promise<MfaChallengePayload | null> {
    if (!challengeToken || typeof challengeToken !== "string" || challengeToken.trim().length === 0) {
      return null;
    }

    const redis = getRedisClient();
    if (!redis) {
      throw new RedisUnavailableError("Redis no está disponible para consultar challenge 2FA.");
    }

    const redisKey = buildChallengeRedisKey(challengeToken);

    try {
      const raw = await redis.get(redisKey);
      if (!raw) return null;
      return JSON.parse(raw) as MfaChallengePayload;
    } catch (err: unknown) {
      if (err instanceof RedisUnavailableError) throw err;
      appLogger.error(
        `[MfaChallengeManager.getChallenge] Error al leer challenge: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      throw new RedisUnavailableError("Fallo de comunicación con Redis al consultar challenge 2FA.", err);
    }
  }

  /**
   * Registra un intento fallido de resolución de TOTP.
   * Si se alcanzan 5 intentos fallidos, el challenge se destruye atómicamente de inmediato.
   *
   * @param challengeToken - Token seguro en claro.
   * @returns Objeto con cantidad de intentos y si fue agotado/destruido.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async recordFailedAttempt(challengeToken: string): Promise<{ attempts: number; exhausted: boolean }> {
    if (!challengeToken || typeof challengeToken !== "string" || challengeToken.trim().length === 0) {
      return { attempts: -1, exhausted: true };
    }

    const redis = getRedisClient();
    if (!redis) {
      throw new RedisUnavailableError("Redis no está disponible para registrar fallo de challenge 2FA.");
    }

    const redisKey = buildChallengeRedisKey(challengeToken);

    try {
      const res = (await redis.eval(LUA_RECORD_FAILED_ATTEMPT, 1, redisKey)) as [number, number];
      const attempts = Number(res[0]);
      const exhausted = Number(res[1]) === 1;

      return { attempts, exhausted };
    } catch (err: unknown) {
      if (err instanceof RedisUnavailableError) throw err;
      appLogger.error(
        `[MfaChallengeManager.recordFailedAttempt] Error al registrar intento: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      throw new RedisUnavailableError("Fallo de comunicación con Redis al registrar intento de challenge 2FA.", err);
    }
  }

  /**
   * Consume atómicamente el challenge (un solo uso, anti-replay) ante verificación exitosa.
   *
   * @param challengeToken - Token seguro en claro.
   * @returns La carga útil del challenge o `null` si no existía o ya fue consumido.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async consumeChallenge(challengeToken: string): Promise<MfaChallengePayload | null> {
    if (!challengeToken || typeof challengeToken !== "string" || challengeToken.trim().length === 0) {
      return null;
    }

    const redis = getRedisClient();
    if (!redis) {
      throw new RedisUnavailableError("Redis no está disponible para consumir challenge 2FA.");
    }

    const redisKey = buildChallengeRedisKey(challengeToken);

    try {
      const raw = (await redis.eval(LUA_CONSUME_CHALLENGE, 1, redisKey)) as string | null;
      if (!raw) return null;
      return JSON.parse(raw) as MfaChallengePayload;
    } catch (err: unknown) {
      if (err instanceof RedisUnavailableError) throw err;
      appLogger.error(
        `[MfaChallengeManager.consumeChallenge] Error al consumir challenge: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      throw new RedisUnavailableError("Fallo de comunicación con Redis al consumir challenge 2FA.", err);
    }
  }

  /**
   * Elimina un challenge de Redis de forma explícita (e.g. logout).
   *
   * @param challengeToken - Token seguro en claro.
   */
  async deleteChallenge(challengeToken: string): Promise<void> {
    if (!challengeToken || typeof challengeToken !== "string" || challengeToken.trim().length === 0) {
      return;
    }

    const redis = getRedisClient();
    if (!redis) return;

    try {
      const redisKey = buildChallengeRedisKey(challengeToken);
      await redis.del(redisKey);
    } catch (err: unknown) {
      appLogger.warn(
        `[MfaChallengeManager.deleteChallenge] Error no fatal al eliminar challenge: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Instancia singleton de {@link MfaChallengeManager}. */
export const mfaChallengeManager = new MfaChallengeManager();
