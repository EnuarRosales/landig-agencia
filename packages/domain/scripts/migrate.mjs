// Aplica las migraciones SQL versionadas de Drizzle para el plano indicado y termina.
//
// Dos líneas de migración independientes (ADM-001 T-04, DAT-001 §6.8):
// - Control Plane (por defecto): /app/migrator/drizzle        (--target=control-plane)
// - Cell Data Plane (celdas):    /app/migrator/drizzle-cell   (--target=cell)
//
// Selección del destino:
//   1. Argumento CLI `--target=control-plane` o `--target=cell`
//   2. Variable de entorno `MIGRATION_TARGET` (`control-plane` | `cell`)
//   3. Valor por defecto: `control-plane`
//
// URL de conexión:
//   - `control-plane`: usa `DATABASE_URL`.
//   - `cell`: usa `CELL_DATABASE_URL` si está definida; de lo contrario `DATABASE_URL`.

import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const TARGET_FOLDERS = {
  "control-plane": "../drizzle",
  cell: "../drizzle-cell",
};

function resolveTarget(argv, envTarget) {
  const cliArg = argv.find((arg) => arg.startsWith("--target="));
  const raw = cliArg ? cliArg.slice("--target=".length).trim() : (envTarget ?? "control-plane").trim();
  if (!Object.prototype.hasOwnProperty.call(TARGET_FOLDERS, raw)) {
    console.error(
      `[migrate] Error: destino de migración inválido "${raw}". Valores admitidos: control-plane, cell.`,
    );
    process.exit(1);
  }
  return raw;
}

const target = resolveTarget(process.argv.slice(2), process.env.MIGRATION_TARGET);
const url =
  target === "cell"
    ? (process.env.CELL_DATABASE_URL ?? process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

if (!url) {
  const expectedVar = target === "cell" ? "CELL_DATABASE_URL o DATABASE_URL" : "DATABASE_URL";
  console.error(`[migrate] Error: ${expectedVar} no está definido para --target=${target}.`);
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL(TARGET_FOLDERS[target], import.meta.url));
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  console.log(
    `[migrate] Aplicando migraciones pendientes (${target}) desde ${migrationsFolder}...`,
  );
  await migrate(drizzle(sql), { migrationsFolder });
  console.log(`[migrate] Migraciones (${target}) aplicadas correctamente.`);

  if (target === "cell" && process.env.POSTGRES_HEALTHCHECK_PASSWORD) {
    const healthPassword = process.env.POSTGRES_HEALTHCHECK_PASSWORD.replace(/'/g, "''");
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mocter_healthcheck') THEN
          CREATE ROLE mocter_healthcheck WITH LOGIN PASSWORD '${healthPassword}';
        ELSE
          ALTER ROLE mocter_healthcheck WITH PASSWORD '${healthPassword}';
        END IF;
      END $$;
      GRANT CONNECT ON DATABASE current_database() TO mocter_healthcheck;
      GRANT USAGE ON SCHEMA public, drizzle TO mocter_healthcheck;
      GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO mocter_healthcheck;
    `);
    console.log(`[migrate] Usuario de sondeo de salud mocter_healthcheck aprovisionado.`);
  }
} catch (err) {
  console.error(`[migrate] Error aplicando migraciones (${target}):`, err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
