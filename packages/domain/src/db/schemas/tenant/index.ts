/**
 * Punto de entrada del esquema de base de datos del Cell Data Plane (`pg-cell-XX`).
 *
 * Consumido por `drizzle.cell.config.ts` para generar la línea de migraciones independiente
 * en `packages/domain/drizzle-cell/` (ADM-001 T-04, AUTH-001 T-04, DAT-001 §6.8).
 */
export { cellAdminSchema } from "./namespace";
export { cellUsers, type CellUser, type NewCellUser } from "./users";
export { cellIdentities, type CellIdentity, type NewCellIdentity } from "./identities";
