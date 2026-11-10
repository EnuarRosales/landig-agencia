import { existsSync } from "node:fs";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "./schemas";
import { cells } from "./schemas/admin/cells";
import { clientRouting } from "./schemas/admin/client-routing";
import { getDb } from "./client";
import {
  cellSecretsCryptoService,
  type CellSecretsCryptoService,
} from "../services/cell-secrets.service";
import { appLogger } from "../utils/logger";

/**
 * Instancia tipada de base de datos Drizzle ORM conectada al esquema celular.
 */
export type DrizzleCellDb = PostgresJsDatabase<typeof schema>;

/**
 * Proveedor funcional de base de datos celular para compatibilidad con repositorios.
 */
export type CellDatabaseProvider = (
  cellId?: string,
) => DrizzleCellDb | Promise<DrizzleCellDb>;

/**
 * Entrada en memoria del pool de conexiones para una celda de datos.
 */
export interface CellPoolEntry {
  sql: ReturnType<typeof postgres>;
  db: DrizzleCellDb;
  cellId: string;
  code: string;
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Opciones de configuración para el administrador de pools celulares.
 */
export interface CellDatabasePoolManagerOptions {
  maxConnectionsPerCell?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  routeCacheTtlMs?: number;
}

/**
 * Error lanzado cuando una celda no existe o no está en estado operativo.
 */
export class CellPoolError extends Error {
  constructor(
    message: string,
    public readonly cellId?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CellPoolError";
  }
}

/**
 * Resuelve el host y puerto de conexión hacia el PgBouncer de una celda.
 *
 * Maneja la diferencia entre el entorno contenedor (host.docker.internal)
 * y el entorno anfitrión local (127.0.0.1) para topologías local_compose.
 */
export function resolvePgBouncerTarget(cell: {
  topologyType: string;
  pgbouncerHost: string;
  pgbouncerPort: number;
}): { host: string; port: number } {
  if (process.env.CELL_PGBOUNCER_HOST_OVERRIDE) {
    return {
      host: process.env.CELL_PGBOUNCER_HOST_OVERRIDE,
      port: Number(process.env.CELL_PGBOUNCER_PORT_OVERRIDE) || cell.pgbouncerPort || 6432,
    };
  }

  let host = cell.pgbouncerHost;
  const port = cell.pgbouncerPort || 6432;

  if (cell.topologyType === "local_compose") {
    const isDocker =
      process.env.IS_DOCKER === "false" || process.env.DOCKER_CONTAINER === "false"
        ? false
        : Boolean(process.env.DOCKER_CONTAINER || process.env.IS_DOCKER) || existsSync("/.dockerenv");

    if (isDocker) {
      const lower = host.trim().toLowerCase();
      if (
        lower === "localhost" ||
        lower === "127.0.0.1" ||
        lower.startsWith("pgbouncer-cell") ||
        lower.startsWith("pg-cell")
      ) {
        host = "host.docker.internal";
      }
    } else {
      const lower = host.trim().toLowerCase();
      if (
        lower.startsWith("pgbouncer-cell") ||
        lower.startsWith("pg-cell") ||
        lower === "host.docker.internal"
      ) {
        host = "127.0.0.1";
      }
    }
  }

  return { host, port };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administrador dinámico de pools de conexión hacia celdas de datos (Cell Data Plane).
 *
 * Responsabilidades:
 * 1. Cacheo y reutilización de clientes `postgres-js` por celda.
 * 2. Descifrado en memoria de credenciales `mocter_app` vía AES-256-GCM.
 * 3. Aplicación estricta de `prepare: false` para compatibilidad con PgBouncer en transaction mode.
 * 4. Inyección segura de contexto RLS (`SELECT set_config('app.current_client_id', ..., true)`).
 * 5. Drenado y apagado ordenado de conexiones.
 */
export class CellDatabasePoolManager {
  private readonly pools = new Map<string, CellPoolEntry>();
  private readonly pendingConnections = new Map<string, Promise<DrizzleCellDb>>();
  private readonly routeCache = new Map<string, { cellId: string; expiresAt: number }>();
  private isShuttingDown = false;

  constructor(
    private readonly controlPlaneDbProvider: () => PostgresJsDatabase<typeof schema> = () => getDb(),
    private readonly cryptoService: CellSecretsCryptoService = cellSecretsCryptoService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly clientFactory: (url: string, opts: Record<string, unknown>) => ReturnType<typeof postgres> = postgres as any,
    private readonly options: CellDatabasePoolManagerOptions = {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly drizzleFactory: (client: any, opts: any) => DrizzleCellDb = drizzle,
  ) {}

  /**
   * Obtiene o inicializa la conexión Drizzle hacia la celda solicitada.
   *
   * @param cellIdOrCode - UUID o código identificador de la celda (ej. 'cell-01').
   */
  async getCellDb(cellIdOrCode: string): Promise<DrizzleCellDb> {
    if (this.isShuttingDown) {
      throw new CellPoolError("El administrador de pools celulares se encuentra en proceso de apagado.");
    }

    const cached = this.pools.get(cellIdOrCode);
    if (cached) {
      cached.lastUsedAt = new Date();
      return cached.db;
    }

    const inFlight = this.pendingConnections.get(cellIdOrCode);
    if (inFlight) {
      return inFlight;
    }

    const initPromise = this.initializeCellPool(cellIdOrCode);
    this.pendingConnections.set(cellIdOrCode, initPromise);

    try {
      return await initPromise;
    } finally {
      this.pendingConnections.delete(cellIdOrCode);
    }
  }

  /**
   * Proveedor síncrono lazy mediante Proxy para repositorios que requieren `CellDatabaseProvider`.
   */
  getCellDbSync(cellIdOrCode: string): DrizzleCellDb {
    return new Proxy({} as DrizzleCellDb, {
      get: (_target, prop) => {
        if (prop === "transaction") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return async (cb: (tx: any) => Promise<any>, txOptions?: any) => {
            const db = await this.getCellDb(cellIdOrCode);
            return db.transaction(cb, txOptions);
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (...args: any[]) => {
          const db = await this.getCellDb(cellIdOrCode);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (db as any)[prop];
          if (typeof fn === "function") {
            return fn.apply(db, args);
          }
          return fn;
        };
      },
    });
  }

  /**
   * Resuelve el `cellId` correspondiente a un inquilino a través del Control Plane.
   */
  async resolveCellIdForClient(clientId: string): Promise<string> {
    if (!UUID_REGEX.test(clientId)) {
      throw new CellPoolError(`clientId inválido: debe tener formato UUID (${clientId}).`);
    }

    const now = Date.now();
    const cachedRoute = this.routeCache.get(clientId);
    if (cachedRoute && cachedRoute.expiresAt > now) {
      return cachedRoute.cellId;
    }

    const db = this.controlPlaneDbProvider();
    const [route] = await db
      .select({ cellId: clientRouting.cellId, status: clientRouting.routingStatus })
      .from(clientRouting)
      .where(eq(clientRouting.clientId, clientId))
      .limit(1);

    if (!route || !route.cellId) {
      throw new CellPoolError(`No se encontró ruta celular activa para el inquilino: "${clientId}".`);
    }

    const ttl = this.options.routeCacheTtlMs ?? 60_000;
    this.routeCache.set(clientId, { cellId: route.cellId, expiresAt: now + ttl });

    return route.cellId;
  }

  /**
   * Ejecuta una función dentro de una transacción en la celda del inquilino,
   * fijando app.current_client_id con ámbito local a la transacción (SET LOCAL).
   */
  async withTenantCellTransaction<T>(
    clientId: string,
    callback: (tx: DrizzleCellDb) => Promise<T>,
    options?: { cellId?: string },
  ): Promise<T> {
    if (!UUID_REGEX.test(clientId)) {
      throw new CellPoolError(`clientId inválido para transacción de celda: "${clientId}".`);
    }

    const cellId = options?.cellId ?? (await this.resolveCellIdForClient(clientId));
    const cellDb = await this.getCellDb(cellId);

    try {
      return await cellDb.transaction(async (tx) => {
        // Fijar el contexto RLS con ámbito transaccional estricto (is_local = true)
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`
        );

        return await callback(tx as unknown as DrizzleCellDb);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[withTenantCellTransaction] Error en transacción celular: ${msg}`, error, {
        clientId,
        cellId,
      });

      if (this.isConnectivityError(error)) {
        await this.closeCellPool(cellId).catch(() => {});
      }

      throw error;
    }
  }

  /**
   * Cierra y retira el pool de una celda específica.
   */
  async closeCellPool(cellIdOrCode: string): Promise<void> {
    const entry = this.pools.get(cellIdOrCode);
    if (!entry) return;

    this.pools.delete(entry.cellId);
    this.pools.delete(entry.code);

    try {
      await entry.sql.end({ timeout: 5 });
      appLogger.debug(`[CellDatabasePoolManager] Pool de celda ${entry.code} cerrado exitosamente.`);
    } catch (err) {
      appLogger.error(`[CellDatabasePoolManager] Error cerrando pool de celda ${entry.code}`, err);
    }
  }

  /**
   * Cierra ordenadamente todos los pools de conexión activos (graceful shutdown).
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const uniqueEntries = new Set<CellPoolEntry>(this.pools.values());
    this.pools.clear();
    this.routeCache.clear();
    this.pendingConnections.clear();

    const closePromises = Array.from(uniqueEntries).map(async (entry) => {
      try {
        await entry.sql.end({ timeout: 5 });
      } catch (err) {
        appLogger.error(`[CellDatabasePoolManager.shutdown] Error drenando pool ${entry.code}`, err);
      }
    });

    await Promise.allSettled(closePromises);
    appLogger.info("[CellDatabasePoolManager] Todos los pools celulares han sido drenados y cerrados.");
  }

  /**
   * Inicializa la conexión hacia una celda consultando el catálogo en el Control Plane.
   */
  private async initializeCellPool(cellIdOrCode: string): Promise<DrizzleCellDb> {
    const db = this.controlPlaneDbProvider();
    const isUuid = UUID_REGEX.test(cellIdOrCode);

    const [cell] = await db
      .select()
      .from(cells)
      .where(isUuid ? eq(cells.id, cellIdOrCode) : eq(cells.code, cellIdOrCode))
      .limit(1);

    if (!cell) {
      throw new CellPoolError(`Celda de datos no encontrada para "${cellIdOrCode}".`);
    }

    if (cell.status === "error_connection") {
      throw new CellPoolError(`La celda ${cell.code} (${cell.id}) se encuentra en estado "${cell.status}".`);
    }

    // 1. Descifrar el paquete de secretos celulares
    let appPassword = "";
    try {
      const bundle = this.cryptoService.decryptBundle(
        cell.cellSecretsCiphertext,
        cell.id,
        cell.cellSecretsKeyId,
        cell.code,
      );
      appPassword = bundle.mocter_app_password;
    } catch (err) {
      throw new CellPoolError(
        `Fallo al descifrar los secretos de la celda ${cell.code}: ${err instanceof Error ? err.message : String(err)}`,
        cell.id,
        { cause: err },
      );
    }

    // 2. Resolver host y puerto según topología
    const { host, port } = resolvePgBouncerTarget({
      topologyType: cell.topologyType,
      pgbouncerHost: cell.pgbouncerHost,
      pgbouncerPort: cell.pgbouncerPort,
    });

    const user = "mocter_app";
    const database = cell.databaseName || "pg-cell-01";
    const connectionUrl = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(appPassword)}@${host}:${port}/${database}`;

    // 3. Crear cliente con prepare: false obligatorio para PgBouncer
    const sqlClient = this.clientFactory(connectionUrl, {
      prepare: false,
      max: this.options.maxConnectionsPerCell ?? 10,
      idle_timeout: this.options.idleTimeoutSeconds ?? 20,
      connect_timeout: this.options.connectTimeoutSeconds ?? 10,
      onnotice: () => {},
    });

    // 4. Instanciar Drizzle
    const cellDb = this.drizzleFactory(sqlClient, { schema });

    const entry: CellPoolEntry = {
      sql: sqlClient,
      db: cellDb,
      cellId: cell.id,
      code: cell.code,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    // Cachear por UUID y por código
    this.pools.set(cell.id, entry);
    this.pools.set(cell.code, entry);

    appLogger.info(`[CellDatabasePoolManager] Pool inicializado para celda ${cell.code} (${cell.id}) en ${host}:${port}`);
    return cellDb;
  }

  private isConnectivityError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const msg = "message" in error ? String((error as any).message) : "";
    const code = "code" in error ? String((error as any).code) : "";
    return (
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      msg.includes("connection closed") ||
      msg.includes("connection terminated")
    );
  }
}

/**
 * Instancia singleton global del gestor de pools celulares.
 */
export const cellDatabasePoolManager = new CellDatabasePoolManager();

/**
 * Función utilitaria global para obtener el cliente Drizzle de una celda.
 */
export async function getCellDb(cellId: string): Promise<DrizzleCellDb> {
  return cellDatabasePoolManager.getCellDb(cellId);
}

/**
 * Función utilitaria global para ejecutar transacciones aisladas por inquilino bajo RLS.
 */
export async function withTenantCellTransaction<T>(
  clientId: string,
  callback: (tx: DrizzleCellDb) => Promise<T>,
  options?: { cellId?: string },
): Promise<T> {
  return cellDatabasePoolManager.withTenantCellTransaction(clientId, callback, options);
}

/**
 * Obtiene un proveedor síncrono de base de datos celular para inyección de dependencias.
 */
export function getCellDatabaseProvider(): CellDatabaseProvider {
  return (cellId?: string) => cellDatabasePoolManager.getCellDbSync(cellId ?? "cell-01");
}
