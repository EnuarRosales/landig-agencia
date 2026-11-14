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
  CHATWOOT_INTERNAL_URL: z.string().url().optional(),
  CHATWOOT_BASE_URL: z.string().url().optional(),
  CHATWOOT_PLATFORM_TOKEN: z.string().optional(),
  CHATWOOT_WEBHOOK_URL: z.string().url().optional(),
  CHATWOOT_SUPER_ADMIN_USER_ID: z.coerce.number().int().positive().default(1),
  NEXT_PUBLIC_CHATWOOT_URL: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SETUP_OWNER_TOKEN: z.string().optional(),
  TOTP_SECRETS_DIR: z.string().optional(),
  TOTP_ACTIVE_KEY_ID: z.string().optional(),
  TOTP_KEY: z.string().optional(),
  CELL_SECRETS_DIR: z.string().optional(),
  CELL_SECRETS_ACTIVE_KEY_ID: z.string().optional(),
  CELL_SECRETS_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  CELL_PRIVATE_ALLOWED_CIDRS: z.string().optional(),
  HANDSHAKE_SECRET: z.string().optional(),
  CELL_CODE: z.string().optional(),
  IMGPROXY_PUBLIC_URL: z
    .string()
    .url("IMGPROXY_PUBLIC_URL debe ser una URL válida")
    .optional(),
  IMGPROXY_BASE_URL: z
    .string()
    .url("IMGPROXY_BASE_URL debe ser una URL válida")
    .optional(),
  IMGPROXY_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_KEY debe ser una cadena hexadecimal válida")
    .min(2, "IMGPROXY_KEY debe tener al menos 2 caracteres hexadecimales")
    .optional(),
  IMGPROXY_SALT: z
    .string()
    .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_SALT debe ser una cadena hexadecimal válida")
    .min(2, "IMGPROXY_SALT debe tener al menos 2 caracteres hexadecimales")
    .optional(),
  S3_ENDPOINT: z
    .string()
    .url("S3_ENDPOINT debe ser una URL válida")
    .default("http://seaweedfs:8333"),
  S3_REGION: z.string().min(1, "S3_REGION es requerida").default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET es requerido").default("media"),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID no puede estar vacío").optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY no puede estar vacío").optional(),
  AI_ENCRYPTION_KEY: z
    .string()
    .optional(),
  AI_ENCRYPTION_KEY_ID: z
    .string()
    .min(1, "AI_ENCRYPTION_KEY_ID no puede estar vacío")
    .default("key-v1"),
  AI_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int("AI_HTTP_TIMEOUT_MS debe ser un entero")
    .positive("AI_HTTP_TIMEOUT_MS debe ser mayor a cero")
    .default(15000),
});

/**
 * Esquema estricto para validar las variables obligatorias de almacenamiento S3 y firma imgproxy.
 *
 * Se utiliza para verificar que todas las credenciales y endpoints requeridos estén presentes
 * antes de inicializar servicios multimedia en runtime.
 */
export const mediaEnvSchema = z.object({
  S3_ENDPOINT: z.string().url("S3_ENDPOINT debe ser una URL válida"),
  S3_REGION: z.string().min(1, "S3_REGION es requerida"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET es requerido"),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID es requerida"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY es requerida"),
  IMGPROXY_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_KEY debe ser una cadena hexadecimal válida")
    .min(2, "IMGPROXY_KEY es requerida"),
  IMGPROXY_SALT: z
    .string()
    .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_SALT debe ser una cadena hexadecimal válida")
    .min(2, "IMGPROXY_SALT es requerida"),
  IMGPROXY_PUBLIC_URL: z.string().url("IMGPROXY_PUBLIC_URL debe ser una URL válida"),
});

/**
 * Tipo inferido para la configuración multimedia obligatoria de S3 e imgproxy.
 */
export type MediaEnvConfig = z.infer<typeof mediaEnvSchema>;

/**
 * Evalúa si `SKIP_ENV_VALIDATION` solicita explícitamente omitir la validación.
 */
function hasExplicitSkipEnvValidationFlag(): boolean {
  const skipFlag = process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase();
  return Boolean(skipFlag) && skipFlag !== "false" && skipFlag !== "0" && skipFlag !== "no";
}

/**
 * Determina si debe omitirse la validación de `createEnv` (flag explícito, tests o build de Next.js).
 */
function shouldSkipEnvValidation(): boolean {
  return (
    hasExplicitSkipEnvValidationFlag() ||
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
}

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
    CHATWOOT_INTERNAL_URL: z.string().url().optional(),
    CHATWOOT_BASE_URL: z.string().url().optional(),
    CHATWOOT_PLATFORM_TOKEN: z.string().optional(),
    CHATWOOT_WEBHOOK_URL: z.string().url().optional(),
    CHATWOOT_SUPER_ADMIN_USER_ID: z.coerce.number().int().positive().default(1),
    NEXT_PUBLIC_CHATWOOT_URL: z.string().url().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SETUP_OWNER_TOKEN: z.string().optional(),
    TOTP_SECRETS_DIR: z.string().optional(),
    TOTP_ACTIVE_KEY_ID: z.string().optional(),
    TOTP_KEY: z.string().optional(),
    CELL_SECRETS_DIR: z.string().optional(),
    CELL_SECRETS_ACTIVE_KEY_ID: z.string().optional(),
    CELL_SECRETS_KEY: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    CELL_PRIVATE_ALLOWED_CIDRS: z.string().optional(),
    HANDSHAKE_SECRET: z.string().optional(),
    CELL_CODE: z.string().optional(),
    IMGPROXY_PUBLIC_URL: z
      .string()
      .url("IMGPROXY_PUBLIC_URL debe ser una URL válida")
      .optional(),
    IMGPROXY_BASE_URL: z
      .string()
      .url("IMGPROXY_BASE_URL debe ser una URL válida")
      .optional(),
    IMGPROXY_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_KEY debe ser una cadena hexadecimal válida")
      .min(2, "IMGPROXY_KEY debe tener al menos 2 caracteres hexadecimales")
      .optional(),
    IMGPROXY_SALT: z
      .string()
      .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_SALT debe ser una cadena hexadecimal válida")
      .min(2, "IMGPROXY_SALT debe tener al menos 2 caracteres hexadecimales")
      .optional(),
    S3_ENDPOINT: z
      .string()
      .url("S3_ENDPOINT debe ser una URL válida")
      .default("http://seaweedfs:8333"),
    S3_REGION: z.string().min(1, "S3_REGION es requerida").default("us-east-1"),
    S3_BUCKET: z.string().min(1, "S3_BUCKET es requerido").default("media"),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
    S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID no puede estar vacío").optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY no puede estar vacío").optional(),
    AI_ENCRYPTION_KEY: z
      .string()
      .optional(),
    AI_ENCRYPTION_KEY_ID: z
      .string()
      .min(1, "AI_ENCRYPTION_KEY_ID no puede estar vacío")
      .default("key-v1"),
    AI_HTTP_TIMEOUT_MS: z.coerce
      .number()
      .int("AI_HTTP_TIMEOUT_MS debe ser un entero")
      .positive("AI_HTTP_TIMEOUT_MS debe ser mayor a cero")
      .default(15000),
  },
  runtimeEnv: process.env,
  skipValidation: shouldSkipEnvValidation(),
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
  const isTestEnv = process.env.NODE_ENV === "test";
  if (validatedEnv && !customEnv && !isTestEnv) {
    return validatedEnv;
  }

  const source = customEnv ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    if (!customEnv && (hasExplicitSkipEnvValidationFlag() || process.env.NEXT_PHASE === "phase-production-build")) {
      return {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/mocter_dummy",
        NODE_ENV: (process.env.NODE_ENV as any) || "development",
        AUTH_RATE_LIMIT_PEPPER: "mocter-dev-pepper",
        CHATWOOT_SUPER_ADMIN_USER_ID: 1,
        S3_ENDPOINT: "http://seaweedfs:8333",
        S3_REGION: "us-east-1",
        S3_BUCKET: "media",
        S3_FORCE_PATH_STYLE: "true",
        AI_ENCRYPTION_KEY_ID: "key-v1",
        AI_HTTP_TIMEOUT_MS: 15000,
      };
    }
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    const errorMsg = `[Config Error] Variables de entorno inválidas o ausentes: ${JSON.stringify(issues)}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!customEnv && !isTestEnv) {
    validatedEnv = result.data;
  }

  return result.data;
}

/**
 * Valida estrictamente todas las credenciales y URLs requeridas para el pipeline multimedia (SeaweedFS S3 + imgproxy).
 *
 * @param customEnv - Diccionario opcional de variables para pruebas unitarias.
 * @returns Configuración multimedia validada y lista para firmar peticiones SigV4 y URLs HMAC-SHA256.
 * @throws {Error} Si falta alguna credencial o URL requerida (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `IMGPROXY_KEY`, `IMGPROXY_SALT`, `IMGPROXY_PUBLIC_URL`, etc.).
 */
export function getValidatedMediaEnv(
  customEnv?: Record<string, string | undefined>,
): MediaEnvConfig {
  const source = customEnv ?? process.env;
  const result = mediaEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new Error(
      `[Media Config Error] Variables de entorno S3/imgproxy inválidas o ausentes: ${JSON.stringify(issues)}`,
    );
  }
  return result.data;
}
