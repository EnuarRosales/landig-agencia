CREATE TABLE "admin"."product_bundle_items" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"bundle_product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_product_bundle_items_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "product_bundle_items_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "product_bundle_items_no_self_ref_check" CHECK (bundle_product_id <> component_product_id)
);
--> statement-breakpoint
ALTER TABLE "admin"."products" DROP CONSTRAINT IF EXISTS "products_status_check";--> statement-breakpoint
ALTER TABLE "admin"."products" DROP CONSTRAINT IF EXISTS "products_cost_price_non_negative_check";--> statement-breakpoint
ALTER TABLE "admin"."products" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."products" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."product_media" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."product_media" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "admin"."products" SET "cost_price_cents" = 0 WHERE "cost_price_cents" IS NULL;--> statement-breakpoint
UPDATE "admin"."products" SET "status" = CASE WHEN "status" = 'published' THEN 'active' WHEN "status" = 'archived' THEN 'inactive' ELSE "status" END WHERE "status" IN ('published', 'archived');--> statement-breakpoint
UPDATE "admin"."products" SET "attributes" = '[]'::jsonb WHERE jsonb_typeof("attributes") IS DISTINCT FROM 'array';--> statement-breakpoint
ALTER TABLE "admin"."products" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "admin"."products" ALTER COLUMN "cost_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "admin"."products" ALTER COLUMN "cost_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."products" ALTER COLUMN "attributes" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "admin"."product_media" ADD COLUMN "media_kind" text DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."product_media" ADD COLUMN "is_cover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."products" ADD COLUMN "composition_type" text DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."products" ADD COLUMN "bot_master_prompt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."products" ADD COLUMN "stock_quantity" integer;--> statement-breakpoint
ALTER TABLE "admin"."products" ADD COLUMN "min_stock_threshold" integer;--> statement-breakpoint
ALTER TABLE "admin"."products" ADD COLUMN "low_stock_alert_sent_at" timestamp with time zone;--> statement-breakpoint
UPDATE "admin"."products" SET "bot_master_prompt" = COALESCE("prompt", '') WHERE "prompt" IS NOT NULL;--> statement-breakpoint
WITH ranked_media AS (
	SELECT "id", ROW_NUMBER() OVER (PARTITION BY "client_id", "product_id" ORDER BY "sort_order" ASC, "created_at" ASC) AS rn
	FROM "admin"."product_media"
	WHERE "media_kind" = 'image'
)
UPDATE "admin"."product_media" pm
SET "is_cover" = true
FROM ranked_media rm
WHERE pm."id" = rm."id" AND rm.rn = 1 AND NOT EXISTS (
	SELECT 1 FROM "admin"."product_media" existing
	WHERE existing."client_id" = pm."client_id" AND existing."product_id" = pm."product_id" AND existing."is_cover" = true
);--> statement-breakpoint
ALTER TABLE "admin"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."product_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."product_media" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundle_fk" FOREIGN KEY ("client_id","bundle_product_id") REFERENCES "admin"."products"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."product_bundle_items" ADD CONSTRAINT "product_bundle_items_component_fk" FOREIGN KEY ("client_id","component_product_id") REFERENCES "admin"."products"("client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_bundle_items_unique_pair" ON "admin"."product_bundle_items" USING btree ("client_id","bundle_product_id","component_product_id");--> statement-breakpoint
CREATE INDEX "product_bundle_items_by_component_idx" ON "admin"."product_bundle_items" USING btree ("client_id","component_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_one_cover_per_product" ON "admin"."product_media" USING btree ("client_id","product_id") WHERE is_cover = true;--> statement-breakpoint
ALTER TABLE "admin"."product_media" ADD CONSTRAINT "product_media_kind_check" CHECK (media_kind IN ('image', 'video', 'audio', 'pdf'));--> statement-breakpoint
ALTER TABLE "admin"."product_media" ADD CONSTRAINT "product_media_cover_image_check" CHECK (NOT is_cover OR media_kind = 'image');--> statement-breakpoint
ALTER TABLE "admin"."products" ADD CONSTRAINT "products_composition_type_check" CHECK (composition_type IN ('simple', 'combo'));--> statement-breakpoint
ALTER TABLE "admin"."products" ADD CONSTRAINT "products_stock_quantity_check" CHECK (stock_quantity IS NULL OR stock_quantity >= 0);--> statement-breakpoint
ALTER TABLE "admin"."products" ADD CONSTRAINT "products_min_stock_threshold_check" CHECK (min_stock_threshold IS NULL OR min_stock_threshold >= 0);--> statement-breakpoint
ALTER TABLE "admin"."products" ADD CONSTRAINT "products_status_check" CHECK (status IN ('active', 'inactive', 'draft'));--> statement-breakpoint
ALTER TABLE "admin"."products" ADD CONSTRAINT "products_cost_price_non_negative_check" CHECK (cost_price_cents >= 0);
