CREATE TABLE "admin"."clone_sync_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"adoption_id" uuid NOT NULL,
	"attribute_key" varchar(64) NOT NULL,
	"auto_sync" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."organization_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"originator_client_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"moderation_mode" varchar(20) DEFAULT 'pre' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."product_adoptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"share_id" uuid NOT NULL,
	"adopter_client_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"clone_product_id" uuid NOT NULL,
	"clone_cell_id" varchar(64) NOT NULL,
	"adopted_version" integer NOT NULL,
	"link_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."product_share_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"share_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"changed_attributes" jsonb DEFAULT '[]'::jsonb,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."product_shares" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sharer_client_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"source_product_id" uuid NOT NULL,
	"source_cell_id" varchar(64) NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"adoption_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"mode" varchar(20) DEFAULT 'manual' NOT NULL,
	"attributes" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."clone_sync_policies" ADD CONSTRAINT "clone_sync_policies_adoption_id_product_adoptions_id_fk" FOREIGN KEY ("adoption_id") REFERENCES "admin"."product_adoptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."organization_members" ADD CONSTRAINT "organization_members_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."organizations" ADD CONSTRAINT "organizations_originator_client_id_clients_id_fk" FOREIGN KEY ("originator_client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_adoptions" ADD CONSTRAINT "product_adoptions_share_id_product_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "admin"."product_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_adoptions" ADD CONSTRAINT "product_adoptions_adopter_client_id_clients_id_fk" FOREIGN KEY ("adopter_client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_adoptions" ADD CONSTRAINT "product_adoptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_share_versions" ADD CONSTRAINT "product_share_versions_share_id_product_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "admin"."product_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD CONSTRAINT "product_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD CONSTRAINT "product_shares_sharer_client_id_clients_id_fk" FOREIGN KEY ("sharer_client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_shares" ADD CONSTRAINT "product_shares_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."sync_runs" ADD CONSTRAINT "sync_runs_adoption_id_product_adoptions_id_fk" FOREIGN KEY ("adoption_id") REFERENCES "admin"."product_adoptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clone_sync_policies_adoption_attr_unique" ON "admin"."clone_sync_policies" USING btree ("adoption_id","attribute_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_one_active_per_client" ON "admin"."organization_members" USING btree ("client_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_originator_unique" ON "admin"."organizations" USING btree ("originator_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_adoptions_client_clone_unique" ON "admin"."product_adoptions" USING btree ("adopter_client_id","clone_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_share_versions_share_version_unique" ON "admin"."product_share_versions" USING btree ("share_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "product_shares_org_source_unique" ON "admin"."product_shares" USING btree ("organization_id","source_product_id");