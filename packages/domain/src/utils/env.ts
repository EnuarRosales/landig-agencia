import process from "node:process";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Esquema de validación estricto para variables de entorno del dominio.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  AUTH_RATE_LIMIT_PEPPER: z.string().min(1).default("mocter-dev-pepper"),
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  DEBUG: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_REDIRECT_URI: z.string().optional(),
  CHATWOOT_SSO_SECRET: z.string().optional(),
});

/**
 * Instancia tipada centralizada de variables de entorno para @mocter/domain vía @t3-oss/env-core.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    AUTH_RATE_LIMIT_PEPPER: z.string().min(1).default("mocter-dev-pepper"),
    REDIS_URL: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    DEBUG: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),
    FACEBOOK_REDIRECT_URI: z.string().optional(),
    CHATWOOT_SSO_SECRET: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation: Boolean(
    process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
  ),
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
export function getValidatedEnv(
  customEnv?: Record<string, string | undefined>,
): EnvConfig {
  if (validatedEnv && !customEnv) {
    return validatedEnv;
  }

  const source = customEnv ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    const errorMsg = `[Config Error] Variables de entorno inválidas o ausentes: ${JSON.stringify(issues)}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!customEnv) {
    validatedEnv = result.data;
  }

  return result.data;
}
