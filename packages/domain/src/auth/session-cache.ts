import { getRedisClient } from "../redis/client";
import { appLogger } from "../utils/logger";
import { RedisUnavailableError } from "./rate-limiter";
import type { Session } from "../db/schemas/admin/sessions";

/**
 * Representación serializada y ligera de la sesión almacenada en la caché de Redis (AUTH-001 §5.6).
 */
export interface CachedSessionData {
  id: string;
  userId: string;
  clientId: string | null;
  routingVersion: number | null;
  csrfHashHex: string;
  authMethod: string;
  mfaAt: string | null;
  reauthAt: string | null;
  lastSeenAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

/**
 * Construye la clave estructurada de sesión para Redis a partir del hash SHA-256 del `sid`.
 *
 * @param sidHashHex - Hash SHA-256 en formato hexadecimal de 64 caracteres.
 * @returns Clave estructurada en Redis (`auth:session:<hash>`).
 */
export function buildSessionRedisKey(sidHashHex: string): string {
  return `auth:session:${sidHashHex}`;
}

/**
 * Construye la clave de conjunto (Set) de sesiones activas asociadas a un usuario en Redis.
 *
 * @param userId - Identificador UUID del usuario.
 * @returns Clave estructurada en Redis (`auth:user:sessions:<userId>`).
 */
export function buildUserSessionsRedisKey(userId: string): string {
  return `auth:user:sessions:${userId}`;
}

/**
 * Gestor de caché de sesiones en Redis del plano de control (AUTH-001 design §5.6, T-21).
 *
 * Aplica:
 * - Caché de consulta rápida: `auth:session:<sha256(sid)>` con TTL alineado al vencimiento de inactividad (30 min).
 * - Agrupación por usuario: `auth:user:sessions:<userId>` para revocación masiva inmediata en todas las réplicas.
 * - Desacoplamiento resiliente: si Redis no responde, el servicio continúa contra Postgres (la autoridad definitiva).
 */
export class SessionCacheManager {
  /**
   * Almacena o actualiza la sesión en la caché de Redis.
   *
   * @param session - Entidad de sesión {@link Session}.
   * @param sidHashHex - Hash SHA-256 del `sid` en formato hexadecimal.
   */
  async cacheSession(session: Session, sidHashHex: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      const now = Date.now();
      const expiresAtMs = new Date(session.expiresAt).getTime();
      const ttlSeconds = Math.max(1, Math.floor((expiresAtMs - now) / 1000));

      const payload: CachedSessionData = {
        id: session.id,
        userId: session.userId,
        clientId: session.clientId,
        routingVersion: session.routingVersion,
        csrfHashHex: Buffer.isBuffer(session.csrfHash)
          ? session.csrfHash.toString("hex")
          : String(session.csrfHash),
        authMethod: session.authMethod,
        mfaAt: session.mfaAt ? new Date(session.mfaAt).toISOString() : null,
        reauthAt: session.reauthAt ? new Date(session.reauthAt).toISOString() : null,
        lastSeenAt: new Date(session.lastSeenAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        absoluteExpiresAt: new Date(session.absoluteExpiresAt).toISOString(),
      };

      const sessionKey = buildSessionRedisKey(sidHashHex);
      const userKey = buildUserSessionsRedisKey(session.userId);

      await redis.set(sessionKey, JSON.stringify(payload), "EX", ttlSeconds);
      await redis.sadd(userKey, sidHashHex);
      await redis.expire(userKey, 43200); // 12 horas máx absoluto
    } catch (err: unknown) {
      appLogger.warn(
        `[SessionCacheManager.cacheSession] Error al cachear sesión en Redis (continuando sin caché): ${err instanceof Error ? err.message : String(err)}`,
        { sessionId: session.id, userId: session.userId },
      );
    }
  }

  /**
   * Obtiene la sesión serializada desde la caché de Redis.
   *
   * @param sidHashHex - Hash SHA-256 del `sid` en hexadecimal.
   * @returns Datos de la sesión o `null` si no se encuentra en caché o expiró.
   */
  async getCachedSession(sidHashHex: string): Promise<CachedSessionData | null> {
    try {
      const redis = getRedisClient();
      if (!redis) return null;

      const sessionKey = buildSessionRedisKey(sidHashHex);
      const raw = await redis.get(sessionKey);
      if (!raw) return null;

      const data = JSON.parse(raw) as CachedSessionData;
      const now = Date.now();

      // Validación interna de expiración
      if (
        new Date(data.expiresAt).getTime() <= now ||
        new Date(data.absoluteExpiresAt).getTime() <= now
      ) {
        await redis.del(sessionKey);
        return null;
      }

      return data;
    } catch (err: unknown) {
      appLogger.warn(
        `[SessionCacheManager.getCachedSession] Error al leer caché en Redis (fallback a Postgres): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Actualiza el registro de actividad (`last_seen_at`) y la extensión de inactividad (`expires_at`) en caché.
   *
   * @param sidHashHex - Hash SHA-256 del `sid`.
   * @param lastSeenAt - Nueva marca de tiempo de actividad.
   * @param newExpiresAt - Nueva fecha límite por inactividad.
   */
  async touchSession(
    sidHashHex: string,
    lastSeenAt: Date,
    newExpiresAt: Date,
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      const sessionKey = buildSessionRedisKey(sidHashHex);
      const raw = await redis.get(sessionKey);
      if (!raw) return;

      const data = JSON.parse(raw) as CachedSessionData;
      data.lastSeenAt = lastSeenAt.toISOString();
      data.expiresAt = newExpiresAt.toISOString();

      const now = Date.now();
      const ttlSeconds = Math.max(1, Math.floor((newExpiresAt.getTime() - now) / 1000));

      await redis.set(sessionKey, JSON.stringify(data), "EX", ttlSeconds);
    } catch (err: unknown) {
      appLogger.warn(
        `[SessionCacheManager.touchSession] Error al actualizar actividad en Redis: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Elimina una sesión específica de la caché de Redis (revocación inmediata, AUTH-001 §5.6).
   *
   * @param sidHashHex - Hash SHA-256 del `sid`.
   * @param userId - Identificador UUID del usuario para limpiar el conjunto.
   */
  async deleteSession(sidHashHex: string, userId?: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      const sessionKey = buildSessionRedisKey(sidHashHex);
      await redis.del(sessionKey);

      if (userId) {
        const userKey = buildUserSessionsRedisKey(userId);
        await redis.srem(userKey, sidHashHex);
      }
    } catch (err: unknown) {
      appLogger.warn(
        `[SessionCacheManager.deleteSession] Error al invalidar sesión en Redis: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Invalida de forma masiva e inmediata las sesiones en caché de un usuario en Redis (AUTH-001 §5.6).
   *
   * @param userId - Identificador UUID del usuario.
   * @param exceptSidHashHex - Hash hexadecimal opcional de la sesión que no debe ser revocada.
   */
  async deleteAllUserSessions(
    userId: string,
    exceptSidHashHex?: string,
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      const userKey = buildUserSessionsRedisKey(userId);
      const sidHashes = await redis.smembers(userKey);

      if (sidHashes && sidHashes.length > 0) {
        const hashesToDelete = exceptSidHashHex
          ? sidHashes.filter((h) => h !== exceptSidHashHex)
          : sidHashes;

        if (hashesToDelete.length > 0) {
          const sessionKeys = hashesToDelete.map(buildSessionRedisKey);
          await redis.del(...sessionKeys);
          await redis.srem(userKey, ...hashesToDelete);
        }
      }

      if (!exceptSidHashHex) {
        await redis.del(userKey);
      }
    } catch (err: unknown) {
      appLogger.warn(
        `[SessionCacheManager.deleteAllUserSessions] Error al invalidar sesiones de usuario en Redis: ${err instanceof Error ? err.message : String(err)}`,
        { userId, exceptSidHashHex },
      );
    }
  }
}

/** Instancia singleton canónica de {@link SessionCacheManager}. */
export const sessionCacheManager = new SessionCacheManager();
