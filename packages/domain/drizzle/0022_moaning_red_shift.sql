CREATE TABLE "admin"."bot_followup_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"followup_id" uuid NOT NULL,
	"prospect_contact_id" uuid NOT NULL,
	"chatwoot_conversation_id" integer NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"next_send_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bot_followup_runs_status_check" CHECK (status IN ('running', 'completed', 'stopped'))
);
--> statement-breakpoint
CREATE TABLE "admin"."bot_followup_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"followup_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bot_followup_steps_position_check" CHECK (position >= 1 AND position <= 10),
	CONSTRAINT "bot_followup_steps_delay_check" CHECK (delay_minutes >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."bot_followups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"bot_id" uuid,
	"name" text NOT NULL,
	"origin" text DEFAULT 'tenant_custom' NOT NULL,
	"trigger_inactivity_minutes" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bot_followups_origin_check" CHECK (origin IN ('platform_default', 'tenant_custom')),
	CONSTRAINT "bot_followups_status_check" CHECK (status IN ('draft', 'active', 'paused')),
	CONSTRAINT "bot_followups_trigger_inactivity_check" CHECK (trigger_inactivity_minutes > 0)
);
--> statement-breakpoint
ALTER TABLE "admin"."bot_followup_runs" ADD CONSTRAINT "bot_followup_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bot_followup_runs" ADD CONSTRAINT "bot_followup_runs_followup_id_bot_followups_id_fk" FOREIGN KEY ("followup_id") REFERENCES "admin"."bot_followups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bot_followup_steps" ADD CONSTRAINT "bot_followup_steps_followup_id_bot_followups_id_fk" FOREIGN KEY ("followup_id") REFERENCES "admin"."bot_followups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bot_followups" ADD CONSTRAINT "bot_followups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bot_followups" ADD CONSTRAINT "bot_followups_bot_id_tenant_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "admin"."tenant_bots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_followup_runs_client_status_idx" ON "admin"."bot_followup_runs" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "bot_followup_runs_prospect_idx" ON "admin"."bot_followup_runs" USING btree ("client_id","prospect_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_followup_steps_followup_position_unique" ON "admin"."bot_followup_steps" USING btree ("followup_id","position");