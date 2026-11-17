CREATE TABLE "admin"."email_layout_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"locale" text NOT NULL,
	"header_html" text NOT NULL,
	"footer_html" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_layout_configs_locale_unique" UNIQUE("locale"),
	CONSTRAINT "email_layout_configs_locale_check" CHECK (locale IN ('es', 'en'))
);--> statement-breakpoint
COMMENT ON TABLE "admin"."email_layout_configs" IS 'Configuración global institucional bilingüe de encabezado (body.header) y pie de página (body.footer) heredado por las plantillas de correo (SPEC-14).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."email_layout_configs"."locale" IS 'Idioma del layout global: es o en.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."email_layout_configs"."header_html" IS 'Fragmento HTML del encabezado institucional heredado automáticamente en cada notificación.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."email_layout_configs"."footer_html" IS 'Fragmento HTML del pie de página institucional heredado automáticamente en cada notificación.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."email_layout_configs"."is_enabled" IS 'Interruptor global para envolver o no las plantillas con este encabezado y pie institucional.';--> statement-breakpoint
UPDATE "admin"."email_events"
SET "tenant_configurable" = CASE
  WHEN "key" IN ('community.digest', 'community.join_accepted', 'referral.registered', 'tenant.inventory.low_stock') THEN true
  ELSE false
END;--> statement-breakpoint
UPDATE "admin"."email_events"
SET "description" = 'Confirmación de admisión del miembro en una comunidad.'
WHERE "key" = 'community.join_accepted';--> statement-breakpoint
UPDATE "admin"."email_events"
SET "description" = 'Correo de bienvenida al completar el alta del comercio.'
WHERE "key" = 'tenant.welcome';
