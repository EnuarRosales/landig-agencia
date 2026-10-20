// Aplica las migraciones SQL versionadas de Drizzle y termina.
//
// Estándar: drizzle-kit generate (SQL revisado y versionado en git) + migrate
// (aplica solo lo pendiente y lo registra en drizzle.__drizzle_migrations).
//
// En la imagen se ubica en /app/migrator/scripts/migrate.mjs y las migraciones en
// /app/migrator/drizzle. Se ejecuta mediante el servicio "migrate" del compose:
//   command: ["node", "migrator/scripts/migrate.mjs"]
//
// Driver: postgres-js ("postgres" en package.json de @mocter/domain)

import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] Error: DATABASE_URL no está definido.");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  console.log(`[migrate] Aplicando migraciones pendientes desde ${migrationsFolder}...`);
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("[migrate] Migraciones aplicadas correctamente.");
} catch (err) {
  console.error("[migrate] Error aplicando migraciones:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
