import { defineConfig } from "drizzle-kit";

/**
 * Configuración de Drizzle Kit para la línea de migraciones independiente
 * del Cell Data Plane (`pg-cell-XX`, ADM-001 T-04 y DAT-001 §6.8).
 *
 * Aísla el historial de migraciones de las celdas en `./drizzle-cell` sin compartir
 * instantáneas ni diario (`_journal.json`) con el Control Plane (`./drizzle`).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schemas/tenant/index.ts",
  out: "./drizzle-cell",
  dbCredentials: {
    url: process.env.CELL_DATABASE_URL ?? process.env.DATABASE_URL!,
  },
});

