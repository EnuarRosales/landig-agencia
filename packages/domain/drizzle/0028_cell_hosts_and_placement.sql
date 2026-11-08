-- 0028_cell_hosts_and_placement.sql
-- CEL-001 Etapa 2 / CEL-T01b (M1 Expandir): Registro de cell_hosts,
-- host_id nullable en cells, y límite de capacidad 100 por celda.

-- 1. Tabla admin.cell_hosts (DAT-001 §3.3 / CEL-001 §3.1)
CREATE TABLE IF NOT EXISTS "admin"."cell_hosts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"deployment_profile" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"connectivity_config_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_hosts_code_unique" UNIQUE("code"),
	CONSTRAINT "cell_hosts_deployment_profile_check" CHECK (deployment_profile IN ('local_development', 'control_plane_vps', 'external_vps')),
	CONSTRAINT "cell_hosts_status_check" CHECK (status IN ('ready', 'maintenance', 'disabled'))
);--> statement-breakpoint

-- 2. Relación cells.host_id hacia admin.cell_hosts (nullable en M1)
ALTER TABLE "admin"."cells" ADD COLUMN IF NOT EXISTS "host_id" uuid;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'cells_host_id_cell_hosts_id_fk'
	) THEN
		ALTER TABLE "admin"."cells" ADD CONSTRAINT "cells_host_id_cell_hosts_id_fk"
			FOREIGN KEY ("host_id") REFERENCES "admin"."cell_hosts"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

-- 3. Capacidad máxima por celda (CEL-RF-002: max_clients entre 1 y 100)
ALTER TABLE "admin"."cells" DROP CONSTRAINT IF EXISTS "cells_max_clients_check";--> statement-breakpoint
ALTER TABLE "admin"."cells" ADD CONSTRAINT "cells_max_clients_check" CHECK (max_clients > 0 AND max_clients <= 100);--> statement-breakpoint

-- 4. Permisos de mínimo privilegio
GRANT ALL ON TABLE "admin"."cell_hosts" TO mocter_migrator;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "admin"."cell_hosts" TO mocter_admin;--> statement-breakpoint

-- 5. Comentarios TSDoc/PostgreSQL (Regla 4.5)
COMMENT ON TABLE "admin"."cell_hosts" IS 'Hosts configurables para placement explícito de celdas desde el Control Plane (DAT-001 §3.3, CEL-001 §3).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cell_hosts"."id" IS 'Identificador estable del host.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cell_hosts"."code" IS 'Código estable y único del host; no contiene credenciales.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cell_hosts"."deployment_profile" IS 'Perfil que el host admite: local_development, control_plane_vps o external_vps.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cell_hosts"."status" IS 'Elegibilidad operativa manual del host: ready, maintenance o disabled.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cell_hosts"."connectivity_config_ref" IS 'Referencia a configuración no secreta de conectividad; los secretos se almacenan por separado.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."cells"."host_id" IS 'Referencia al host físico o virtual asignado en el Control Plane (DAT-001, CEL-001).';

