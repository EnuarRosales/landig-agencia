CREATE TABLE "admin"."client_feature_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"value" jsonb,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"negotiated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "client_feature_overrides_validity_check" CHECK (valid_to IS NULL OR valid_to > valid_from)
);
--> statement-breakpoint
CREATE TABLE "admin"."client_plan_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"value" bigint NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"negotiated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "client_plan_overrides_value_check" CHECK (value >= 0),
	CONSTRAINT "client_plan_overrides_validity_check" CHECK (valid_to IS NULL OR valid_to > valid_from)
);
--> statement-breakpoint
CREATE TABLE "admin"."plan_dimensions" (
	"key" text PRIMARY KEY NOT NULL,
	"label" jsonb NOT NULL,
	"unit" text DEFAULT 'count' NOT NULL,
	"value_type" text DEFAULT 'integer' NOT NULL,
	"min_value" bigint DEFAULT 0 NOT NULL,
	"max_value" bigint,
	"default_value" bigint DEFAULT 0 NOT NULL,
	"legal_floor_value" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "plan_dimensions_key_check" CHECK (key = lower(key)),
	CONSTRAINT "plan_dimensions_min_check" CHECK (min_value >= 0),
	CONSTRAINT "plan_dimensions_max_check" CHECK (max_value IS NULL OR max_value >= min_value)
);
--> statement-breakpoint
CREATE TABLE "admin"."plan_feature_values" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"plan_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."plan_features" (
	"key" text PRIMARY KEY NOT NULL,
	"label" jsonb NOT NULL,
	"description" jsonb,
	"feature_type" text DEFAULT 'boolean' NOT NULL,
	"allowed_options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "plan_features_key_check" CHECK (key = lower(key)),
	CONSTRAINT "plan_features_type_check" CHECK (feature_type IN ('boolean', 'enum'))
);
--> statement-breakpoint
CREATE TABLE "admin"."plan_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"plan_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"value" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "plan_limits_value_check" CHECK (value >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."vectorization_config" (
	"attribute_key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "vectorization_config_no_prompt_check" CHECK (attribute_key <> 'prompt')
);
--> statement-breakpoint
CREATE TABLE "admin"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"client_id" uuid,
	"justification" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."chatwoot_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"chatwoot_account_id" integer,
	"service_user_id" integer,
	"service_token_ciphertext" "bytea",
	"service_token_key_id" text,
	"webchat_inbox_id" integer,
	"webchat_website_token" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "chatwoot_accounts_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "chatwoot_accounts_chatwoot_account_id_unique" UNIQUE("chatwoot_account_id"),
	CONSTRAINT "chatwoot_accounts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "chatwoot_accounts_state_check" CHECK (state IN ('pending', 'provisioning', 'active', 'failed', 'suspended')),
	CONSTRAINT "chatwoot_accounts_token_key_check" CHECK ((service_token_ciphertext IS NULL) = (service_token_key_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "admin"."external_media_providers" (
	"code" text PRIMARY KEY NOT NULL,
	"labels" jsonb NOT NULL,
	"url_pattern" text NOT NULL,
	"embeddable" boolean DEFAULT true NOT NULL,
	"is_admissible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "external_media_providers_code_check" CHECK (code = lower(code))
);
--> statement-breakpoint
CREATE TABLE "admin"."media_catalog" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"content_hash" text NOT NULL,
	"storage_pool_id" text DEFAULT 'seaweedfs-main' NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint,
	"media_kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"source_format" text NOT NULL,
	"original_filename" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"processing_status" text DEFAULT 'uploaded' NOT NULL,
	"processing_error" text,
	"storage_type" text DEFAULT 'internal' NOT NULL,
	"source_url" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "media_catalog_kind_check" CHECK (media_kind IN ('image', 'audio', 'video', 'pdf')),
	CONSTRAINT "media_catalog_status_check" CHECK (processing_status IN ('uploaded', 'processing', 'ready', 'failed', 'external')),
	CONSTRAINT "media_catalog_storage_type_check" CHECK (storage_type IN ('internal', 'external'))
);
--> statement-breakpoint
CREATE TABLE "admin"."media_variants" (
	"media_id" uuid NOT NULL,
	"variant_code" text NOT NULL,
	"storage_pool_id" text DEFAULT 'seaweedfs-main' NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "media_variants_pkey" PRIMARY KEY("media_id","variant_code")
);
--> statement-breakpoint
CREATE TABLE "admin"."onboarding_sessions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid,
	"plan_code" text DEFAULT 'free' NOT NULL,
	"current_step" text DEFAULT 'business' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"draft_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"optional_checklist" jsonb DEFAULT '["connect_whatsapp","complete_policies","load_more_products"]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "onboarding_sessions_step_check" CHECK (current_step IN ('business', 'product', 'bot_channel', 'completed')),
	CONSTRAINT "onboarding_sessions_status_check" CHECK (status IN ('in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "admin"."platform_user_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "platform_user_roles_role_check" CHECK (role IN ('platform_owner', 'platform_admin', 'platform_sales'))
);
--> statement-breakpoint
CREATE TABLE "admin"."tenant_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'tenant_agent' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "tenant_invitations_email_lowercase_check" CHECK (email = lower(email)),
	CONSTRAINT "tenant_invitations_role_check" CHECK (role = 'tenant_agent'),
	CONSTRAINT "tenant_invitations_status_check" CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "admin"."email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_key" text NOT NULL,
	"template_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"client_id" uuid,
	"locale" text DEFAULT 'es' NOT NULL,
	"rendered_subject" text NOT NULL,
	"rendered_html" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"rabbitmq_message_id" text,
	"published_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_deliveries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "email_deliveries_status_check" CHECK (status IN ('queued', 'published', 'sending', 'sent', 'failed', 'dead')),
	CONSTRAINT "email_deliveries_attempts_check" CHECK (attempts >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."email_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."email_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"variables_schema" jsonb NOT NULL,
	"default_sender_key" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_events_key_unique" UNIQUE("key"),
	CONSTRAINT "email_events_key_check" CHECK (key = lower(key)),
	CONSTRAINT "email_events_category_check" CHECK (category IN ('auth', 'billing', 'community', 'referral', 'tenant', 'landing'))
);
--> statement-breakpoint
CREATE TABLE "admin"."email_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"driver" text DEFAULT 'smtp' NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"username" text,
	"password_ciphertext" "bytea",
	"key_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_provider_configs_name_unique" UNIQUE("name"),
	CONSTRAINT "email_provider_configs_driver_check" CHECK (driver IN ('smtp')),
	CONSTRAINT "email_provider_configs_status_check" CHECK (status IN ('active', 'disabled')),
	CONSTRAINT "email_provider_configs_secret_key_check" CHECK ((password_ciphertext IS NULL) = (key_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "admin"."email_senders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"provider_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_senders_key_unique" UNIQUE("key"),
	CONSTRAINT "email_senders_key_check" CHECK (key = lower(key)),
	CONSTRAINT "email_senders_from_email_check" CHECK (from_email = lower(from_email)),
	CONSTRAINT "email_senders_status_check" CHECK (status IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "admin"."email_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_key" text NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"sender_id" uuid,
	"subject" text NOT NULL,
	"body_json" jsonb NOT NULL,
	"body_html" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "email_templates_locale_check" CHECK (locale IN ('es', 'en')),
	CONSTRAINT "email_templates_status_check" CHECK (status IN ('draft', 'published', 'retired')),
	CONSTRAINT "email_templates_version_check" CHECK (version > 0)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "updated_by" text DEFAULT 'landing' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."client_feature_overrides" ADD CONSTRAINT "client_feature_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_feature_overrides" ADD CONSTRAINT "client_feature_overrides_feature_key_plan_features_key_fk" FOREIGN KEY ("feature_key") REFERENCES "admin"."plan_features"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_feature_overrides" ADD CONSTRAINT "client_feature_overrides_negotiated_by_users_id_fk" FOREIGN KEY ("negotiated_by") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_plan_overrides" ADD CONSTRAINT "client_plan_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_plan_overrides" ADD CONSTRAINT "client_plan_overrides_dimension_plan_dimensions_key_fk" FOREIGN KEY ("dimension") REFERENCES "admin"."plan_dimensions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_plan_overrides" ADD CONSTRAINT "client_plan_overrides_negotiated_by_users_id_fk" FOREIGN KEY ("negotiated_by") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."plan_feature_values" ADD CONSTRAINT "plan_feature_values_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "admin"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."plan_feature_values" ADD CONSTRAINT "plan_feature_values_feature_key_plan_features_key_fk" FOREIGN KEY ("feature_key") REFERENCES "admin"."plan_features"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" ADD CONSTRAINT "plan_limits_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "admin"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" ADD CONSTRAINT "plan_limits_dimension_plan_dimensions_key_fk" FOREIGN KEY ("dimension") REFERENCES "admin"."plan_dimensions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."audit_log" ADD CONSTRAINT "audit_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."chatwoot_accounts" ADD CONSTRAINT "chatwoot_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."media_catalog" ADD CONSTRAINT "media_catalog_provider_external_media_providers_code_fk" FOREIGN KEY ("provider") REFERENCES "admin"."external_media_providers"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."media_variants" ADD CONSTRAINT "media_variants_media_id_media_catalog_id_fk" FOREIGN KEY ("media_id") REFERENCES "admin"."media_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."platform_user_roles" ADD CONSTRAINT "platform_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."platform_user_roles" ADD CONSTRAINT "platform_user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_invitations" ADD CONSTRAINT "tenant_invitations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_invitations" ADD CONSTRAINT "tenant_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."tenant_invitations" ADD CONSTRAINT "tenant_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_deliveries" ADD CONSTRAINT "email_deliveries_event_key_email_events_key_fk" FOREIGN KEY ("event_key") REFERENCES "admin"."email_events"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_deliveries" ADD CONSTRAINT "email_deliveries_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "admin"."email_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_deliveries" ADD CONSTRAINT "email_deliveries_sender_id_email_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "admin"."email_senders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_deliveries" ADD CONSTRAINT "email_deliveries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_delivery_events" ADD CONSTRAINT "email_delivery_events_delivery_id_email_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "admin"."email_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_events" ADD CONSTRAINT "email_events_default_sender_key_email_senders_key_fk" FOREIGN KEY ("default_sender_key") REFERENCES "admin"."email_senders"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_senders" ADD CONSTRAINT "email_senders_provider_id_email_provider_configs_id_fk" FOREIGN KEY ("provider_id") REFERENCES "admin"."email_provider_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_templates" ADD CONSTRAINT "email_templates_event_key_email_events_key_fk" FOREIGN KEY ("event_key") REFERENCES "admin"."email_events"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."email_templates" ADD CONSTRAINT "email_templates_sender_id_email_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "admin"."email_senders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_feature_values_plan_feature_unique" ON "admin"."plan_feature_values" USING btree ("plan_id","feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_limits_plan_dimension_unique" ON "admin"."plan_limits" USING btree ("plan_id","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "media_catalog_hash_pool_unique" ON "admin"."media_catalog" USING btree ("content_hash","storage_pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_user_roles_active_unique" ON "admin"."platform_user_roles" USING btree ("user_id","role") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_invitations_token_hash_unique" ON "admin"."tenant_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "email_senders_one_default" ON "admin"."email_senders" USING btree ("is_default") WHERE is_default = true AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_event_locale_version_unique" ON "admin"."email_templates" USING btree ("event_key","locale","version");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_one_published_per_event_locale" ON "admin"."email_templates" USING btree ("event_key","locale") WHERE status = 'published';--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_check" CHECK (status IN ('new', 'contacted', 'qualified', 'discarded'));