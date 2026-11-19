CREATE TABLE "admin"."promotion_targets" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"target_type" varchar(24) NOT NULL,
	"product_id" uuid,
	"category_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_promotion_targets_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "promotion_targets_type_check" CHECK (target_type IN ('product', 'category')),
	CONSTRAINT "promotion_targets_payload_consistency_check" CHECK ((target_type = 'product' AND product_id IS NOT NULL AND category_name IS NULL) OR (target_type = 'category' AND category_name IS NOT NULL AND product_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "admin"."promotions" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text,
	"scope_type" varchar(24) NOT NULL,
	"discount_type" varchar(24) NOT NULL,
	"discount_value" bigint NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"max_discounted_units" integer,
	"discounted_units_sold" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_promotions_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "promotions_scope_type_check" CHECK (scope_type IN ('all_catalog', 'category', 'product')),
	CONSTRAINT "promotions_discount_type_check" CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed_price')),
	CONSTRAINT "promotions_discount_value_check" CHECK (discount_value > 0),
	CONSTRAINT "promotions_percentage_range_check" CHECK (discount_type <> 'percentage' OR (discount_value >= 1 AND discount_value <= 95)),
	CONSTRAINT "promotions_fixed_price_scope_check" CHECK (discount_type <> 'fixed_price' OR scope_type = 'product'),
	CONSTRAINT "promotions_ends_after_starts_check" CHECK (ends_at IS NULL OR ends_at > starts_at),
	CONSTRAINT "promotions_max_discounted_units_check" CHECK (max_discounted_units IS NULL OR max_discounted_units > 0),
	CONSTRAINT "promotions_discounted_units_sold_check" CHECK (discounted_units_sold >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD COLUMN "promotion_name" text;--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD COLUMN "original_unit_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "promotion_quota_deducted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."promotion_targets" ADD CONSTRAINT "promotion_targets_promotion_fk" FOREIGN KEY ("client_id","promotion_id") REFERENCES "admin"."promotions"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."promotion_targets" ADD CONSTRAINT "promotion_targets_product_fk" FOREIGN KEY ("client_id","product_id") REFERENCES "admin"."products"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_promotion_targets_promotion" ON "admin"."promotion_targets" USING btree ("client_id","promotion_id");--> statement-breakpoint
CREATE INDEX "idx_promotion_targets_product" ON "admin"."promotion_targets" USING btree ("client_id","product_id") WHERE product_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_promotion_targets_category" ON "admin"."promotion_targets" USING btree ("client_id",lower("category_name")) WHERE category_name IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_promotions_client_active_window" ON "admin"."promotions" USING btree ("client_id","is_active","starts_at","ends_at") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD CONSTRAINT "order_items_promotion_fk" FOREIGN KEY ("client_id","promotion_id") REFERENCES "admin"."promotions"("client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_items_client_promotion" ON "admin"."order_items" USING btree ("client_id","promotion_id") WHERE promotion_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD CONSTRAINT "order_items_original_unit_price_cents_check" CHECK (original_unit_price_cents IS NULL OR original_unit_price_cents >= 0);