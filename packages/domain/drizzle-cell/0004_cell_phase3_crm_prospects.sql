CREATE TABLE "admin"."contact_memories" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"structured_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" halfvec(1536),
	"model_code" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"source_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_contact_memories_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "contact_memories_kind_check" CHECK (kind IN ('profile', 'episode'))
);
--> statement-breakpoint
CREATE TABLE "admin"."contacts" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"document_type" text,
	"document_number" text,
	"email" text,
	"phone_mobile" text,
	"phone_landline" text,
	"country" text,
	"state" text,
	"city" text,
	"address_line" text,
	"postal_code" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"channel" text,
	"chatwoot_contact_id" integer,
	"assigned_user_id" uuid,
	"stage" text DEFAULT 'new' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"notes" text,
	"first_contacted_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_contacts_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "contacts_document_type_check" CHECK (document_type IS NULL OR document_type IN ('CC', 'NIT', 'CE', 'PASSPORT', 'other')),
	CONSTRAINT "contacts_source_check" CHECK (source IN ('whatsapp', 'web', 'email', 'manual', 'referral', 'other')),
	CONSTRAINT "contacts_stage_check" CHECK (stage IN ('new', 'in_conversation', 'qualified', 'customer', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "admin"."privacy_notices" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"version" text NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_privacy_notices_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "privacy_notices_locale_check" CHECK (locale IN ('es', 'en')),
	CONSTRAINT "privacy_notices_status_check" CHECK (status IN ('draft', 'in_review', 'published', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "admin"."prospect_consents" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"status" text DEFAULT 'granted' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"channel" text DEFAULT 'whatsapp_buttons' NOT NULL,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_prospect_consents_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "prospect_consents_purpose_check" CHECK (purpose IN ('data_treatment', 'commercial_comms')),
	CONSTRAINT "prospect_consents_status_check" CHECK (status IN ('granted', 'revoked')),
	CONSTRAINT "prospect_consents_channel_check" CHECK (channel IN ('whatsapp_buttons', 'web_form', 'manual', 'import'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_memories_profile_unique" ON "admin"."contact_memories" USING btree ("client_id","contact_id") WHERE kind = 'profile';--> statement-breakpoint
CREATE INDEX "contact_memories_by_contact_idx" ON "admin"."contact_memories" USING btree ("client_id","contact_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_client_cw_contact_unique" ON "admin"."contacts" USING btree ("client_id","chatwoot_contact_id") WHERE chatwoot_contact_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_client_email_unique" ON "admin"."contacts" USING btree ("client_id",lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_client_document_unique" ON "admin"."contacts" USING btree ("client_id","document_type","document_number") WHERE document_number IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "contacts_client_phone_mobile_idx" ON "admin"."contacts" USING btree ("client_id","phone_mobile") WHERE phone_mobile IS NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_client_stage_idx" ON "admin"."contacts" USING btree ("client_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_notices_version_unique" ON "admin"."privacy_notices" USING btree ("client_id","version","locale");--> statement-breakpoint
CREATE INDEX "prospect_consents_lookup_idx" ON "admin"."prospect_consents" USING btree ("client_id","prospect_id","purpose");--> statement-breakpoint
CREATE INDEX "prospect_consents_status_idx" ON "admin"."prospect_consents" USING btree ("client_id","status");