import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Módulo centralizado de variables de entorno para @mocter/web.
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
    AUTH_RATE_LIMIT_PEPPER: z.string().min(1).default("mocter-dev-pepper"),
    ALLOWED_ORIGINS: z.string().optional(),
    REDIS_URL: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),
    FACEBOOK_REDIRECT_URI: z.string().optional(),
    CHATWOOT_SSO_SECRET: z.string().optional(),
    TOTP_ACTIVE_KEY_ID: z.string().optional(),
    TOTP_SECRETS_DIR: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SETUP_OWNER_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3001"),
    NEXT_PUBLIC_SITE_URL: z.string().url().default("https://mocter.co"),
    NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3001/api"),
    NEXT_PUBLIC_NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_RATE_LIMIT_PEPPER: process.env.AUTH_RATE_LIMIT_PEPPER ?? "mocter-dev-pepper",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI,
    CHATWOOT_SSO_SECRET: process.env.CHATWOOT_SSO_SECRET,
    TOTP_ACTIVE_KEY_ID: process.env.TOTP_ACTIVE_KEY_ID,
    TOTP_SECRETS_DIR: process.env.TOTP_SECRETS_DIR,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,
    SETUP_OWNER_TOKEN: process.env.SETUP_OWNER_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_NODE_ENV: process.env.NEXT_PUBLIC_NODE_ENV || process.env.NODE_ENV,
  },
  skipValidation: Boolean(
    process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
  ),
});
