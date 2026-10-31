CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "admin"."client_business_info" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"payment_methods" jsonb DEFAULT '["transferencia","contraentrega"]'::jsonb NOT NULL,
	"returns_policy" text,
	"warranty_policy" text,
	"shipping_policy" jsonb DEFAULT '{"freeShipping":false,"defaultCostCents":0}'::jsonb NOT NULL,
	"order_message" text,
	"faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bot_preset" text DEFAULT 'natural_rhythm' NOT NULL,
	"reminders_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."client_media" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_client_media_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "client_media_size_check" CHECK (size_bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."client_usage" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"used_value" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_client_usage_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "client_usage_used_value_check" CHECK (used_value >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."product_embeddings" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"composed_text" text NOT NULL,
	"embedding" halfvec(1536),
	"model_code" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_product_embeddings_pkey" PRIMARY KEY("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "admin"."product_media" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_product_media_pkey" PRIMARY KEY("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "admin"."products" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"sku" text,
	"gtin" text,
	"mpn" text,
	"item_group_id" text,
	"source_system" text DEFAULT 'manual' NOT NULL,
	"source_external_id" text,
	"source_url" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"brand" text,
	"kind" text DEFAULT 'physical' NOT NULL,
	"condition" text DEFAULT 'new' NOT NULL,
	"availability" text DEFAULT 'in_stock' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"price_cents" bigint NOT NULL,
	"sale_price_cents" bigint,
	"currency" char(3),
	"price_note" text,
	"category" text,
	"google_product_category" text,
	"color" text,
	"size" text,
	"material" text,
	"gender" text,
	"age_group" text,
	"pattern" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prompt" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_term" text,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivery_group_id" uuid,
	"free_shipping" boolean DEFAULT false NOT NULL,
	"shipping_cost_cents" bigint,
	"source_share_id" uuid,
	"source_version" integer,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_products_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "products_kind_check" CHECK (kind IN ('physical', 'digital', 'service')),
	CONSTRAINT "products_condition_check" CHECK (condition IN ('new', 'refurbished', 'used')),
	CONSTRAINT "products_availability_check" CHECK (availability IN ('in_stock', 'out_of_stock', 'preorder', 'backorder')),
	CONSTRAINT "products_status_check" CHECK (status IN ('draft', 'published', 'archived')),
	CONSTRAINT "products_price_check" CHECK (price_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_labels" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"chatwoot_label_id" integer,
	"title" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#1F93FF' NOT NULL,
	"show_on_sidebar" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'mocter_custom' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_tenant_labels_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "tenant_labels_origin_check" CHECK (origin IN ('chatwoot_default', 'chatwoot_custom', 'mocter_custom', 'mocter_default')),
	CONSTRAINT "tenant_labels_state_check" CHECK (state IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_users" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'tenant_agent' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_tenant_users_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "tenant_users_role_check" CHECK (role IN ('tenant_owner', 'tenant_agent')),
	CONSTRAINT "tenant_users_status_check" CHECK (status IN ('active', 'left', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_media_one_per_client" ON "admin"."client_media" USING btree ("client_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_usage_one_per_dimension" ON "admin"."client_usage" USING btree ("client_id","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "product_embeddings_chunk_unique" ON "admin"."product_embeddings" USING btree ("client_id","product_id","chunk_index");--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_one_per_product" ON "admin"."product_media" USING btree ("client_id","product_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_external_source_unique" ON "admin"."products" USING btree ("client_id","source_system","source_external_id") WHERE source_system <> 'manual' AND source_external_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_labels_client_title_unique" ON "admin"."tenant_labels" USING btree ("client_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_labels_client_cw_id_unique" ON "admin"."tenant_labels" USING btree ("client_id","chatwoot_label_id") WHERE chatwoot_label_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tenant_users_by_client_user" ON "admin"."tenant_users" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_one_owner" ON "admin"."tenant_users" USING btree ("client_id") WHERE role = 'tenant_owner' AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_one_active_membership" ON "admin"."tenant_users" USING btree ("user_id") WHERE status = 'active';