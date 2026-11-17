ALTER TABLE "admin"."tenant_users" ADD COLUMN "grant_chatwoot_access" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_users" ADD COLUMN "chatwoot_agent_id" integer;