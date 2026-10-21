import { getClient } from "./client";
import { appLogger } from "../utils/logger";

/**
 * Resultado estructurado del diagnóstico de conectividad con la base de datos PostgreSQL.
 */
export interface DatabaseHealthResult {
  /** Indica si la consulta de comprobación (`SELECT 1`) respondió satisfactoriamente. */
  ok: boolean;
  /** Latencia de la consulta de comprobación expresada en milisegundos. */
  latencyMs?: number;
  /** Mensaje de error detallado en caso de fallo de conexión o timeout. */
  error?: string;
}

/**
 * Verifica la conectividad efectiva con el motor PostgreSQL mediante una consulta atómica `SELECT 1`.
 *
 * Mide el tiempo de respuesta y emite un registro de error estructurado si la base de datos no responde.
 * No lanza excepciones, retornando siempre un objeto {@link DatabaseHealthResult} para consumo seguro
 * por orquestadores (Docker, Traefik, Kubernetes) y endpoints de salud como `/api/health`.
 *
 * @returns Promesa que resuelve al estado de salud de la conexión y su latencia en milisegundos.
 *
 * @example
 * ```typescript
 * const health = await checkDatabaseConnection();
 * if (!health.ok) {
 *   console.error("Base de datos inaccesible:", health.error);
 * }
 * ```
 */
export async function checkDatabaseConnection(): Promise<DatabaseHealthResult> {
  const start = performance.now();
  try {
    const client = getClient();
    await client`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const details = err instanceof Error ? err.message : String(err);
    appLogger.error(
      `[Database Healthcheck Failed] Error de conexión efectiva con PostgreSQL: ${details}`,
      err,
      { latencyMs },
    );
    return { ok: false, latencyMs, error: details };
  }
}
