ALTER TABLE "admin"."plans" ADD COLUMN "price_monthly_usd_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."plans" ADD COLUMN "price_annual_usd_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "admin"."plans"
SET
  "price_monthly_usd_cents" = "price_monthly_cents",
  "price_annual_usd_cents" = "price_annual_cents",
  "price_monthly_cents" = "price_monthly_cents" * 4000,
  "price_annual_cents" = "price_annual_cents" * 4000,
  "currency" = 'COP'
WHERE ("currency" = 'USD' OR ("price_monthly_cents" > 0 AND "price_monthly_cents" <= 100000))
  AND "price_monthly_usd_cents" = 0;--> statement-breakpoint
UPDATE "admin"."plans"
SET
  "price_monthly_usd_cents" = ROUND("price_monthly_cents" / 4000.0)::bigint,
  "price_annual_usd_cents" = ROUND("price_annual_cents" / 4000.0)::bigint
WHERE "price_monthly_cents" > 100000
  AND "price_monthly_usd_cents" = 0;--> statement-breakpoint
COMMENT ON COLUMN "admin"."plans"."price_monthly_usd_cents" IS 'Precio mensual fijo en centavos USD para inquilinos fuera de Colombia.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."plans"."price_annual_usd_cents" IS 'Precio anual fijo en centavos USD para inquilinos fuera de Colombia.';