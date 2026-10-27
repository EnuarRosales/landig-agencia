import { getDb } from "./client";
import { leads, type Lead } from "./schemas";
import type { LeadInput } from "../validation";
import { appLogger } from "../utils/logger";

export * from "./client";
export * from "./health";
export * from "./schemas";

/**
 * Inserta directamente un registro en la tabla `leads` sin validación previa.
 *
 * @deprecated Función obsoleta mantenida temporalmente por compatibilidad regresiva.
 * Debe utilizarse {@link LeadService.registerLead} o {@link ILeadRepository.create}
 * para asegurar la validación estricta y el manejo de errores mediante el patrón Result.
 *
 * @param input - Datos del lead validados según {@link LeadInput}.
 * @returns El registro insertado {@link Lead}.
 * @throws {Error} Si la base de datos rechaza la inserción o no devuelve filas.
 */
export async function insertLead(input: LeadInput): Promise<Lead> {
  try {
    const database = getDb();
    const rows = await database.insert(leads).values(input).returning();
    const row = rows[0];

    if (!row) {
      throw new Error("insertLead: insert into `leads` returned no rows");
    }

    return row;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(
      `[Database Insert Error] Falló la inserción del lead en PostgreSQL: ${msg}`,
      error,
    );
    throw error;
  }
}
