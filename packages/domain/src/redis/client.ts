import Redis, { type Redis as RedisType, type RedisOptions } from "ioredis";
import { getValidatedEnv } from "../utils/env";
import { appLogger } from "../utils/logger";

let redisClientInstance: RedisType | null = null;

/**
 * Resuelve la cadena de conexión o parámetros de Redis para el plano de control (DAT-001, AUTH-001).
 *
 * Utiliza `REDIS_URL` o combina las variables por defecto en entornos de desarrollo/pruebas.
 *
 * @returns Cadena de conexión URL de Redis o undefined si no está configurada.
 */
export function getRedisUrl(): string | undefined {
  const env = getValidatedEnv();
  return env.REDIS_URL;
}

/**
 * Obtiene o inicializa la instancia singleton del cliente Redis (`ioredis`) para el plano de control.
 *
 * Aplica políticas estrictas de resiliencia y fallo cerrado (AUTH-001 §7.3, §7.4):
 * - `enableOfflineQueue: false`: Falla de inmediato las operaciones si no hay conexión activa,
 *   evitando encolar comandos en memoria ante caídas del servidor Redis.
 * - `connectTimeout: 2000`: Tiempo máximo de 2 segundos para establecer conexión.
 * - `maxRetriesPerRequest: 1`: No reintenta indefinidamente peticiones fallidas.
 * - `lazyConnect: true`: Permite control explícito de la conexión o conexión por demanda.
 *
 * @returns Instancia singleton de {@link RedisType}.
 */
export function getRedisClient(): RedisType {
  if (!redisClientInstance) {
    const url = getRedisUrl();
    const env = getValidatedEnv();
    const options: RedisOptions = {
      enableOfflineQueue: false,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      password: env.REDIS_PASSWORD,
    };

    if (url) {
      redisClientInstance = new Redis(url, options);
    } else {
      redisClientInstance = new Redis({
        ...options,
        host: "127.0.0.1",
        port: 6379,
      });
    }

    redisClientInstance.on("error", (err) => {
      appLogger.error(
        `[Redis Client Error] Error en la conexión a Redis de control: ${err.message}`,
        err,
      );
    });
  }

  return redisClientInstance;
}

/**
 * Permite inyectar una instancia simulada o personalizada del cliente Redis para pruebas unitarias.
 *
 * @param client - Instancia mock o cliente alternativo de Redis, o `null` para reiniciar.
 */
export function setRedisClientForTesting(client: RedisType | null): void {
  redisClientInstance = client;
}

/**
 * Cierra la conexión activa del cliente Redis y limpia la referencia singleton.
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClientInstance) {
    try {
      await redisClientInstance.quit();
    } catch {
      redisClientInstance.disconnect();
    } finally {
      redisClientInstance = null;
    }
  }
}

/**
 * Verifica si el servidor Redis del plano de control responde activamente al comando PING.
 *
 * @returns `true` si responde PONG en tiempo y forma; `false` ante cualquier error o timeout.
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
