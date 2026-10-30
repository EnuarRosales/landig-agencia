import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Esquema PostgreSQL `admin` dentro de una instancia de celda de datos (`pg-cell-XX`).
 *
 * Se declara en un módulo independiente del Router Global para mantener aisladas
 * las dos líneas de migración Drizzle (`drizzle.config.ts` vs `drizzle.cell.config.ts`,
 * ADM-001 T-04 y DAT-001 §6.8).
 */
export const cellAdminSchema = pgSchema("admin");

