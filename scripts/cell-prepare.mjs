#!/usr/bin/env node
/**
 * Preparación de Entorno Offline para Célula de Datos Local (CEL-RF-010, CEL-T03).
 *
 * Verifica la disponibilidad del demonio Docker, comprueba que las imágenes base
 * requeridas estén disponibles en la caché local (o las precarga), y valida que los
 * artefactos de migración celular existan para operar sin requerir conexión a Internet.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_IMAGES = [
  "node:24-alpine",
  "pgvector/pgvector:pg18",
  "edoburu/pgbouncer:v1.26.1-p0",
];

console.log("=== Mocter · Preparación de Célula de Datos Local (Offline Build) ===");

// 1. Verificar demonio Docker
try {
  execSync("docker info", { stdio: "ignore" });
  console.log("✓ Demonio de Docker en ejecución y accesible.");
} catch {
  console.error("✗ Error: El demonio de Docker no está en ejecución o no es accesible.");
  process.exit(1);
}

// 2. Verificar imágenes base requeridas
console.log("\nVerificando imágenes base necesarias en caché local...");
for (const img of REQUIRED_IMAGES) {
  try {
    execSync(`docker image inspect ${img}`, { stdio: "ignore" });
    console.log(`✓ Imagen ${img} disponible localmente.`);
  } catch {
    console.log(`ℹ Descargando imagen requerida para caché offline: ${img}...`);
    try {
      execSync(`docker pull ${img}`, { stdio: "inherit" });
      console.log(`✓ Imagen ${img} precargada.`);
    } catch (pullErr) {
      console.error(`✗ Error al precargar imagen ${img}:`, pullErr.message);
      process.exit(1);
    }
  }
}

// 3. Verificar artefactos de migraciones celulares
const drizzleCellPath = resolve(process.cwd(), "packages/domain/drizzle-cell");
if (!existsSync(drizzleCellPath)) {
  console.error(`✗ Error: Directorio de migraciones celulares no encontrado en ${drizzleCellPath}`);
  process.exit(1);
}

const migrationFiles = readdirSync(drizzleCellPath).filter((f) => f.endsWith(".sql"));
if (migrationFiles.length === 0) {
  console.error("✗ Error: No se encontraron archivos de migración SQL en packages/domain/drizzle-cell");
  process.exit(1);
}

console.log(`✓ ${migrationFiles.length} migraciones celulares encontradas en packages/domain/drizzle-cell.`);

console.log("\n==================================================================");
console.log("✓ Entorno de emulación celular local preparado exitosamente.");
console.log("Puede iniciar la célula sin conexión a Internet ejecutando:");
console.log("   pnpm cell:up");
console.log("==================================================================");

