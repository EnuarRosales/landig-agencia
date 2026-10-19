import { z } from "zod";
import { appLogger } from "./logger";

/**
 * Esquema de validación estricto para variables de entorno del sistema.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

/**
 * Tipo inferido para las variables de entorno validadas.
 */
export type EnvConfig = z.infer<typeof envSchema>;

let validatedEnv: EnvConfig | null = null;

/**
 * Valida y obtiene las variables de entorno del sistema utilizando Zod.
 *
 * @param customEnv - Diccionario opcional de variables para pruebas.
 * @returns Objeto tipado y validado con las variables requeridas.
 * @throws {Error} Si alguna variable obligatoria falta o tiene un formato inválido.
 */
export function getValidatedEnv(customEnv?: Record<string, string | undefined>): EnvConfig {
  if (validatedEnv && !customEnv) {
    return validatedEnv;
  }

  const source = customEnv ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorDetails = result.error.format();
    const errorMsg = `[Config Error] Variables de entorno inválidas o ausentes: ${JSON.stringify(errorDetails)}`;
    appLogger.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!customEnv) {
    validatedEnv = result.data;
  }

  return result.data;
}
