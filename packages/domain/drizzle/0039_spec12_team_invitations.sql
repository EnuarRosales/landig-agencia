ALTER TABLE "admin"."tenant_invitations" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "admin"."tenant_invitations" ADD COLUMN "grant_chatwoot_access" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_invitations_client_email_pending_unique" ON "admin"."tenant_invitations" USING btree ("client_id","email") WHERE status = 'pending';