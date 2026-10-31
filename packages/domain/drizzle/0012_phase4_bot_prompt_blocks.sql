CREATE TABLE "admin"."bot_prompt_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"block_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bot_prompt_blocks_key_check" CHECK (block_key IN ('core.identity', 'core.personality', 'core.greeting', 'core.media', 'core.splits', 'core.order_flow', 'core.closing', 'core.classifier', 'core.format', 'core.contact_memory')),
	CONSTRAINT "bot_prompt_blocks_status_check" CHECK (status IN ('draft', 'active', 'retired')),
	CONSTRAINT "bot_prompt_blocks_version_check" CHECK (version >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bot_prompt_blocks_key_version_unique" ON "admin"."bot_prompt_blocks" USING btree ("block_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_prompt_blocks_one_active_per_key" ON "admin"."bot_prompt_blocks" USING btree ("block_key") WHERE status = 'active';