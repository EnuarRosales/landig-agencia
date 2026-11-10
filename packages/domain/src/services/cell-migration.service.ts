import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { getCellDb } from "../db/cell-client";
import { cells } from "../db/schemas/admin/cells";
import { appLogger } from "../utils/logger";
import { ok, err, type Result } from "../types/result";

export interface CellJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface CellMigrationJournal {
  version: string;
  dialect: string;
  entries: CellJournalEntry[];
}

export interface CellMigrationStatusDto {
  cellId: string;
  cellCode: string;
  status: "synchronized" | "pending_migrations";
  label: "Al día" | "Actualización Pendiente";
  appliedCount: number;
  totalJournalEntries: number;
  pendingCount: number;
  pendingMigrations: string[];
  lastAppliedTag?: string;
  cellOperationalStatus: string;
}

export interface ExecuteCellMigrationResult {
  success: boolean;
  cellId: string;
  cellCode: string;
  appliedCount: number;
  appliedTags: string[];
  error?: string;
}

/**
 * Resuelve la ruta canónica hacia la carpeta `drizzle-cell/` tanto en local como en contenedor Docker.
 */
export function resolveDrizzleCellPath(): string {
  const candidatePaths = [
    path.resolve(__dirname, "../../drizzle-cell"),
    path.resolve(process.cwd(), "packages/domain/drizzle-cell"),
    path.resolve(process.cwd(), "drizzle-cell"),
    "/app/packages/domain/drizzle-cell",
    "/app/migrator/drizzle-cell",
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(path.join(p, "meta/_journal.json"))) {
      return p;
    }
  }

  // Retorno por defecto para pruebas
  return path.resolve(process.cwd(), "packages/domain/drizzle-cell");
}

/**
 * Servicio autoritativo de detección y ejecución controlada de migraciones en celdas de datos (M5, E2E Escenario E).
 *
 * Responsabilidades:
 * 1. Inspeccionar el journal canónico de `drizzle-cell/meta/_journal.json` (ADM-RF-10.10, E-T1.1).
 * 2. Consultar `drizzle.__drizzle_migrations` en la celda física para comparar hashes y tags (E-T1.2, E-T1.3).
 * 3. Clasificar el estado de la celda en 'synchronized' ("Al día") vs 'pending_migrations' ("Actualización Pendiente") (E-T2.2).
 * 4. Ejecutar de forma transaccional y manual las migraciones pendientes en estados permitidos (E-T3.2).
 */
export class CellMigrationService {
  /**
   * Lee el journal de migraciones celulares versionado en el repositorio.
   */
  getMigrationJournal(): CellMigrationJournal {
    const basePath = resolveDrizzleCellPath();
    const journalPath = path.join(basePath, "meta/_journal.json");

    if (!fs.existsSync(journalPath)) {
      throw new Error(`Archivo de journal celular no encontrado en ${journalPath}`);
    }

    const content = fs.readFileSync(journalPath, "utf8");
    return JSON.parse(content) as CellMigrationJournal;
  }

  /**
   * Obtiene el estado de sincronización de esquema de una celda específica.
   */
  async getCellMigrationStatus(cellId: string): Promise<Result<CellMigrationStatusDto>> {
    const portalDb = getDb();

    // 1. Verificar celda en plano de control
    const [cell] = await portalDb
      .select({
        id: cells.id,
        code: cells.code,
        status: cells.status,
      })
      .from(cells)
      .where(eq(cells.id, cellId))
      .limit(1);

    if (!cell) {
      return err(`Celda con ID ${cellId} no encontrada.`, "CELL_NOT_FOUND");
    }

    // 2. Leer journal de celdas
    const journal = this.getMigrationJournal();
    const totalEntries = journal.entries.length;

    // 3. Conectar a celda física y consultar drizzle.__drizzle_migrations
    let appliedCount = 0;
    let appliedRows: Array<{ id: number; hash: string; created_at: number | string }> = [];

    try {
      const cellDb = await getCellDb(cell.id);
      const rows = await cellDb.execute(sql`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY id ASC
      `);
      appliedRows = rows as any[];
      appliedCount = appliedRows.length;
    } catch (dbErr) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      // Solo si la tabla no existe aún (código 42P01 'undefined_table') asumimos celda virgen (E-T2.1)
      if (errMsg.includes("does not exist") || errMsg.includes("42P01") || errMsg.includes("__drizzle_migrations")) {
        appLogger.warn(`[getCellMigrationStatus] Tabla __drizzle_migrations aún no existe en celda ${cell.code}, se asume celda nueva.`);
        appliedCount = 0;
      } else {
        appLogger.error(`[getCellMigrationStatus] Error de conexión con la celda ${cell.code}: ${errMsg}`, dbErr);
        return err(`Error de conexión con la base de datos de la celda ${cell.code}: ${errMsg}`, "CELL_CONNECTION_ERROR");
      }
    }

    const pendingCount = Math.max(0, totalEntries - appliedCount);
    const pendingMigrations = journal.entries.slice(appliedCount).map((e) => e.tag);
    const lastAppliedTag = appliedCount > 0 ? journal.entries[appliedCount - 1]?.tag : undefined;

    const status: "synchronized" | "pending_migrations" =
      pendingCount === 0 ? "synchronized" : "pending_migrations";
    const label: "Al día" | "Actualización Pendiente" =
      pendingCount === 0 ? "Al día" : "Actualización Pendiente";

    return ok({
      cellId: cell.id,
      cellCode: cell.code,
      status,
      label,
      appliedCount,
      totalJournalEntries: totalEntries,
      pendingCount,
      pendingMigrations,
      lastAppliedTag,
      cellOperationalStatus: cell.status,
    });
  }

  /**
   * Ejecuta manualmente las migraciones pendientes en la celda seleccionada (E-T2.3, E-T3.2).
   */
  async executeCellMigrations(
    cellId: string,
    actor: string,
  ): Promise<Result<ExecuteCellMigrationResult>> {
    const portalDb = getDb();

    // 1. Verificar celda
    const [cell] = await portalDb
      .select({
        id: cells.id,
        code: cells.code,
        status: cells.status,
      })
      .from(cells)
      .where(eq(cells.id, cellId))
      .limit(1);

    if (!cell) {
      return err(`Celda con ID ${cellId} no encontrada.`, "CELL_NOT_FOUND");
    }

    // 2. Validar que la celda esté en un estado elegible para migración (E-T3.2)
    const migratableStates = ["active", "maintenance", "verifying"];
    if (!migratableStates.includes(cell.status)) {
      return err(
        `La celda ${cell.code} está en estado "${cell.status}" y no puede recibir migraciones. Estados permitidos: ${migratableStates.join(", ")}.`,
        "CELL_NOT_MIGRATABLE",
      );
    }

    // 3. Obtener estado actual de migraciones
    const statusRes = await this.getCellMigrationStatus(cellId);
    if (!statusRes.ok) {
      return err(statusRes.error, statusRes.code);
    }

    const status = statusRes.data;
    if (status.pendingCount === 0) {
      return ok({
        success: true,
        cellId: cell.id,
        cellCode: cell.code,
        appliedCount: 0,
        appliedTags: [],
      });
    }

    // 4. Aplicar cada migración pendiente en orden
    const basePath = resolveDrizzleCellPath();
    const journal = this.getMigrationJournal();
    const cellDb = await getCellDb(cell.id);
    const appliedTags: string[] = [];

    const entriesToApply = journal.entries.slice(status.appliedCount);

    for (const entry of entriesToApply) {
      const sqlFilePath = path.join(basePath, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlFilePath)) {
        return err(
          `Archivo de migración SQL ${sqlFilePath} no encontrado para la etiqueta ${entry.tag}.`,
          "MIGRATION_FILE_MISSING",
        );
      }

      const sqlContent = fs.readFileSync(sqlFilePath, "utf8");
      const hash = createHash("sha256").update(sqlContent).digest("hex");

      appLogger.info(
        `[executeCellMigrations] Aplicando migración ${entry.tag} en celda ${cell.code} por ${actor}...`,
      );

      try {
        await cellDb.transaction(async (tx) => {
          // Ejecutar DDL atómicamente en celda
          await tx.execute(sql.raw(sqlContent));

          // Registrar en drizzle.__drizzle_migrations
          await tx.execute(sql`
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${hash}, ${entry.when})
          `);
        });

        appliedTags.push(entry.tag);
      } catch (applyErr) {
        const errorMsg = applyErr instanceof Error ? applyErr.message : String(applyErr);
        appLogger.error(
          `[executeCellMigrations] Falló la aplicación de ${entry.tag} en ${cell.code}: ${errorMsg}`,
          applyErr,
        );
        return err(
          `Error al aplicar la migración ${entry.tag} en celda ${cell.code}: ${errorMsg}`,
          "MIGRATION_APPLY_FAILED",
        );
      }
    }

    appLogger.info(
      `[executeCellMigrations] Se aplicaron exitosamente ${appliedTags.length} migraciones en celda ${cell.code}.`,
    );

    return ok({
      success: true,
      cellId: cell.id,
      cellCode: cell.code,
      appliedCount: appliedTags.length,
      appliedTags,
    });
  }
}

export const cellMigrationService = new CellMigrationService();

