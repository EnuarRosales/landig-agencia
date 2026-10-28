CREATE TABLE "admin"."identities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
	CONSTRAINT "identities_provider_check" CHECK (provider IN ('google', 'facebook'))
);
--> statement-breakpoint
CREATE TABLE "admin"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"sid_hash" "bytea" NOT NULL,
	"csrf_hash" "bytea" NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid,
	"routing_version" integer,
	"auth_method" text NOT NULL,
	"mfa_at" timestamp with time zone,
	"reauth_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"ip_hash" "bytea",
	"user_agent_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "sessions_sid_hash_unique" UNIQUE("sid_hash"),
	CONSTRAINT "sessions_absolute_expiry_check" CHECK (absolute_expires_at > created_at),
	CONSTRAINT "sessions_expiry_check" CHECK (expires_at <= absolute_expires_at),
	CONSTRAINT "sessions_auth_method_check" CHECK (auth_method IN ('password', 'google', 'facebook')),
	CONSTRAINT "sessions_sid_hash_length_check" CHECK (octet_length(sid_hash) = 32),
	CONSTRAINT "sessions_csrf_hash_length_check" CHECK (octet_length(csrf_hash) = 32)
);
--> statement-breakpoint
CREATE TABLE "admin"."email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"requested_ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_verification_tokens_hash_length_check" CHECK (octet_length(token_hash) = 32)
);
--> statement-breakpoint
CREATE TABLE "admin"."password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"requested_ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "password_reset_tokens_purpose_check" CHECK (purpose IN ('reset', 'setup')),
	CONSTRAINT "password_reset_tokens_hash_length_check" CHECK (octet_length(token_hash) = 32)
);
--> statement-breakpoint
CREATE TABLE "admin"."user_consents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"status" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"channel" text NOT NULL,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "user_consents_purpose_check" CHECK (purpose IN ('data_treatment', 'commercial_comms')),
	CONSTRAINT "user_consents_status_check" CHECK (status IN ('granted', 'revoked')),
	CONSTRAINT "user_consents_revocation_check" CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "password_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_secret_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_key_id" text;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_pending_secret_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_pending_key_id" text;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_pending_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "totp_last_used_step" bigint;--> statement-breakpoint
ALTER TABLE "admin"."identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identities_provider_subject_unique" ON "admin"."identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_user_provider_unique" ON "admin"."identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "admin"."sessions" USING btree ("user_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_client_active_idx" ON "admin"."sessions" USING btree ("client_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "admin"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_token_hash_unique" ON "admin"."email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_idx" ON "admin"."email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_hash_unique" ON "admin"."password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "admin"."password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_consents_user_purpose_idx" ON "admin"."user_consents" USING btree ("user_id","purpose");--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_password_hash_check" CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%');--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_password_updated_check" CHECK ((password_hash IS NULL) = (password_updated_at IS NULL));--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_totp_secret_key_check" CHECK ((totp_secret_ciphertext IS NULL) = (totp_key_id IS NULL));--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_totp_enabled_check" CHECK (totp_enabled_at IS NULL OR totp_secret_ciphertext IS NOT NULL);--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_totp_pending_check" CHECK ((totp_pending_secret_ciphertext IS NULL) = (totp_pending_key_id IS NULL) AND (totp_pending_secret_ciphertext IS NULL) = (totp_pending_created_at IS NULL));