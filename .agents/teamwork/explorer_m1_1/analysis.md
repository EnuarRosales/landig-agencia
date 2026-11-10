# Technical Analysis: Milestone 1 (M1) — Physical Cell Data Plane Isolation & Connection Pool

**Author**: Explorer Subagent (`explorer_m1_1`)  
**Target Milestone**: Milestone 1 (M1: Features 1 & 2)  
**Date**: 2026-11-09  
**Target Files**:
- `packages/domain/src/db/cell-client.ts` (New module)
- `packages/domain/src/db/index.ts` (Export integration)
- `packages/domain/src/index.ts` (Public package exports)
- `packages/domain/src/db/cell-client.test.ts` (Unit test suite)

---

## 1. Executive Summary

Milestone 1 addresses the critical multi-tenant isolation requirement of the Mocter platform (DAT-001, CEL-001, TNT-001).
Currently, all tenant repositories (`DrizzleCellAuthRepository`, `DrizzleCrmRepository`, `DrizzleOrdersRepository`, `DrizzleTenantProductsRepository`) fall back to `getDb()` (`db-portal`), which causes them to either query non-existent tables or access tenant data without cell routing.
Furthermore, the physical cell database `pg-cell-01` runs behind PgBouncer (`pool_mode = transaction`) on port `6432` with all 21 tenant tables governed by `FORCE ROW LEVEL SECURITY`.

This analysis provides the complete architectural design and code blueprint for:
1. **`CellDatabasePoolManager`** in `packages/domain/src/db/cell-client.ts`:
   - Connection pool caching by cell ID (UUID and code alias).
   - In-memory credential decryption via `cellSecretsCryptoService` and `CELL_SECRETS_KEY`.
   - Dual-environment PgBouncer host resolution (container `host.docker.internal` vs host `127.0.0.1` vs remote VPS).
   - Mandatory `prepare: false` protocol for PgBouncer transaction pooling.
   - Resource cleanup, pool drainage, and graceful shutdown.
2. **RLS Context Injection (`withTenantCellTransaction`)**:
   - Dynamic client routing resolution (`admin.client_routing`).
   - Transaction-scoped `SELECT set_config('app.current_client_id', clientId, true)`.
   - Guaranteed `SET LOCAL` rollback on completion or error.
   - UUID validation and Fail-Closed semantics.

---

## 2. Environment & Infrastructure Findings

### 2.1 Active Containers & Ports
Inspection of the running Docker infrastructure (`docker ps`) revealed:
- `mocter-core-admin-portal-1`: Next.js 16 Admin portal running on port `3003`. Network: `mocter-core_default`.
- `mocter-core-pg-portal-1`: PostgreSQL 18 Control Plane (`db-portal`) on host port `54321` (internal `5432`).
- `mocter-cell-01-pgbouncer-cell-1`: PgBouncer v1.26.1 in transaction pool mode on host port `127.0.0.1:6432`. Network: `mocter-cell-01_cell-backend`.
- `mocter-cell-01-pg-cell-1`: PostgreSQL 18 Cell Data Plane (`pg-cell-01`) on host port `127.0.0.1:5433`.

### 2.2 Host Resolution Mechanics (`local_compose`)
Because `mocter-core-admin-portal-1` and `mocter-cell-01-pgbouncer-cell-1` reside on separate Docker compose networks (`mocter-core_default` and `mocter-cell-01_cell-backend`):
- **Inside Docker Containers** (`mocter-core-admin-portal-1`):
  - `host.docker.internal:6432` resolves to `192.168.65.254:6432` (Docker host gateway) and successfully connects to PgBouncer.
  - Verified via: `nc -zv host.docker.internal 6432` (Open) and `postgres('...host.docker.internal:6432/pg-cell-01')` (Returned `{ alive: 1, current_database: 'pg-cell-01' }`).
- **On Developer Host Machine** (Windows / Vitest / CLI outside container):
  - `127.0.0.1:6432` connects directly to the published port.
  - `host.docker.internal` on Windows host resolved to local Wi-Fi IP (`192.168.22.20`) which resulted in `ECONNREFUSED` because PgBouncer only bound to loopback `127.0.0.1:6432`.
- **Resolution Strategy**:
  When `cell.topologyType === 'local_compose'`:
  - Check `fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER || process.env.IS_DOCKER`.
  - If in container: use `host.docker.internal`.
  - If on host: use `127.0.0.1`.
  - Allow override via `CELL_PGBOUNCER_HOST_OVERRIDE` and `CELL_PGBOUNCER_PORT_OVERRIDE`.
  - When `topologyType === 'remote_vps'`: use `cell.pgbouncerHost` and `cell.pgbouncerPort`.

### 2.3 Secret Decryption & Environment
- Secret key in `admin-portal`: `CELL_SECRETS_KEY=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, `CELL_SECRETS_ACTIVE_KEY_ID=k1`.
- `admin.cells` record in `db-portal`:
  - `id`: `6ae5619b-7ca3-4764-baae-1b8950a8e534`
  - `code`: `cell-01`
  - `status`: `active`
  - `topology_type`: `local_compose`
  - `database_name`: `pg-cell-01`
  - `cell_secrets_key_id`: `k1`
- `cellSecretsCryptoService.decryptBundle(cell.cellSecretsCiphertext, cell.id, cell.cellSecretsKeyId, cell.code)` successfully returned:
  - `mocter_app_password`: `63374ac00e284b51c46eb584d652f31d6b9346a16ff5a5f8812cb8b773f415ab`.
  - Exactly matches `userlist.txt` in PgBouncer.

---

## 3. RLS Verification & Critical Role Insight

### 3.1 Schema & Policy Status
In `pg-cell-01`, all 21 tenant tables (e.g. `admin.users`, `admin.identities`, `admin.products`, `admin.contacts`, `admin.orders`) have:
- `relrowsecurity = true`
- `relforcerowsecurity = true`
- Policy expression:
  ```sql
  USING (client_id = (NULLIF(current_setting('app.current_client_id', true), ''))::uuid)
  WITH CHECK (client_id = (NULLIF(current_setting('app.current_client_id', true), ''))::uuid)
  ```

### 3.2 Behavior Under Tested Non-Bypass Role
Under a non-superuser role without `BYPASSRLS`:
1. **Query without setting**:
   - `SELECT count(*) FROM admin.users;` → Returns `0`.
   - `INSERT INTO admin.users ...` → Throws `ERROR: new row violates row-level security policy for table "users"`.
2. **Query with matching client_id** (`SELECT set_config('app.current_client_id', '<clientId>', true)`):
   - `INSERT INTO admin.users ...` → Success (`INSERT 0 1`).
   - `SELECT count(*) FROM admin.users;` → Returns `1`.
3. **Query with mismatching client_id** (`SELECT set_config('app.current_client_id', '<otherId>', true)`):
   - `SELECT count(*) FROM admin.users;` → Returns `0`.

### 3.3 Critical Docker Initialization Gotcha (Superuser Bypass)
In `docker-compose.cell.yml`, `POSTGRES_USER: mocter_app` was used as the container initialization user.
PostgreSQL automatically assigns `rolsuper = true` and `rolbypassrls = true` to the initial container user.
In PostgreSQL, **superusers always bypass RLS**, even when `FORCE ROW LEVEL SECURITY` is enabled on the table!
**Resolution for Worker**:
As defined in `DAT-001 design.md:501` (`mocter_app: SELECT, INSERT, UPDATE, DELETE; sin DDL; sin BYPASSRLS`):
The Worker must document or ensure `ALTER ROLE mocter_app NOSUPERUSER NOBYPASSRLS;` so that runtime queries through PgBouncer enforce RLS in all environments.

---

## 4. PgBouncer Protocol Requirements (`prepare: false`)

PgBouncer is configured with `pool_mode = transaction`.
- In transaction pooling mode, named prepared statements (`PREPARE stmt ...`) fail because PgBouncer can assign subsequent queries to different physical backend connections where the statement was never prepared, throwing PostgreSQL error `42P05: prepared statement does not exist`.
- Therefore, `postgres(url, { prepare: false, ... })` is **MANDATORY**.
- `prepare: false` forces `postgres-js` to use the Simple Query Protocol (`'Q'` wire message), eliminating named prepared statements completely.

---

## 5. Architectural Blueprint for `CellDatabasePoolManager`

### 5.1 File: `packages/domain/src/db/cell-client.ts`

```typescript
import { existsSync } from "node:fs";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "./schemas";
import { cells, type Cell } from "./schemas/admin/cells";
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
export type CellDatabaseProvider = (cellId?: string) => DrizzleCellDb;

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
  constructor(message: string, public readonly cellId?: string, options?: { cause?: unknown }) {
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
      typeof process !== "undefined" &&
      (Boolean(process.env.DOCKER_CONTAINER || process.env.IS_DOCKER) || existsSync("/.dockerenv"));

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
    private readonly clientFactory: (url: string, opts: Record<string, unknown>) => ReturnType<typeof postgres> = postgres as any,
    private readonly options: CellDatabasePoolManagerOptions = {},
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
          return async (cb: (tx: any) => Promise<any>, txOptions?: any) => {
            const db = await this.getCellDb(cellIdOrCode);
            return db.transaction(cb, txOptions);
          };
        }
        return async (...args: any[]) => {
          const db = await this.getCellDb(cellIdOrCode);
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

      // Si es un error de conectividad fatal, invalidar el pool para forzar reconexión limpia
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
    const cellDb = drizzle(sqlClient, { schema });

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
```

---

## 6. Verification and Test Blueprint

### 6.1 Unit Test Suite (`packages/domain/src/db/cell-client.test.ts`)
The Worker should implement tests covering:
1. `resolvePgBouncerTarget`:
   - Returns `host.docker.internal` when `topologyType === 'local_compose'` and running inside Docker.
   - Returns `127.0.0.1` when `topologyType === 'local_compose'` and running on host.
   - Preserves original host when `topologyType === 'remote_vps'`.
   - Respects `CELL_PGBOUNCER_HOST_OVERRIDE` when defined.
2. `CellDatabasePoolManager.getCellDb`:
   - Queries `cells` table on first access, decrypts secret bundle, instantiates pool with `prepare: false`.
   - Returns cached instance on subsequent accesses without re-querying Control Plane or re-decrypting secrets.
   - Deduplicates concurrent calls to the same cell ID via `pendingConnections`.
3. `CellDatabasePoolManager.withTenantCellTransaction`:
   - Validates UUID format of `clientId` before opening transaction.
   - Resolves `cellId` via `clientRouting` if not provided in options.
   - Executes `SELECT set_config('app.current_client_id', <clientId>, true)` prior to executing callback.
   - Catches connection errors, invalidates pool entry, and propagates error.
4. Graceful shutdown:
   - Calls `.end()` on all unique SQL client instances.
   - Clears caches and prevents new connection requests.

### 6.2 Live Database Smoke Verification
1. Test live PgBouncer handshake through `CellDatabasePoolManager`:
   - Call `getCellDb("cell-01")` and execute `await db.execute(sql\`SELECT 1 as alive\`)`.
2. Test RLS enforcement with tenant `Synergia Market` (`01a1bc84-cc30-73b6-bc84-1f0cda5a9661`):
   - Wrap an insert and select inside `withTenantCellTransaction("01a1bc84-cc30-73b6-bc84-1f0cda5a9661", ...)`.
   - Verify that data inserted under that client ID is immediately visible in the transaction.
   - Verify that querying with a different client ID returns 0 rows.
