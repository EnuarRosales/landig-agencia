CREATE TABLE "admin"."auth_providers_config" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"client_id" text,
	"client_secret_encrypted" "bytea",
	"secret_key_id" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auth_url" text,
	"token_url" text,
	"user_info_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "auth_providers_config_id_format_check" CHECK (id = lower(id) AND length(trim(id)) > 0),
	CONSTRAINT "auth_providers_config_secret_key_pair_check" CHECK ((client_secret_encrypted IS NULL) = (secret_key_id IS NULL)),
	CONSTRAINT "auth_providers_config_scopes_array_check" CHECK (jsonb_typeof("admin"."auth_providers_config"."scopes") = 'array')
);
