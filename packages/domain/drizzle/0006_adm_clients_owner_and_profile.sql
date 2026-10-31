ALTER TABLE "admin"."clients" ADD COLUMN "owner_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "contact_email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "quota_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "timezone" text DEFAULT 'America/Bogota' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "social_links" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD CONSTRAINT "clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_active_client_id_clients_id_fk" FOREIGN KEY ("active_client_id") REFERENCES "admin"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_one_live_owner" ON "admin"."clients" USING btree ("owner_user_id") WHERE lifecycle_status <> 'baja';--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD CONSTRAINT "clients_contact_email_lowercase_check" CHECK (contact_email = lower(contact_email));--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD CONSTRAINT "clients_quota_version_check" CHECK (quota_version > 0);--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD CONSTRAINT "clients_social_links_object_check" CHECK (jsonb_typeof(social_links) = 'object');