import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { appLogger } from "../utils/logger";

let clientInstance: ReturnType<typeof postgres> | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Resuelve la cadena de conexión a PostgreSQL estrictamente desde `process.env.DATABASE_URL`.
 *
 * Emite un error estructurado y lanza una excepción si la variable no está definida,
 * previniendo conexiones accidentales con configuraciones por defecto o silenciosas.
 *
 * @returns La URL de conexión a la base de datos PostgreSQL.
 * @throws {Error} Si `DATABASE_URL` no está configurada en las variables de entorno.
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const errorMsg =
      "[Database Config Error] La variable de entorno DATABASE_URL no está definida. La conexión a la base de datos no puede inicializarse.";
    appLogger.error(errorMsg);
    throw new Error(errorMsg);
  }
  return url;
}

/**
 * Obtiene o inicializa la instancia singleton del cliente de conexión PostgreSQL (`postgres-js`).
 *
 * Configura un pool de conexiones con:
 * - `max`: 10 conexiones concurrentes máximas.
 * - `idle_timeout`: 20 segundos de inactividad antes de cerrar conexiones ociosas.
 * - `connect_timeout`: 10 segundos para el handshake inicial.
 *
 * @returns Instancia singleton del cliente de conexión `postgres`.
 */
export function getClient(): ReturnType<typeof postgres> {
  if (!clientInstance) {
    const url = getDatabaseUrl();
    clientInstance = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    appLogger.debug("PostgreSQL client pool initialized");
  }
  return clientInstance;
}

/**
 * Obtiene o inicializa la instancia tipada de Drizzle ORM sobre el cliente PostgreSQL.
 *
 * Habilita la API relacional tipada (`db.query.*`) vinculada al esquema completo del dominio.
 *
 * @returns Instancia singleton de {@link PostgresJsDatabase} con el esquema cargado.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(getClient(), { schema });
  }
  return dbInstance;
}

/**
 * Proxy dinámico para acceder a la instancia `db` de Drizzle con inicialización perezosa (lazy).
 *
 * Mantiene compatibilidad regresiva con módulos que importan `db` directamente, garantizando
 * que la conexión a la base de datos no se cree hasta la primera consulta real.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (instance as any)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});
