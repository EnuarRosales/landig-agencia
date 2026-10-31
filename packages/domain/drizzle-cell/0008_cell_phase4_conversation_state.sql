CREATE TABLE "admin"."conversation_state" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"chatwoot_conversation_id" integer NOT NULL,
	"prospect_id" uuid,
	"product_id" uuid,
	"quantity" integer,
	"city" text,
	"customer_name" text,
	"shipping_method" text,
	"stage" text DEFAULT 'greeting' NOT NULL,
	"last_label" text,
	"last_turn_at" timestamp with time zone,
	"config_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_conversation_state_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "conversation_state_stage_check" CHECK (stage IN ('greeting', 'discovery', 'offer', 'order_capture', 'closed', 'handoff')),
	CONSTRAINT "conversation_state_shipping_method_check" CHECK (shipping_method IS NULL OR shipping_method IN ('home', 'office')),
	CONSTRAINT "conversation_state_last_label_check" CHECK (last_label IS NULL OR last_label IN ('lead-frio', 'lead-tibio', 'lead-caliente', 'compra-realizada')),
	CONSTRAINT "conversation_state_quantity_check" CHECK (quantity IS NULL OR quantity > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_state_client_conversation_unique" ON "admin"."conversation_state" USING btree ("client_id","chatwoot_conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_state_client_prospect_idx" ON "admin"."conversation_state" USING btree ("client_id","prospect_id");