ALTER TABLE "admin"."tenant_labels" ADD COLUMN "category" text DEFAULT 'operational' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_labels" ADD COLUMN "activation_rule" text;--> statement-breakpoint
ALTER TABLE "admin"."tenant_labels" ADD COLUMN "side_effects" text;--> statement-breakpoint
ALTER TABLE "admin"."contact_addresses" ADD COLUMN "country_code" char(2) DEFAULT 'CO' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."contact_addresses" ADD COLUMN "subdivision_code" varchar(16);--> statement-breakpoint
ALTER TABLE "admin"."contact_addresses" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "phone_validation_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "country_code" char(2) DEFAULT 'CO' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "subdivision_code" varchar(16);--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "neighborhood" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "reference_notes" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "geo_resolution_status" text DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "raw_location_input" text;--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD COLUMN "provider_geo_refs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "country_code" char(2);--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "subdivision_code" varchar(16);--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "state_name" text;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "neighborhood" text;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "postal_code" varchar(20);--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "reference_notes" text;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "geo_resolution_status" text DEFAULT 'unresolved' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "raw_location_input" text;--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD COLUMN "provider_geo_refs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."tenant_labels" ADD CONSTRAINT "tenant_labels_category_check" CHECK (category IN ('operational', 'functional'));--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD CONSTRAINT "contacts_phone_validation_status_check" CHECK (phone_validation_status IN ('verified_e164', 'legacy_unformatted', 'unverified'));--> statement-breakpoint
ALTER TABLE "admin"."orders" ADD CONSTRAINT "orders_geo_resolution_status_check" CHECK (geo_resolution_status IN ('resolved', 'soft_normalized', 'ambiguous', 'unresolved'));--> statement-breakpoint
ALTER TABLE "admin"."conversation_state" ADD CONSTRAINT "conversation_state_geo_status_check" CHECK (geo_resolution_status IN ('resolved', 'soft_normalized', 'ambiguous', 'unresolved'));