ALTER TABLE "admin"."tenant_ai_providers" DROP CONSTRAINT "tenant_ai_providers_status_check";--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD COLUMN "default_model_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD COLUMN "monthly_token_cap" bigint;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD COLUMN "field_key" text;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD COLUMN "status" text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD COLUMN "last_verification_error" text;--> statement-breakpoint
ALTER TABLE "admin"."ai_platform_keys" ADD CONSTRAINT "ai_platform_keys_default_model_id_ai_models_id_fk" FOREIGN KEY ("default_model_id") REFERENCES "admin"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_status_check" CHECK (status IN ('success', 'error'));--> statement-breakpoint
ALTER TABLE "admin"."tenant_ai_providers" ADD CONSTRAINT "tenant_ai_providers_status_check" CHECK (status IN ('active', 'disabled', 'invalid', 'revoked'));--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_platform_keys"."default_model_id" IS 'Modelo de inferencia por defecto asociado a la credencial de plataforma para periodo de prueba';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_platform_keys"."monthly_token_cap" IS 'Limite mensual maximo de tokens permitido para inferencia de plataforma durante el trial';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_usage_events"."field_key" IS 'Identificador del campo de negocio asistido por AI cuando el proposito es assist';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_usage_events"."request_id" IS 'Identificador de correlacion HTTP x-request-id de la peticion que origino el evento';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_usage_events"."latency_ms" IS 'Duracion en milisegundos de la llamada al proveedor LLM';--> statement-breakpoint
COMMENT ON COLUMN "admin"."ai_usage_events"."status" IS 'Resultado operativo de la invocacion al proveedor LLM (success o error)';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_ai_providers"."last_verified_at" IS 'Fecha y hora de la ultima verificacion activa exitosa contra el proveedor externo';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_ai_providers"."last_verification_error" IS 'Ultimo codigo o detalle de error recibido al verificar o invocar la credencial BYOK';
