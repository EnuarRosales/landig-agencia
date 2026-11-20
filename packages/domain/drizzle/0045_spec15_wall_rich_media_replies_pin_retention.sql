CREATE TABLE "admin"."community_platform_settings" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"feed_retention_days" integer DEFAULT 90,
	"last_retention_purge_at" timestamp with time zone,
	"last_retention_purged_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "community_platform_settings_retention_days_check" CHECK (feed_retention_days IS NULL OR feed_retention_days >= 1)
);
--> statement-breakpoint
CREATE TABLE "admin"."feed_post_replies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"post_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_client_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD COLUMN "body_format" varchar(16) DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD COLUMN "video_embed_url" text;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD COLUMN "pinned_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."community_platform_settings" ADD CONSTRAINT "community_platform_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_post_replies" ADD CONSTRAINT "feed_post_replies_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "admin"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_post_replies" ADD CONSTRAINT "feed_post_replies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_post_replies" ADD CONSTRAINT "feed_post_replies_author_client_id_clients_id_fk" FOREIGN KEY ("author_client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_post_replies" ADD CONSTRAINT "feed_post_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_post_replies_post_created_idx" ON "admin"."feed_post_replies" USING btree ("post_id","created_at");--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD CONSTRAINT "feed_posts_media_id_media_catalog_id_fk" FOREIGN KEY ("media_id") REFERENCES "admin"."media_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD CONSTRAINT "feed_posts_pinned_by_user_id_users_id_fk" FOREIGN KEY ("pinned_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_posts_one_pinned_per_org_unique" ON "admin"."feed_posts" USING btree ("organization_id") WHERE is_pinned = true;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD CONSTRAINT "feed_posts_body_format_check" CHECK (body_format IN ('plain', 'html'));--> statement-breakpoint
INSERT INTO "admin"."community_platform_settings" ("id", "feed_retention_days") VALUES ('default', 90) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
COMMENT ON TABLE "admin"."community_platform_settings" IS 'Configuración global SaaS de retención para publicaciones del muro comunitario (SPEC-15-D14).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_platform_settings"."feed_retention_days" IS 'Días de retención de publicaciones antes de ser elegibles para purga; NULL indica conservación indefinida.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_platform_settings"."last_retention_purge_at" IS 'Marca temporal de la última ejecución exitosa de purga de retención.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_platform_settings"."last_retention_purged_count" IS 'Cantidad de publicaciones eliminadas en la última corrida de purga.';--> statement-breakpoint
COMMENT ON TABLE "admin"."feed_post_replies" IS 'Respuestas con texto y emojis sobre publicaciones del muro comunitario, con borrado en cascada (SPEC-15-D13).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_post_replies"."post_id" IS 'Publicación padre; su eliminación o purga elimina en cascada todas sus respuestas.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_post_replies"."body" IS 'Contenido textual de la respuesta con soporte Unicode para emojis.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_posts"."body_format" IS 'Formato del cuerpo: plain (texto plano) o html (fragmento sanitizado WYSIWYG).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_posts"."media_id" IS 'Imagen destacada opcional vinculada al catálogo multimedia del autor con cargo a storage_bytes.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_posts"."video_embed_url" IS 'URL normalizada de video incrustado permitida (YouTube/Vimeo).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_posts"."is_pinned" IS 'Indica si la publicación está fijada en primer lugar dentro de su comunidad.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_posts"."pinned_at" IS 'Fecha y hora en que se fijó la publicación.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."feed_posts"."pinned_by_user_id" IS 'Usuario moderador que fijó la publicación.';