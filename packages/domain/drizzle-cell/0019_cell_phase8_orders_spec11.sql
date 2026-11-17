ALTER TABLE "admin"."orders" DROP CONSTRAINT "orders_status_check";--> statement-breakpoint
UPDATE "admin"."orders" SET "status" = 'pending_confirmation' WHERE "status" = 'registered';--> statement-breakpoint
UPDATE "admin"."orders" SET "status" = 'dispatched' WHERE "status" = 'shipped';--> statement-breakpoint
UPDATE "admin"."order_events" SET "from_status" = 'pending_confirmation' WHERE "from_status" = 'registered';--> statement-breakpoint
UPDATE "admin"."order_events" SET "from_status" = 'dispatched' WHERE "from_status" = 'shipped';--> statement-breakpoint
UPDATE "admin"."order_events" SET "to_status" = 'pending_confirmation' WHERE "to_status" = 'registered';--> statement-breakpoint
UPDATE "admin"."order_events" SET "to_status" = 'dispatched' WHERE "to_status" = 'shipped';--> statement-breakpoint
DROP INDEX "admin"."orders_cw_conversation_active_unique";--> statement-breakpoint
ALTER TABLE "admin"."orders" ALTER COLUMN "status" SET DEFAULT 'pending_confirmation';--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD COLUMN "unit_cost_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD COLUMN "selected_attributes" jsonb;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "contact_address_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "stock_deducted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "guide_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "issue_notes" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "repeated_from_order_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "external_erp_system" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "external_erp_reference" text;--> statement-breakpoint
CREATE INDEX "orders_client_created_idx" ON "admin"."orders" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_cw_conversation_active_unique" ON "admin"."orders" USING btree ("client_id","chatwoot_conversation_id") WHERE chatwoot_conversation_id IS NOT NULL AND status IN ('pending_confirmation', 'confirmed', 'preparing', 'guide_generated');--> statement-breakpoint
ALTER TABLE "admin"."order_items" ADD CONSTRAINT "order_items_unit_cost_cents_check" CHECK (unit_cost_cents >= 0);--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD CONSTRAINT "orders_status_check" CHECK (status IN ('pending_confirmation', 'confirmed', 'preparing', 'guide_generated', 'dispatched', 'in_transit', 'out_for_delivery', 'delivery_issue', 'delivered', 'return_in_progress', 'returned', 'cancelled'));