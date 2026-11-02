CREATE TABLE "admin"."payment_gateways_config" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"public_key" text,
	"secret_key_encrypted" "bytea",
	"webhook_secret_encrypted" "bytea",
	"secret_key_id" text,
	"webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "payment_gateways_config_id_check" CHECK (id IN ('wompi', 'stripe')),
	CONSTRAINT "payment_gateways_config_env_check" CHECK (environment IN ('sandbox', 'production'))
);
