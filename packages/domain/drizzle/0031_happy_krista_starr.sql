ALTER TABLE "admin"."ai_providers" DROP CONSTRAINT IF EXISTS "ai_providers_code_unique";--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" DROP CONSTRAINT IF EXISTS "ai_providers_code_check";--> statement-breakpoint
DROP INDEX IF EXISTS "admin"."ai_models_provider_model_unique";--> statement-breakpoint
ALTER TABLE "admin"."ai_models" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_models" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."ai_models" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD COLUMN "api_dialect" text DEFAULT 'openai_compatible' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD COLUMN "base_url" text DEFAULT 'https://api.openai.com/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD COLUMN "verify_path" text DEFAULT '/models' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD COLUMN "logo_storage_key" text;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD COLUMN "temperature" text DEFAULT '0.7' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD COLUMN "max_tokens" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD COLUMN "priority_role" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD COLUMN "failover_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD COLUMN "priority_role" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
UPDATE "admin"."ai_providers" SET "api_dialect" = 'openai_compatible', "base_url" = 'https://api.openai.com/v1', "verify_path" = '/models' WHERE "code" = 'openai';--> statement-breakpoint
UPDATE "admin"."ai_providers" SET "api_dialect" = 'anthropic', "base_url" = 'https://api.anthropic.com/v1', "verify_path" = '/models' WHERE "code" = 'anthropic';--> statement-breakpoint
UPDATE "admin"."ai_providers" SET "api_dialect" = 'google_gemini', "base_url" = 'https://generativelanguage.googleapis.com/v1beta', "verify_path" = '/models' WHERE "code" = 'google';--> statement-breakpoint
UPDATE "admin"."ai_providers" SET "api_dialect" = 'openai_compatible', "base_url" = 'https://api.deepseek.com/v1', "verify_path" = '/models' WHERE "code" = 'deepseek';--> statement-breakpoint
UPDATE "admin"."ai_providers" SET "api_dialect" = 'openai_compatible', "base_url" = 'https://openrouter.ai/api/v1', "verify_path" = '/auth/key' WHERE "code" = 'openrouter';--> statement-breakpoint
UPDATE "admin"."ai_providers" SET "api_dialect" = 'openai_compatible', "base_url" = 'https://api.together.xyz/v1', "verify_path" = '/models' WHERE "code" = 'together_ai';--> statement-breakpoint
WITH ranked_models AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY is_active DESC, sort_order ASC, created_at ASC) AS rn
  FROM "admin"."ai_models"
  WHERE deleted_at IS NULL
)
UPDATE "admin"."ai_models" m
SET "is_default" = true
FROM ranked_models rm
WHERE m.id = rm.id AND rm.rn = 1 AND NOT EXISTS (
  SELECT 1 FROM "admin"."ai_models" existing WHERE existing.provider_id = m.provider_id AND existing.is_default = true AND existing.deleted_at IS NULL
);--> statement-breakpoint
UPDATE "admin"."ai_platform_keys" pk
SET
  "temperature" = COALESCE(m."default_temperature", pk."temperature"),
  "max_tokens" = LEAST(8192, GREATEST(64, COALESCE(m."default_max_tokens", pk."max_tokens")))
FROM "admin"."ai_models" m
WHERE pk."default_model_id" = m."id";--> statement-breakpoint
WITH ranked_platform_keys AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY purpose ORDER BY updated_at DESC, created_at DESC) AS rn
  FROM "admin"."ai_platform_keys"
  WHERE status = 'active'
)
UPDATE "admin"."ai_platform_keys" pk
SET "priority_role" = CASE
  WHEN r.rn = 1 THEN 'primary'
  WHEN r.rn = 2 THEN 'secondary'
  ELSE 'standby'
END
FROM ranked_platform_keys r
WHERE pk.id = r.id;--> statement-breakpoint
WITH ranked_tenant_keys AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY updated_at DESC, created_at DESC) AS rn
  FROM "admin"."tenant_ai_providers"
  WHERE deleted_at IS NULL AND status = 'active'
)
UPDATE "admin"."tenant_ai_providers" tp
SET "priority_role" = CASE
  WHEN r.rn = 1 THEN 'primary'
  WHEN r.rn = 2 THEN 'secondary'
  ELSE 'standby'
END
FROM ranked_tenant_keys r
WHERE tp.id = r.id;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_default_unique" ON "admin"."ai_models" USING btree ("provider_id") WHERE is_default = true AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_code_active_unique" ON "admin"."ai_providers" USING btree ("code") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_platform_keys_purpose_priority_active_unique" ON "admin"."ai_platform_keys" USING btree ("purpose","priority_role") WHERE status = 'active' AND priority_role IN ('primary', 'secondary');--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_ai_providers_client_priority_active_unique" ON "admin"."tenant_ai_providers" USING btree ("client_id","priority_role") WHERE deleted_at IS NULL AND status = 'active' AND priority_role IN ('primary', 'secondary');--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_model_unique" ON "admin"."ai_models" USING btree ("provider_id","model_id") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD CONSTRAINT "ai_providers_api_dialect_check" CHECK (api_dialect IN ('openai_compatible', 'anthropic', 'google_gemini'));--> statement-breakpoint
ALTER TABLE "admin"."ai_providers" ADD CONSTRAINT "ai_providers_code_check" CHECK (code ~ '^[a-z0-9_-]{2,40}$');--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD CONSTRAINT "ai_platform_keys_priority_role_check" CHECK (priority_role IN ('primary', 'secondary', 'standby'));--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD CONSTRAINT "ai_platform_keys_max_tokens_check" CHECK (max_tokens >= 64 AND max_tokens <= 8192);--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD CONSTRAINT "tenant_ai_providers_priority_role_check" CHECK (priority_role IN ('primary', 'secondary', 'standby'));--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_providers"."api_dialect" IS 'Protocolo HTTP del proveedor LLM (openai_compatible, anthropic o google_gemini)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_providers"."base_url" IS 'URL base del API del proveedor LLM (ej. https://api.openai.com/v1)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_providers"."verify_path" IS 'Ruta relativa usada para verificacion activa de conectividad y credenciales';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_providers"."logo_storage_key" IS 'Clave del objeto del logo corporativo almacenado en SeaweedFS S3 (bucket media)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_providers"."deleted_at" IS 'Fecha de borrado logico del proveedor cuando conserva historial de uso';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_providers"."deleted_by" IS 'Identificador del operador que ejecuto el borrado logico del proveedor';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_models"."is_default" IS 'Indica si este modelo es el modelo por defecto unico del proveedor';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_models"."deleted_at" IS 'Fecha de borrado logico del modelo cuando conserva historial de uso';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_models"."deleted_by" IS 'Identificador del operador que ejecuto el borrado logico del modelo';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_platform_keys"."temperature" IS 'Temperatura de respuesta configurada para la credencial de plataforma (0.0 a 2.0)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_platform_keys"."max_tokens" IS 'Limite maximo de tokens de salida configurado para la credencial de plataforma (64 a 8192)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_platform_keys"."priority_role" IS 'Rol de prioridad de enrutamiento de la llave (primary, secondary o standby)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_ai_providers"."priority_role" IS 'Rol de prioridad de enrutamiento BYOK del comercio (primary, secondary o standby)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_usage_events"."failover_used" IS 'Indica si la inferencia se completo mediante conmutacion automatica al respaldo secundario';