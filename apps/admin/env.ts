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
  },
  client: {
    NEXT_PUBLIC_ADMIN_URL: z
      .string()
      .url()
      .default("http://localhost:3003"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  },
  skipValidation: Boolean(
    process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
  ),
});
