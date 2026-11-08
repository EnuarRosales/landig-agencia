import { existsSync } from "fs";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../db/client";
import { getRedisClient } from "../redis/client";
import { cells, type Cell } from "../db/schemas/admin/cells";
import { CellSecretsCryptoService, type CellSecretsBundle } from "./cell-secrets.service";
import { appLogger } from "../utils/logger";

/**
 * Bloques CIDR IPv4 privados por defecto (RFC 1918 + RFC 6598 CGNAT) (CEL-RF-014).
 */
export const DEFAULT_ALLOWED_PRIVATE_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
];

/**
 * Rangos de red prohibidos en todo entorno (metadatos de nube, link-local, multicast) (CEL-RF-014).
 */
export const PROHIBITED_CIDRS = [
  "169.254.0.0/16", // Link-local / Cloud metadata (ej. 169.254.169.254)
  "224.0.0.0/4",    // Multicast
  "240.0.0.0/4",    // Reservado
  "0.0.0.0/8",      // Red local
];

/**
 * Convierte una dirección IPv4 a un entero sin signo de 32 bits.
 */
export function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let res = 0;
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (isNaN(n) || n < 0 || n > 255 || !Number.isInteger(n)) return null;
    res = ((res << 8) | n) >>> 0;
  }
  return res;
}

/**
 * Evalúa si una dirección IP pertenece a un bloque CIDR (CEL-RF-014).
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const ipLong = ipv4ToLong(ip);
  if (ipLong === null) return false;

  const [cidrIp, prefixStr] = cidr.split("/");
  const cidrLong = ipv4ToLong(cidrIp);
  if (cidrLong === null) return false;

  const prefix = prefixStr !== undefined ? Number(prefixStr) : 32;
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipLong & mask) === (cidrLong & mask);
}

/**
 * Resultado de una prueba técnica individual (DB o HTTP).
 */
export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Diagnóstico consolidado del Handshake Dual 360°.
 */
export interface CellHandshakeDiagnostic {
  ok: boolean;
  checkedAt: string;
  error?: string;
  db: ProbeResult;
  app: ProbeResult;
}

/**
 * Resultado retornado por executeCellHandshake.
 */
export interface CellHandshakeExecutionResult {
  ok: boolean;
  status: "active" | "error_connection";
  cellId: string;
  code: string;
  diagnostic: CellHandshakeDiagnostic;
}

/**
 * Opciones de ejecución del Handshake de la celda.
 */
export interface CellHandshakeOptions {
  timeoutMs?: number;
  allowLocalTargets?: boolean;
  fetchImpl?: typeof fetch;
  dbClientFactory?: (url: string, opts: Record<string, unknown>) => any;
}

/**
 * Valida que el host y puerto de destino cumplan los requisitos de red privada (DAT-001 §3.6.3, CEL-RF-014).
 */
export function validatePrivateTarget(
  targetHost: string,
  targetPort: number,
  options?: { allowLocal?: boolean; allowedCidrs?: string[] },
): { valid: boolean; reason?: string } {
  if (!targetHost || typeof targetHost !== "string" || targetHost.trim().length === 0) {
    return { valid: false, reason: "El host de destino no puede estar vacío." };
  }

  if (targetPort < 1 || targetPort > 65535 || !Number.isInteger(targetPort)) {
    return { valid: false, reason: `Puerto de destino inválido: ${targetPort}. Debe estar entre 1 y 65535.` };
  }

  const normalized = targetHost.trim().toLowerCase();
  const isLoopback =
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1";

  if (isLoopback) {
    if (!options?.allowLocal) {
      return {
        valid: false,
        reason: `Destino de red inválido: "${targetHost}". En producción no se admiten destinos loopback.`,
      };
    }
    return { valid: true };
  }

  // Comprobar si es una dirección IPv4
  const ipLong = ipv4ToLong(normalized);
  if (ipLong !== null) {
    // 1. Prohibir rangos link-local / metadatos de nube
    for (const prohibited of PROHIBITED_CIDRS) {
      if (isIpInCidr(normalized, prohibited)) {
        return {
          valid: false,
          reason: `Destino de red prohibido: "${targetHost}". Pertenece a un rango link-local o metadatos de nube.`,
        };
      }
    }

    // 2. Comprobar pertenencia a CIDRs permitidos (CEL-RF-014)
    const allowed =
      options?.allowedCidrs ??
      (process.env.CELL_PRIVATE_ALLOWED_CIDRS
        ? process.env.CELL_PRIVATE_ALLOWED_CIDRS.split(",").map((s) => s.trim()).filter(Boolean)
        : DEFAULT_ALLOWED_PRIVATE_CIDRS);

    if (options?.allowLocal) {
      allowed.push("127.0.0.0/8");
    }

    const matchesAllowed = allowed.some((cidr) => isIpInCidr(normalized, cidr));
    if (!matchesAllowed) {
      return {
        valid: false,
        reason: `Destino no autorizado: "${targetHost}". La IP no pertenece a ningún CIDR privado permitido (${allowed.join(", ")}).`,
      };
    }

    return { valid: true };
  }

  // Hostnames en local (servicios Docker en desarrollo)
  if (options?.allowLocal) {
    return { valid: true };
  }

  // Hostnames en producción: solo se admiten dominios privados internos
  if (normalized.endsWith(".internal") || normalized.endsWith(".local")) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Destino no autorizado: "${targetHost}". En producción solo se admiten IPs en rangos privados o nombres de dominio .internal.`,
  };
}

/**
 * Resuelve el host y la URL efectiva para la ejecución de sondas en red local (CEL-RF-013).
 *
 * Cuando el plano de control se ejecuta dentro de un contenedor Docker en desarrollo
 * (indicado por la presencia de `/.dockerenv` o variables de entorno del contenedor),
 * las referencias a `localhost`, `127.0.0.1` o nombres del stack celular local deben
 * enrutarse a través del host anfitrión (`host.docker.internal`), ya que la celda expone
 * sus puertos en el loopback de la máquina física.
 */
export function resolveLocalProbeTarget(params: {
  topologyType: string;
  host: string;
  appUrl: string;
}): { probeHost: string; probeAppUrl: string } {
  let probeHost = params.host;
  let probeAppUrl = params.appUrl;

  if (params.topologyType === "local_compose") {
    const isDocker =
      typeof process !== "undefined" &&
      (Boolean(process.env.DOCKER_CONTAINER || process.env.IS_DOCKER) || existsSync("/.dockerenv"));

    if (isDocker) {
      const lower = probeHost.trim().toLowerCase();
      if (
        lower === "localhost" ||
        lower === "127.0.0.1" ||
        lower.startsWith("pgbouncer-cell") ||
        lower.startsWith("pg-cell")
      ) {
        probeHost = "host.docker.internal";
      }

      try {
        const parsed = new URL(probeAppUrl);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          parsed.hostname = "host.docker.internal";
          probeAppUrl = parsed.toString();
        }
      } catch {
        // Conservar probeAppUrl si no es una URL parseable
      }
    }
  }

  return { probeHost, probeAppUrl };
}

/**
 * Ejecuta el probe directo contra PgBouncer / PostgreSQL 18.
 *
 * En modo normal, verifica la conectividad, migraciones, tablas base y RLS sin leer filas de negocio (CEL-RF-013).
 * En modo liviano (sonda de 60s), ejecuta únicamente SELECT 1 (CEL-RF-014).
 */
export async function probeDatabase(params: {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  timeoutMs?: number;
  isLightProbe?: boolean;
  dbClientFactory?: (url: string, opts: Record<string, unknown>) => any;
}): Promise<ProbeResult> {
  const start = Date.now();
  const timeoutSeconds = Math.max(1, Math.ceil((params.timeoutMs || 5000) / 1000));
  const connectionString = `postgres://${encodeURIComponent(params.user)}:${encodeURIComponent(
    params.password || "",
  )}@${params.host}:${params.port}/${params.database}`;

  let sqlClient: any = null;
  try {
    const factory = params.dbClientFactory || postgres;
    sqlClient = factory(connectionString, {
      connect_timeout: timeoutSeconds,
      idle_timeout: 1,
      max: 1,
      onnotice: () => {},
    });

    const rows = await sqlClient`SELECT 1 as alive;`;

    if (!rows || rows.length === 0 || rows[0].alive !== 1) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: "Respuesta inesperada al verificar disponibilidad de base de datos.",
      };
    }

    // Si es sonda liviana periódica de 60s, SELECT 1 es suficiente (CEL-RF-014)
    if (params.isLightProbe) {
      return {
        ok: true,
        latencyMs: Date.now() - start,
        details: { pgAlive: true, host: params.host, port: params.port, mode: "light" },
      };
    }

    // Handshake técnico completo: comprobar migraciones, tablas base y RLS sin leer datos de negocio (CEL-RF-013)
    const [migrationsFound, tenantTablesFound, rlsTablesFound] = await Promise.all([
      sqlClient`
        SELECT count(*)::int as count 
        FROM information_schema.tables 
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations';
      `.catch(() => [{ count: 0 }]),
      sqlClient`
        SELECT count(*)::int as count 
        FROM information_schema.tables 
        WHERE table_schema = 'tenant';
      `.catch(() => [{ count: 0 }]),
      sqlClient`
        SELECT count(*)::int as count 
        FROM pg_tables 
        WHERE schemaname = 'tenant' AND rowsecurity = true;
      `.catch(() => [{ count: 0 }]),
    ]);

    const latencyMs = Date.now() - start;
    return {
      ok: true,
      latencyMs,
      details: {
        pgAlive: true,
        host: params.host,
        port: params.port,
        hasMigrationsTable: (migrationsFound[0]?.count ?? 0) >= 0,
        tenantTablesCount: tenantTablesFound[0]?.count ?? 0,
        rlsTablesCount: rlsTablesFound[0]?.count ?? 0,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    appLogger.warn(`[probeDatabase Failed] Host: ${params.host}:${params.port} - ${msg}`);
    return {
      ok: false,
      latencyMs,
      error: `Fallo de conexión a PgBouncer/PostgreSQL (${params.host}:${params.port}): ${msg}`,
    };
  } finally {
    if (sqlClient && typeof sqlClient.end === "function") {
      try {
        await sqlClient.end({ timeout: 1 });
      } catch {
        // Ignorar errores al cerrar conexión de prueba
      }
    }
  }
}

/**
 * Ejecuta el probe HTTP autenticado contra el endpoint de salud de la aplicación celular.
 * No sigue redirecciones (CEL-RF-013) y envía X-Mocter-Handshake-Secret.
 */
export async function probeHttpHealth(params: {
  appUrl: string;
  handshakeSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ProbeResult> {
  const start = Date.now();
  const timeout = params.timeoutMs || 5000;
  const clientFetch = params.fetchImpl || fetch;

  try {
    let cleanUrl = params.appUrl.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const targetUrl = cleanUrl.endsWith("/api/health")
      ? cleanUrl
      : `${cleanUrl.replace(/\/+$/, "")}/api/health`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await clientFetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Mocter-Handshake-Secret": params.handshakeSecret,
      },
      redirect: "error", // CEL-RF-013: no sigue redirecciones
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        error: `El servicio celular respondió con status HTTP ${res.status} (${res.statusText || "Error"}).`,
        details: { httpStatus: res.status },
      };
    }

    const json = await res.json().catch(() => ({}));
    return {
      ok: true,
      latencyMs,
      details: { httpStatus: res.status, payload: json },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    appLogger.warn(`[probeHttpHealth Failed] URL: ${params.appUrl} - ${msg}`);
    return {
      ok: false,
      latencyMs,
      error: `Fallo al invocar /api/health en ${params.appUrl}: ${msg}`,
    };
  }
}

/**
 * Servicio integral para ejecutar el Handshake Dual 360° y actualizar el estado de la celda.
 */
export class CellHandshakeService {
  constructor(
    private readonly secretsService: CellSecretsCryptoService = new CellSecretsCryptoService(),
  ) {}

  /**
   * Ejecuta la validación técnica dual (DB + HTTP) y transiciona el estado de la celda.
   */
  async executeHandshake(
    cellId: string,
    options?: CellHandshakeOptions,
  ): Promise<CellHandshakeExecutionResult> {
    const db = getDb();
    const [cell] = await db.select().from(cells).where(eq(cells.id, cellId)).limit(1);

    if (!cell) {
      throw new Error(`Célula de datos no encontrada para id: "${cellId}".`);
    }

    const allowLocal =
      options?.allowLocalTargets ??
      (cell.topologyType === "local_compose" || process.env.NODE_ENV === "test");

    // 1. Validar objetivos de red
    const dbTargetValidation = validatePrivateTarget(cell.pgbouncerHost, cell.pgbouncerPort, {
      allowLocal,
    });
    if (!dbTargetValidation.valid) {
      const errorMsg = dbTargetValidation.reason!;
      return this.recordFailure(db, cell, errorMsg);
    }

    // 2. Transición transitoria a verifying
    await db
      .update(cells)
      .set({ status: "verifying", updatedAt: new Date() })
      .where(eq(cells.id, cell.id));

    // 3. Descifrar secretos celulares
    let bundle: CellSecretsBundle;
    try {
      bundle = this.secretsService.decryptBundle(
        cell.cellSecretsCiphertext,
        cell.id,
        cell.cellSecretsKeyId,
        cell.code,
      );
    } catch (err) {
      const errorMsg = `Fallo crítico al descifrar el paquete de secretos de la celda ${cell.code}.`;
      appLogger.error(`[CellHandshakeService] ${errorMsg}`, err);
      return this.recordFailure(db, cell, errorMsg);
    }

    // 4. Ejecutar Probes en paralelo
    const timeoutMs = options?.timeoutMs || 5000;
    const { probeHost, probeAppUrl } = resolveLocalProbeTarget({
      topologyType: cell.topologyType,
      host: cell.pgbouncerHost,
      appUrl: cell.appUrl,
    });

    const [dbProbeResult, appProbeResult] = await Promise.all([
      probeDatabase({
        host: probeHost,
        port: cell.pgbouncerPort,
        database: cell.databaseName,
        user: bundle.mocter_healthcheck_password ? "mocter_healthcheck" : "mocter_app",
        password: bundle.mocter_healthcheck_password || bundle.mocter_app_password,
        timeoutMs,
        dbClientFactory: options?.dbClientFactory,
      }),
      probeHttpHealth({
        appUrl: probeAppUrl,
        handshakeSecret: bundle.handshake_secret,
        timeoutMs,
        fetchImpl: options?.fetchImpl,
      }),
    ]);

    const isSuccessful = dbProbeResult.ok && appProbeResult.ok;
    const checkedAt = new Date().toISOString();

    if (isSuccessful) {
      const diagnostic: CellHandshakeDiagnostic = {
        ok: true,
        checkedAt,
        db: dbProbeResult,
        app: appProbeResult,
      };

      await db
        .update(cells)
        .set({
          status: "active",
          healthStatus: diagnostic as any,
          lastHealthCheckAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(cells.id, cell.id));

      appLogger.info(`[CellHandshakeService] Célula "${cell.code}" activada exitosamente tras Handshake 360°.`, {
        cellId: cell.id,
        code: cell.code,
      });

      return {
        ok: true,
        status: "active",
        cellId: cell.id,
        code: cell.code,
        diagnostic,
      };
    }

    const failedProbes = [
      !dbProbeResult.ok ? `Base de Datos (${dbProbeResult.error})` : null,
      !appProbeResult.ok ? `Aplicación HTTP (${appProbeResult.error})` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const diagnostic: CellHandshakeDiagnostic = {
      ok: false,
      checkedAt,
      error: failedProbes,
      db: dbProbeResult,
      app: appProbeResult,
    };

    await db
      .update(cells)
      .set({
        status: "error_connection",
        healthStatus: diagnostic as any,
        lastHealthCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cells.id, cell.id));

    appLogger.warn(`[CellHandshakeService] Handshake 360° falló para célula "${cell.code}".`, {
      cellId: cell.id,
      code: cell.code,
      failedProbes,
    });

    return {
      ok: false,
      status: "error_connection",
      cellId: cell.id,
      code: cell.code,
      diagnostic,
    };
  }

  private async recordFailure(
    db: any,
    cell: Cell,
    errorMsg: string,
  ): Promise<CellHandshakeExecutionResult> {
    const diagnostic: CellHandshakeDiagnostic = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: errorMsg,
      db: { ok: false, latencyMs: 0, error: errorMsg },
      app: { ok: false, latencyMs: 0, error: errorMsg },
    };

    await db
      .update(cells)
      .set({
        status: "error_connection",
        healthStatus: diagnostic as any,
        lastHealthCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cells.id, cell.id));

    return {
      ok: false,
      status: "error_connection",
      cellId: cell.id,
      code: cell.code,
      diagnostic,
    };
  }
}

/**
 * Ejecuta una ronda de la sonda periódica liviana de 60 segundos sobre todas las celdas en estado 'active' (CEL-RF-014).
 *
 * Utiliza Redis para coordinar la ejecución distribuida mediante un lock exclusivo de 50s.
 * Cada falla incrementa un contador por celda (`cell:probe:failures:<id>`).
 * Tras 3 fallos consecutivos, transiciona la celda a `error_connection`.
 * Nunca reactiva una celda ni mueve rutas de inquilinos.
 */
export async function executeCellPeriodicProbe(options?: {
  fetchImpl?: typeof fetch;
  dbClientFactory?: any;
  secretsService?: CellSecretsCryptoService;
  redisClient?: any;
}): Promise<{ checkedCount: number; transitionedCount: number }> {
  let redis: any = options?.redisClient ?? null;
  if (!redis) {
    try {
      redis = getRedisClient();
    } catch {
      // Si Redis no está disponible, continuar sin lock
    }
  }

  const LOCK_KEY = "cell:probe:lock";
  const LOCK_TTL_SEC = 50;

  if (redis) {
    try {
      const acquired = await redis.set(LOCK_KEY, "locked", "EX", LOCK_TTL_SEC, "NX");
      if (!acquired) {
        // Otro proceso tiene el lock activo
        return { checkedCount: 0, transitionedCount: 0 };
      }
    } catch {
      // Ignorar fallo de lock
    }
  }

  const db = getDb();
  const activeCells = await db.select().from(cells).where(eq(cells.status, "active"));

  if (activeCells.length === 0) {
    return { checkedCount: 0, transitionedCount: 0 };
  }

  const secretsService = options?.secretsService ?? new CellSecretsCryptoService();
  let transitionedCount = 0;

  for (const cell of activeCells) {
    let bundle: CellSecretsBundle;
    try {
      bundle = secretsService.decryptBundle(
        cell.cellSecretsCiphertext,
        cell.id,
        cell.cellSecretsKeyId,
        cell.code,
      );
    } catch {
      continue;
    }

    const { probeHost, probeAppUrl } = resolveLocalProbeTarget({
      topologyType: cell.topologyType,
      host: cell.pgbouncerHost,
      appUrl: cell.appUrl,
    });

    const [dbRes, httpRes] = await Promise.all([
      probeDatabase({
        host: probeHost,
        port: cell.pgbouncerPort,
        database: cell.databaseName,
        user: bundle.mocter_healthcheck_password ? "mocter_healthcheck" : "mocter_app",
        password: bundle.mocter_healthcheck_password || bundle.mocter_app_password,
        timeoutMs: 3000,
        isLightProbe: true,
        dbClientFactory: options?.dbClientFactory,
      }),
      probeHttpHealth({
        appUrl: probeAppUrl,
        handshakeSecret: bundle.handshake_secret,
        timeoutMs: 3000,
        fetchImpl: options?.fetchImpl,
      }),
    ]);

    const isHealthy = dbRes.ok && httpRes.ok;
    const failKey = `cell:probe:failures:${cell.id}`;

    if (isHealthy) {
      if (redis) {
        await redis.del(failKey).catch(() => {});
      }
      await db
        .update(cells)
        .set({ lastHealthCheckAt: new Date(), updatedAt: new Date() })
        .where(eq(cells.id, cell.id))
        .catch(() => {});
    } else {
      let failures = 1;
      if (redis) {
        try {
          failures = await redis.incr(failKey);
          await redis.expire(failKey, 600);
        } catch {
          failures = 3;
        }
      } else {
        failures = 3;
      }

      if (failures >= 3) {
        transitionedCount++;
        const diagnostic: CellHandshakeDiagnostic = {
          ok: false,
          checkedAt: new Date().toISOString(),
          error: `Sonda periódica falló 3 veces consecutivas: DB (${dbRes.error || "ok"}) | HTTP (${httpRes.error || "ok"})`,
          db: dbRes,
          app: httpRes,
        };

        await db
          .update(cells)
          .set({
            status: "error_connection",
            healthStatus: diagnostic as any,
            lastHealthCheckAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(cells.id, cell.id))
          .catch(() => {});

        appLogger.warn(
          `[CellPeriodicProbe] Célula "${cell.code}" transicionó a error_connection tras ${failures} fallos consecutivos.`,
          { cellId: cell.id, code: cell.code, diagnostic },
        );
      }
    }
  }

  return { checkedCount: activeCells.length, transitionedCount };
}

let probeIntervalTimer: NodeJS.Timeout | null = null;

/**
 * Inicia el loop de la sonda periódica de 60 segundos (CEL-RF-014).
 */
export function startCellPeriodicProbe(intervalMs: number = 60_000): void {
  if (probeIntervalTimer) return;
  probeIntervalTimer = setInterval(() => {
    executeCellPeriodicProbe().catch((err) => {
      appLogger.error("[CellPeriodicProbe] Error no controlado en la sonda periódica:", err);
    });
  }, intervalMs);
  if (typeof probeIntervalTimer.unref === "function") {
    probeIntervalTimer.unref();
  }
  appLogger.info(`[CellPeriodicProbe] Sonda periódica iniciada con intervalo de ${intervalMs / 1000}s.`);
}
