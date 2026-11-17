CREATE TABLE "admin"."community_leader_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"max_owned_communities" integer,
	"proposed_community_name" varchar(180),
	"business_model" text,
	"review_notes" text,
	"requested_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "community_leader_authorizations_status_check" CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
	CONSTRAINT "community_leader_authorizations_max_owned_check" CHECK (max_owned_communities IS NULL OR max_owned_communities > 0)
);
--> statement-breakpoint
DROP INDEX "admin"."organization_members_one_active_per_client";--> statement-breakpoint
DROP INDEX "admin"."organizations_originator_unique";--> statement-breakpoint
ALTER TABLE "admin"."organization_invitations" ADD COLUMN "target_client_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."organization_invitations" ADD COLUMN "role" varchar(20) DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "slug" varchar(140);--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "category" varchar(80);--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "visibility" varchar(24) DEFAULT 'private_invite' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "share_policy" varchar(24) DEFAULT 'leaders_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "require_share_approval" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "invite_code" varchar(32);--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD COLUMN "status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE "admin"."organizations"
SET
  "slug" = COALESCE(
    "slug",
    trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')) || '-' || left("id"::text, 8)
  ),
  "invite_code" = COALESCE("invite_code", upper(replace(left("id"::text, 12), '-', '')));--> statement-breakpoint
ALTER TABLE "admin"."organizations" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ALTER COLUMN "invite_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."product_share_versions" ADD COLUMN "changelog" text;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD COLUMN "moderation_status" varchar(24) DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD COLUMN "moderated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "admin"."community_leader_authorizations" ADD CONSTRAINT "community_leader_authorizations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."community_leader_authorizations" ADD CONSTRAINT "community_leader_authorizations_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."community_leader_authorizations" ADD CONSTRAINT "community_leader_authorizations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_leader_authorizations_client_unique" ON "admin"."community_leader_authorizations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "community_leader_authorizations_status_idx" ON "admin"."community_leader_authorizations" USING btree ("status");--> statement-breakpoint
ALTER TABLE "admin"."organization_invitations" ADD CONSTRAINT "organization_invitations_target_client_id_clients_id_fk" FOREIGN KEY ("target_client_id") REFERENCES "admin"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD CONSTRAINT "product_shares_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_posts_org_status_idx" ON "admin"."feed_posts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "organization_invitations_target_client_idx" ON "admin"."organization_invitations" USING btree ("target_client_id","status");--> statement-breakpoint
CREATE INDEX "organization_join_requests_org_status_idx" ON "admin"."organization_join_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "organization_join_requests_client_idx" ON "admin"."organization_join_requests" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_client_active_unique" ON "admin"."organization_members" USING btree ("organization_id","client_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "organization_members_client_status_idx" ON "admin"."organization_members" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "admin"."organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_invite_code_unique" ON "admin"."organizations" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "organizations_originator_idx" ON "admin"."organizations" USING btree ("originator_client_id");--> statement-breakpoint
CREATE INDEX "organizations_visibility_status_idx" ON "admin"."organizations" USING btree ("visibility","status");--> statement-breakpoint
CREATE INDEX "product_adoptions_share_active_idx" ON "admin"."product_adoptions" USING btree ("share_id","link_active");--> statement-breakpoint
CREATE INDEX "product_shares_org_status_idx" ON "admin"."product_shares" USING btree ("organization_id","status","moderation_status");--> statement-breakpoint
ALTER TABLE "admin"."organization_invitations" ADD CONSTRAINT "organization_invitations_role_check" CHECK (role IN ('member', 'co_leader'));--> statement-breakpoint
ALTER TABLE "admin"."organization_members" ADD CONSTRAINT "organization_members_role_check" CHECK (role IN ('originator', 'co_leader', 'member'));--> statement-breakpoint
ALTER TABLE "admin"."organization_members" ADD CONSTRAINT "organization_members_status_check" CHECK (status IN ('active', 'left', 'suspended'));--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD CONSTRAINT "organizations_visibility_check" CHECK (visibility IN ('private_invite', 'request_to_join'));--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD CONSTRAINT "organizations_share_policy_check" CHECK (share_policy IN ('leaders_only', 'collaborative'));--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD CONSTRAINT "organizations_moderation_mode_check" CHECK (moderation_mode IN ('pre', 'post', 'none'));--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD CONSTRAINT "organizations_status_check" CHECK (status IN ('active', 'suspended'));--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD CONSTRAINT "product_shares_moderation_status_check" CHECK (moderation_status IN ('approved', 'pending_review', 'rejected'));--> statement-breakpoint
GRANT ALL ON TABLE "admin"."community_leader_authorizations" TO mocter_migrator;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "admin"."community_leader_authorizations" TO mocter_admin;--> statement-breakpoint
COMMENT ON TABLE "admin"."community_leader_authorizations" IS 'Autorizaciones aprobadas o pendientes por plataforma para que un comercio cree y lidere comunidades (SPEC-15).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_leader_authorizations"."status" IS 'Estado de la autorización de líder: pending, approved, rejected o revoked.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_leader_authorizations"."max_owned_communities" IS 'Cupo máximo de comunidades que el comercio puede originar; NULL significa ilimitado.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_leader_authorizations"."proposed_community_name" IS 'Nombre propuesto por el comercio al solicitar habilitación como líder.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."community_leader_authorizations"."business_model" IS 'Descripción del modelo mayorista o red colaborativa enviada por el solicitante.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organizations"."slug" IS 'Identificador legible único de la comunidad para búsquedas y enlaces internos.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organizations"."visibility" IS 'Visibilidad de descubrimiento: private_invite (solo invitación/código) o request_to_join (listada en directorio).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organizations"."share_policy" IS 'Política de publicación de productos: leaders_only (red mayorista) o collaborative (miembros proponen).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organizations"."require_share_approval" IS 'Indica si los productos propuestos por miembros regulares en modo colaborativo requieren aprobación del líder.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organizations"."invite_code" IS 'Código corto único compartible para ingreso rápido de miembros a la comunidad.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organizations"."status" IS 'Estado operativo de la comunidad: active o suspended.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organization_invitations"."target_client_id" IS 'Identificador opcional del comercio invitado cuando ya existe en la plataforma.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."organization_invitations"."role" IS 'Rol ofrecido en la invitación: member o co_leader.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."product_shares"."moderation_status" IS 'Estado de moderación del producto compartido: approved, pending_review o rejected.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."product_share_versions"."changelog" IS 'Nota descriptiva opcional redactada por el autor al publicar una nueva versión.';--> statement-breakpoint
INSERT INTO "admin"."plan_features" ("key", "label", "description", "feature_type", "created_by", "updated_by")
VALUES (
  'community_feed',
  '{"es":"Comunidad de Comercios y Catálogo Compartido","en":"Merchant Community & Shared Catalog"}'::jsonb,
  '{"es":"Habilita la participación en redes de comercios, directorio y clonación de catálogo.","en":"Enables participation in merchant networks, community directory and catalog cloning."}'::jsonb,
  'boolean',
  'migration',
  'migration'
)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "admin"."plan_feature_values" ("plan_id", "feature_key", "enabled", "value", "created_by", "updated_by")
SELECT p."id", 'community_feed', true, 'true'::jsonb, 'migration', 'migration'
FROM "admin"."plans" p
WHERE p."status" IN ('active', 'draft')
ON CONFLICT ("plan_id", "feature_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "admin"."email_events" ("key", "category", "description", "variables_schema", "default_sender_key", "is_enabled", "is_system", "tenant_configurable", "created_by", "updated_by")
VALUES
  (
    'community.leader_status',
    'community',
    'Notificación de aprobación, rechazo o revocación de solicitud de líder de comunidad.',
    '["tenant_name","status_label","max_communities","review_notes","community_url"]'::jsonb,
    (SELECT "key" FROM "admin"."email_senders" WHERE "key" = 'comunidad' LIMIT 1),
    true,
    false,
    false,
    'migration',
    'migration'
  ),
  (
    'community.invited',
    'community',
    'Invitación directa a un comercio para unirse a una comunidad.',
    '["tenant_name","community_name","inviter_name","role_label","invite_url"]'::jsonb,
    (SELECT "key" FROM "admin"."email_senders" WHERE "key" = 'comunidad' LIMIT 1),
    true,
    false,
    true,
    'migration',
    'migration'
  ),
  (
    'community.product_version_published',
    'community',
    'Aviso de nueva versión disponible para un producto clonado desde una comunidad.',
    '["tenant_name","community_name","product_name","version","changelog","community_url"]'::jsonb,
    (SELECT "key" FROM "admin"."email_senders" WHERE "key" = 'comunidad' LIMIT 1),
    true,
    false,
    true,
    'migration',
    'migration'
  )
ON CONFLICT ("key") DO NOTHING;
