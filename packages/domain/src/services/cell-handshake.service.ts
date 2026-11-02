import { eq } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../db/client";
import { cells, type Cell } from "../db/schemas/admin/cells";
import { CellSecretsCryptoService, type CellSecretsBundle } from "./cell-secrets.service";
import { appLogger } from "../utils/logger";

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
 * Valida que el host y puerto de destino cumplan los requisitos de red privada (DAT-001 §3.6.3).
 */
export function validatePrivateTarget(
  targetHost: string,
  targetPort: number,
  options?: { allowLocal?: boolean },
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

  if (isLoopback && !options?.allowLocal) {
    return {
      valid: false,
      reason: `Destino de red inválido: "${targetHost}". En producción no se admiten destinos loopback.`,
    };
  }

  return { valid: true };
}

/**
 * Ejecuta el probe directo contra PgBouncer / PostgreSQL 18.
 */
export async function probeDatabase(params: {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  timeoutMs?: number;
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
    const latencyMs = Date.now() - start;

    if (!rows || rows.length === 0 || rows[0].alive !== 1) {
      return {
        ok: false,
        latencyMs,
        error: "Respuesta inesperada al verificar disponibilidad de base de datos.",
      };
    }

    return {
      ok: true,
      latencyMs,
      details: { pgAlive: true, host: params.host, port: params.port },
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
      );
    } catch (err) {
      const errorMsg = `Fallo crítico al descifrar el paquete de secretos de la celda ${cell.code}.`;
      appLogger.error(`[CellHandshakeService] ${errorMsg}`, err);
      return this.recordFailure(db, cell, errorMsg);
    }

    // 4. Ejecutar Probes en paralelo
    const timeoutMs = options?.timeoutMs || 5000;
    const [dbProbeResult, appProbeResult] = await Promise.all([
      probeDatabase({
        host: cell.pgbouncerHost,
        port: cell.pgbouncerPort,
        database: cell.databaseName,
        user: "mocter_app",
        password: bundle.mocter_app_password,
        timeoutMs,
        dbClientFactory: options?.dbClientFactory,
      }),
      probeHttpHealth({
        appUrl: cell.appUrl,
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
