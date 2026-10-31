CREATE TABLE "admin"."ai_assist_fields" (
	"field_key" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"column_name" text NOT NULL,
	"labels" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "ai_assist_fields_key_non_empty" CHECK (length(trim(field_key)) > 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."ai_assist_prompts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"field_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"master_prompt" text NOT NULL,
	"input_hint" text NOT NULL,
	"output_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "ai_assist_prompts_status_check" CHECK (status IN ('draft', 'active', 'retired'))
);
--> statement-breakpoint
ALTER TABLE "admin"."ai_assist_prompts" ADD CONSTRAINT "ai_assist_prompts_field_key_ai_assist_fields_field_key_fk" FOREIGN KEY ("field_key") REFERENCES "admin"."ai_assist_fields"("field_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_assist_prompts_field_version_unique" ON "admin"."ai_assist_prompts" USING btree ("field_key","version");