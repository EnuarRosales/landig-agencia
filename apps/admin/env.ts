import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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
    IMGPROXY_KEY: z.string().optional(),
    IMGPROXY_SALT: z.string().optional(),
    IMGPROXY_BASE_URL: z.string().optional(),
  },
  client: {
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
    IMGPROXY_BASE_URL: process.env.IMGPROXY_BASE_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CHATWOOT_URL: process.env.NEXT_PUBLIC_CHATWOOT_URL,
    NEXT_PUBLIC_SAAS_BRAND_NAME: process.env.NEXT_PUBLIC_SAAS_BRAND_NAME,
    NEXT_PUBLIC_SAAS_LOGO_URL: process.env.NEXT_PUBLIC_SAAS_LOGO_URL,
  },
  skipValidation: Boolean(
    process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
  ),
});
