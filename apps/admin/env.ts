import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Determina si debe omitirse la validación de variables de entorno (tests, flag explícito o build de Next.js).
 */
function shouldSkipEnvValidation(): boolean {
  const skipFlag = process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase();
  const hasExplicitSkipFlag =
    Boolean(skipFlag) && skipFlag !== "false" && skipFlag !== "0" && skipFlag !== "no";

  return (
    hasExplicitSkipFlag ||
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
}

/**
 * Módulo centralizado de variables de entorno para @mocter/admin.
 *
 * Valida y tipa estrictamente las variables de servidor y cliente
 * utilizando @t3-oss/env-nextjs y Zod (Regla 4.12 de AGENTS.md).
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
    REDIS_URL: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    CHATWOOT_INTERNAL_URL: z
      .string()
      .url()
      .default("http://mocter-chatwoot-rails-1:3000"),
    CHATWOOT_BASE_URL: z.string().url().default("http://localhost:3002"),
    CHATWOOT_PLATFORM_TOKEN: z.string().optional(),
    CHATWOOT_WEBHOOK_URL: z
      .string()
      .url()
      .default("http://admin-portal:3003/api/webhooks/chatwoot"),
    CHATWOOT_SUPER_ADMIN_USER_ID: z.coerce
      .number()
      .int()
      .positive()
      .default(1),
    IMGPROXY_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_KEY debe ser hexadecimal")
      .min(2, "IMGPROXY_KEY es requerida"),
    IMGPROXY_SALT: z
      .string()
      .regex(/^[0-9a-fA-F]+$/, "IMGPROXY_SALT debe ser hexadecimal")
      .min(2, "IMGPROXY_SALT es requerida"),
    IMGPROXY_PUBLIC_URL: z
      .string()
      .url("IMGPROXY_PUBLIC_URL debe ser una URL válida"),
    IMGPROXY_BASE_URL: z.string().url().optional(),
    S3_ENDPOINT: z
      .string()
      .url("S3_ENDPOINT debe ser una URL válida")
      .default("http://seaweedfs:8333"),
    S3_REGION: z.string().min(1, "S3_REGION es requerida").default("us-east-1"),
    S3_BUCKET: z.string().min(1, "S3_BUCKET es requerido").default("media"),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
    S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID es requerida"),
    S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY es requerida"),
    AI_ENCRYPTION_KEY: z.string().optional(),
    AI_ENCRYPTION_KEY_ID: z.string().min(1).default("key-v1"),
    AI_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url()
      .default("http://localhost:3001"),
    NEXT_PUBLIC_ADMIN_URL: z
      .string()
      .url()
      .default("http://localhost:3003"),
    NEXT_PUBLIC_API_URL: z
      .string()
      .url()
      .default("http://localhost:3001/api"),
    NEXT_PUBLIC_CHATWOOT_URL: z
      .string()
      .url()
      .default("http://localhost:3002"),
    NEXT_PUBLIC_SAAS_BRAND_NAME: z
      .string()
      .default("Mocter"),
    NEXT_PUBLIC_SAAS_LOGO_URL: z
      .string()
      .optional(),
    NEXT_PUBLIC_NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    CHATWOOT_INTERNAL_URL: process.env.CHATWOOT_INTERNAL_URL,
    CHATWOOT_BASE_URL: process.env.CHATWOOT_BASE_URL,
    CHATWOOT_PLATFORM_TOKEN: process.env.CHATWOOT_PLATFORM_TOKEN,
    CHATWOOT_WEBHOOK_URL: process.env.CHATWOOT_WEBHOOK_URL,
    CHATWOOT_SUPER_ADMIN_USER_ID: process.env.CHATWOOT_SUPER_ADMIN_USER_ID,
    IMGPROXY_KEY: process.env.IMGPROXY_KEY,
    IMGPROXY_SALT: process.env.IMGPROXY_SALT,
    IMGPROXY_PUBLIC_URL: process.env.IMGPROXY_PUBLIC_URL,
    IMGPROXY_BASE_URL: process.env.IMGPROXY_BASE_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    AI_ENCRYPTION_KEY: process.env.AI_ENCRYPTION_KEY,
    AI_ENCRYPTION_KEY_ID: process.env.AI_ENCRYPTION_KEY_ID,
    AI_HTTP_TIMEOUT_MS: process.env.AI_HTTP_TIMEOUT_MS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CHATWOOT_URL: process.env.NEXT_PUBLIC_CHATWOOT_URL,
    NEXT_PUBLIC_SAAS_BRAND_NAME: process.env.NEXT_PUBLIC_SAAS_BRAND_NAME,
    NEXT_PUBLIC_SAAS_LOGO_URL: process.env.NEXT_PUBLIC_SAAS_LOGO_URL,
    NEXT_PUBLIC_NODE_ENV: process.env.NEXT_PUBLIC_NODE_ENV || process.env.NODE_ENV,
  },
  skipValidation: shouldSkipEnvValidation(),
});
