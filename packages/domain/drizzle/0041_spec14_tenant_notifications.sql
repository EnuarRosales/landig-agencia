CREATE TABLE "admin"."tenant_in_app_notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"action_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_in_app_notifications_severity_check" CHECK (severity IN ('info', 'warning', 'success', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"custom_recipient_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."email_events" ADD COLUMN "tenant_configurable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_in_app_notifications" ADD CONSTRAINT "tenant_in_app_notifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_notification_preferences" ADD CONSTRAINT "tenant_notification_preferences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_notification_preferences" ADD CONSTRAINT "tenant_notification_preferences_event_key_email_events_key_fk" FOREIGN KEY ("event_key") REFERENCES "admin"."email_events"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_in_app_notifications_client_read_created_idx" ON "admin"."tenant_in_app_notifications" USING btree ("client_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_notification_preferences_client_event_unique" ON "admin"."tenant_notification_preferences" USING btree ("client_id","event_key");--> statement-breakpoint
CREATE INDEX "tenant_notification_preferences_client_idx" ON "admin"."tenant_notification_preferences" USING btree ("client_id");--> statement-breakpoint
COMMENT ON COLUMN "admin"."email_events"."tenant_configurable" IS 'Indica si el comercio puede desactivar correos o personalizar destinatario para el evento desde /workspace/notifications.';--> statement-breakpoint
COMMENT ON TABLE "admin"."tenant_notification_preferences" IS 'Preferencias operativas de alertas en plataforma y correo electrónico por comercio y evento (SPEC-14).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_notification_preferences"."client_id" IS 'Identificador del comercio propietario de la preferencia.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_notification_preferences"."event_key" IS 'Clave del evento de notificación referenciada contra admin.email_events.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_notification_preferences"."email_enabled" IS 'Habilita o deshabilita el despacho por correo electrónico cuando el evento es configurable.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_notification_preferences"."in_app_enabled" IS 'Habilita o deshabilita la creación de alertas in-app en la bandeja del comercio.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_notification_preferences"."custom_recipient_email" IS 'Correo destinatario específico opcional para recibir alertas de este evento en lugar del correo comercial.';--> statement-breakpoint
COMMENT ON TABLE "admin"."tenant_in_app_notifications" IS 'Bandeja de notificaciones operativas in-app visibles dentro del workspace del comercio (SPEC-14).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."client_id" IS 'Identificador del comercio destinatario de la notificación.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."event_key" IS 'Clave funcional del evento origen de la notificación.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."title" IS 'Título resumido de la alerta operativa mostrado en el Centro De Mensajes.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."body" IS 'Detalle descriptivo de la alerta operativa para el comercio.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."severity" IS 'Nivel visual de severidad: info, warning, success o critical.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."action_url" IS 'Ruta interna relativa del workspace para navegar directamente al recurso relacionado.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_in_app_notifications"."read_at" IS 'Marca temporal en que la notificación fue leída por el comercio; NULL indica no leída.';