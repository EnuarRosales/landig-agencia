/**
 * Punto de entrada principal del paquete de dominio `@mocter/domain`.
 *
 * Expone de forma centralizada:
 * - Esquemas de datos Drizzle ORM y tipos de base de datos.
 * - Esquemas de validación Zod.
 * - Conexión singleton y verificación de salud de PostgreSQL.
 * - Patrón Result para manejo funcional de errores.
 * - Logger estructurado con redacción de secretos.
 * - Contratos de repositorio e implementación concreta Drizzle.
 * - Servicios de negocio para orquestación de prospectos (leads).
 */

export * from "./db/schemas";
export * from "./validation";
export * from "./db/index";
export * from "./types/result";
export * from "./utils/logger";
export * from "./repositories/lead.repository.interface";
export * from "./repositories/drizzle-lead.repository";
export * from "./services/lead.service";
