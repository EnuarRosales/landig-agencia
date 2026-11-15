CREATE TABLE "admin"."contact_addresses" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text NOT NULL,
	"country" text DEFAULT 'Colombia' NOT NULL,
	"state" text,
	"city" text NOT NULL,
	"address_line" text NOT NULL,
	"neighborhood" text,
	"postal_code" text,
	"reference_notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_contact_addresses_pkey" PRIMARY KEY("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "admin"."contact_ratings" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"comment" text,
	"rated_by_user_id" uuid,
	"rated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_contact_ratings_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "contact_ratings_stars_check" CHECK (stars >= 1 AND stars <= 5)
);
--> statement-breakpoint
ALTER TABLE "admin"."contacts" DROP CONSTRAINT IF EXISTS "contacts_source_check";--> statement-breakpoint
ALTER TABLE "admin"."contacts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."contacts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "phone_secondary" text;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "preferred_channel" text;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "last_channel" text;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "current_rating_stars" smallint;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "current_rating_comment" text;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "last_inbound_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "last_whatsapp_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD COLUMN "converted_to_customer_at" timestamp with time zone;--> statement-breakpoint
UPDATE "admin"."contacts" SET "preferred_channel" = 'whatsapp' WHERE ("phone_mobile" IS NOT NULL OR "source" = 'whatsapp') AND "preferred_channel" IS NULL;--> statement-breakpoint
UPDATE "admin"."contacts" SET "last_channel" = COALESCE(NULLIF(TRIM("channel"), ''), "source") WHERE "last_channel" IS NULL;--> statement-breakpoint
INSERT INTO "admin"."contact_addresses" ("client_id", "contact_id", "label", "country", "state", "city", "address_line", "postal_code", "is_default", "created_by", "updated_by")
SELECT c."client_id", c."id", 'Principal', COALESCE(NULLIF(TRIM(c."country"), ''), 'Colombia'), c."state", TRIM(c."city"), TRIM(c."address_line"), c."postal_code", true, 'migration-spec09', 'migration-spec09'
FROM "admin"."contacts" c
WHERE c."deleted_at" IS NULL
  AND NULLIF(TRIM(c."city"), '') IS NOT NULL
  AND NULLIF(TRIM(c."address_line"), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "admin"."contact_addresses" a
    WHERE a."client_id" = c."client_id" AND a."contact_id" = c."id"
  );--> statement-breakpoint
ALTER TABLE "admin"."contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin"."contact_addresses" ADD CONSTRAINT "contact_addresses_contact_fk" FOREIGN KEY ("client_id","contact_id") REFERENCES "admin"."contacts"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."contact_ratings" ADD CONSTRAINT "contact_ratings_contact_fk" FOREIGN KEY ("client_id","contact_id") REFERENCES "admin"."contacts"("client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_addresses_by_contact_idx" ON "admin"."contact_addresses" USING btree ("client_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_addresses_one_default_per_contact" ON "admin"."contact_addresses" USING btree ("client_id","contact_id") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "contact_ratings_by_contact_idx" ON "admin"."contact_ratings" USING btree ("client_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX "contacts_client_last_wa_inbound_idx" ON "admin"."contacts" USING btree ("client_id","last_whatsapp_inbound_at");--> statement-breakpoint
CREATE INDEX "contacts_client_last_inbound_idx" ON "admin"."contacts" USING btree ("client_id","last_inbound_message_at");--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD CONSTRAINT "contacts_current_rating_stars_check" CHECK (current_rating_stars IS NULL OR (current_rating_stars >= 1 AND current_rating_stars <= 5));--> statement-breakpoint
ALTER TABLE "admin"."contacts" ADD CONSTRAINT "contacts_source_check" CHECK (source IN ('whatsapp', 'instagram', 'facebook', 'web', 'telegram', 'email', 'sms', 'manual', 'referral', 'import', 'api', 'other'));