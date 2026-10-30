CREATE SCHEMA "admin";
--> statement-breakpoint
CREATE TABLE "admin"."identities" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"provider_email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_identities_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "cell_identities_provider_check" CHECK (provider IN ('google', 'facebook'))
);
--> statement-breakpoint
CREATE TABLE "admin"."users" (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"password_updated_at" timestamp with time zone,
	"totp_secret_ciphertext" "bytea",
	"totp_key_id" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_pending_secret_ciphertext" "bytea",
	"totp_pending_key_id" text,
	"totp_pending_created_at" timestamp with time zone,
	"totp_last_used_step" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cell_users_pkey" PRIMARY KEY("client_id","id"),
	CONSTRAINT "cell_users_email_lowercase_check" CHECK (email = lower(email)),
	CONSTRAINT "cell_users_status_check" CHECK (status IN ('active', 'disabled')),
	CONSTRAINT "cell_users_password_hash_check" CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
	CONSTRAINT "cell_users_password_updated_check" CHECK ((password_hash IS NULL) = (password_updated_at IS NULL)),
	CONSTRAINT "cell_users_totp_secret_key_check" CHECK ((totp_secret_ciphertext IS NULL) = (totp_key_id IS NULL)),
	CONSTRAINT "cell_users_totp_enabled_check" CHECK (totp_enabled_at IS NULL OR totp_secret_ciphertext IS NOT NULL),
	CONSTRAINT "cell_users_totp_pending_check" CHECK ((totp_pending_secret_ciphertext IS NULL) = (totp_pending_key_id IS NULL) AND (totp_pending_secret_ciphertext IS NULL) = (totp_pending_created_at IS NULL))
);
--> statement-breakpoint
ALTER TABLE "admin"."identities" ADD CONSTRAINT "cell_identities_client_user_fk" FOREIGN KEY ("client_id","user_id") REFERENCES "admin"."users"("client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cell_identities_provider_subject_unique" ON "admin"."identities" USING btree ("client_id","provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cell_identities_user_provider_unique" ON "admin"."identities" USING btree ("client_id","user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "cell_users_email_unique" ON "admin"."users" USING btree ("client_id",lower("email"));