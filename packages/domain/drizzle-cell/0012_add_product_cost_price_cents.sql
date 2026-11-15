ALTER TABLE "admin"."products" ADD COLUMN "cost_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "admin"."products" ADD CONSTRAINT "products_cost_price_non_negative_check" CHECK (cost_price_cents IS NULL OR cost_price_cents >= 0);--> statement-breakpoint
COMMENT ON COLUMN "admin"."products"."cost_price_cents" IS 'Costo unitario opcional del producto en centavos para cálculo de rentabilidad y margen.';
