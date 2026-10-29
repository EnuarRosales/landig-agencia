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
export * from "./repositories/plans.repository.interface";
export * from "./repositories/plans.repository";
export * from "./services/lead.service";
export * from "./auth/validation";
export * from "./auth/password-hasher";
export * from "./auth/tokens";
export * from "./auth/auth-mailer.interface";
export * from "./repositories/auth.repository.interface";
export * from "./repositories/drizzle-auth.repository";
export * from "./services/auth.service";
export * from "./auth/rate-limiter";
export * from "./auth/oauth-state";
export * from "./auth/google-oidc.service";
export * from "./auth/facebook-oauth.service";
export * from "./auth/totp-crypto";
export * from "./auth/totp";
export * from "./auth/mfa-challenge";
export * from "./redis/client";
export * from "./redis/mock-redis";
export * from "./utils/env";
