CREATE TABLE "admin"."tenant_payment_channels" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel_code" text NOT NULL,
	"display_name" text NOT NULL,
	"account_identifier" text,
	"account_holder_name" text,
	"instructions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_tenant_payment_channels_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "tenant_payment_channels_code_lowercase_check" CHECK (channel_code = lower(channel_code)),
	CONSTRAINT "tenant_payment_channels_sort_order_check" CHECK (sort_order >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "payment_channel_id" uuid;--> statement-breakpoint
CREATE INDEX "tenant_payment_channels_client_active_sort_idx" ON "admin"."tenant_payment_channels" USING btree ("client_id","is_active","sort_order");