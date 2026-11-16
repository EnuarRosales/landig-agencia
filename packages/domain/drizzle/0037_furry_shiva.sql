CREATE TABLE "admin"."geo_provider_locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"level" text NOT NULL,
	"external_id" text NOT NULL,
	"external_parent_id" text,
	"subdivision_code" varchar(16),
	"dane_code" varchar(16),
	"postal_code" varchar(20),
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "geo_provider_locations_provider_check" CHECK (provider IN ('dropi', 'effi', 'mercadolibre')),
	CONSTRAINT "geo_provider_locations_level_check" CHECK (level IN ('subdivision', 'city')),
	CONSTRAINT "geo_provider_locations_aliases_array_check" CHECK (jsonb_typeof(aliases) = 'array'),
	CONSTRAINT "geo_provider_locations_raw_payload_object_check" CHECK (jsonb_typeof(raw_payload) = 'object')
);
--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "country_code" char(2);--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "subdivision_code" varchar(16);--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD COLUMN "default_messages" jsonb;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD COLUMN "business_hours" jsonb;--> statement-breakpoint
ALTER TABLE "admin"."tenant_bots" ADD COLUMN "classifier_prompt" text;--> statement-breakpoint
CREATE UNIQUE INDEX "geo_provider_locations_provider_country_ext_unique" ON "admin"."geo_provider_locations" USING btree ("provider","country_code","level","external_id");--> statement-breakpoint
CREATE INDEX "geo_provider_locations_lookup_idx" ON "admin"."geo_provider_locations" USING btree ("provider","country_code","level","normalized_name");--> statement-breakpoint
CREATE INDEX "geo_provider_locations_subdivision_idx" ON "admin"."geo_provider_locations" USING btree ("provider","country_code","subdivision_code");