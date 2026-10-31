CREATE TABLE "admin"."order_events" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cell_order_events_pkey" PRIMARY KEY("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "admin"."order_items" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"product_sku" text,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"tier_min_qty" integer,
	"line_total_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_order_items_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "order_items_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "order_items_unit_price_cents_check" CHECK (unit_price_cents >= 0),
	CONSTRAINT "order_items_line_total_cents_check" CHECK (line_total_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."order_returns" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_order_returns_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "order_returns_amount_cents_check" CHECK (amount_cents >= 0),
	CONSTRAINT "order_returns_status_check" CHECK (status IN ('requested', 'approved', 'received', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "admin"."order_sequences" (
	"client_id" uuid NOT NULL,
	"period" text NOT NULL,
	"current_val" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cell_order_sequences_pkey" PRIMARY KEY("client_id","period")
);
--> statement-breakpoint
CREATE TABLE "admin"."orders" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text NOT NULL,
	"prospect_id" uuid,
	"chatwoot_conversation_id" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"payment_method" text NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"shipping_method" text DEFAULT 'home' NOT NULL,
	"carrier_id" uuid,
	"carrier_name" text,
	"tracking_code" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_document" text,
	"address_line" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"subtotal_cents" bigint NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'COP' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_orders_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "orders_source_check" CHECK (source IN ('bot', 'manual')),
	CONSTRAINT "orders_status_check" CHECK (status IN ('registered', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned')),
	CONSTRAINT "orders_payment_status_check" CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
	CONSTRAINT "orders_shipping_method_check" CHECK (shipping_method IN ('home', 'office')),
	CONSTRAINT "orders_subtotal_cents_check" CHECK (subtotal_cents >= 0),
	CONSTRAINT "orders_shipping_cents_check" CHECK (shipping_cents >= 0),
	CONSTRAINT "orders_discount_cents_check" CHECK (discount_cents >= 0),
	CONSTRAINT "orders_total_cents_check" CHECK (total_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."shipping_carriers" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tracking_url_template" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_shipping_carriers_pkey" PRIMARY KEY("client_id","id")
);
--> statement-breakpoint
CREATE INDEX "order_events_client_order_idx" ON "admin"."order_events" USING btree ("client_id","order_id");--> statement-breakpoint
CREATE INDEX "order_items_client_order_idx" ON "admin"."order_items" USING btree ("client_id","order_id");--> statement-breakpoint
CREATE INDEX "order_returns_client_order_idx" ON "admin"."order_returns" USING btree ("client_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_client_unique" ON "admin"."orders" USING btree ("client_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_cw_conversation_active_unique" ON "admin"."orders" USING btree ("client_id","chatwoot_conversation_id") WHERE chatwoot_conversation_id IS NOT NULL AND status IN ('registered', 'confirmed');--> statement-breakpoint
CREATE INDEX "orders_client_prospect_idx" ON "admin"."orders" USING btree ("client_id","prospect_id");--> statement-breakpoint
CREATE INDEX "orders_client_status_idx" ON "admin"."orders" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_carriers_client_name_unique" ON "admin"."shipping_carriers" USING btree ("client_id","name");