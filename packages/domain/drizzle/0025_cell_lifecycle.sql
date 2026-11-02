ALTER TABLE "admin"."cells" DROP CONSTRAINT IF EXISTS "cells_status_check";--> statement-breakpoint
ALTER TABLE "admin"."cells" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "topology_type" text DEFAULT 'remote_vps' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "app_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "private_ip" text;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "public_ip" text;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "working_dir" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "deploy_user" text DEFAULT 'deploy:1000' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "cell_secrets_ciphertext" "bytea" DEFAULT '\x01'::bytea NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "cell_secrets_key_id" text DEFAULT 'k-initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "health_status" jsonb;--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "last_health_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."cells" DROP CONSTRAINT IF EXISTS "cells_topology_check";--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD CONSTRAINT "cells_topology_check" CHECK (topology_type IN ('local_compose', 'remote_vps'));--> statement-breakpoint
ALTER TABLE "admin"."cells" DROP CONSTRAINT IF EXISTS "cells_secrets_payload_check";--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD CONSTRAINT "cells_secrets_payload_check" CHECK (octet_length(cell_secrets_ciphertext) > 0 AND length(cell_secrets_key_id) > 0);--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD CONSTRAINT "cells_status_check" CHECK (status IN ('draft', 'provisioning', 'verifying', 'active', 'draining', 'readonly', 'maintenance', 'error_connection'));--> statement-breakpoint
COMMENT ON TABLE "admin"."cells" IS 'Catálogo y ciclo de vida de celdas autónomas de datos (DAT-001 §3.3 / §3.6).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."status" IS 'Estado del ciclo de vida: draft → provisioning → verifying → active, o estados operativos/errores.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."topology_type" IS 'Topología de despliegue v1: remote_vps o local_compose.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."app_url" IS 'URL privada de la capa de aplicación de la celda; destino del healthcheck HTTP.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."private_ip" IS 'IP privada de inventario; nunca destino de probes del handshake.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."public_ip" IS 'IP pública de inventario; nunca se usa para conectar ni publicar PostgreSQL.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."working_dir" IS 'Directorio canónico /opt/<name-cell> para despliegue en producción.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."deploy_user" IS 'Usuario fijo de despliegue y operación de Compose (deploy:1000).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."cell_secrets_ciphertext" IS 'Paquete de secretos celulares cifrado con AES-256-GCM (nonce+tag+ciphertext).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."cell_secrets_key_id" IS 'Identificador de la clave de cifrado usada para el paquete de secretos.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."health_status" IS 'Diagnóstico saneado del último healthcheck; nunca contiene secretos.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."last_health_check_at" IS 'Marca de tiempo del último healthcheck ejecutado.';
