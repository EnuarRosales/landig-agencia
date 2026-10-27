CREATE SCHEMA "admin";
--> statement-breakpoint
CREATE TABLE "admin"."plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"grace_days" integer DEFAULT 7 NOT NULL,
	"billing_cycles" jsonb DEFAULT '["monthly","annual"]'::jsonb NOT NULL,
	"price_monthly_cents" bigint DEFAULT 0 NOT NULL,
	"price_annual_cents" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'COP' NOT NULL,
	"marketing_features" jsonb DEFAULT '{"es":[],"en":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code"),
	CONSTRAINT "plans_status_check" CHECK (status IN ('draft', 'active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "admin"."clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"lifecycle_status" text DEFAULT 'alta' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"currency" char(3) DEFAULT 'COP' NOT NULL,
	"plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug"),
	CONSTRAINT "clients_lifecycle_check" CHECK (lifecycle_status IN ('alta', 'activo', 'suspendido', 'baja')),
	CONSTRAINT "clients_locale_check" CHECK (locale IN ('es', 'en'))
);
--> statement-breakpoint
CREATE TABLE "admin"."client_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"source" text NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "client_plans_source_check" CHECK (source IN ('manual', 'self_service')),
	CONSTRAINT "client_plans_validity_check" CHECK (valid_to IS NULL OR valid_to > valid_from)
);
--> statement-breakpoint
CREATE TABLE "admin"."users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"identity_location" text DEFAULT 'router' NOT NULL,
	"active_client_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "users_email_lowercase_check" CHECK (email = lower(email)),
	CONSTRAINT "users_identity_location_check" CHECK (identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
	CONSTRAINT "users_status_check" CHECK (status IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "admin"."cells" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"pgbouncer_host" text NOT NULL,
	"pgbouncer_port" integer DEFAULT 6432 NOT NULL,
	"database_name" text NOT NULL,
	"max_clients" integer DEFAULT 100 NOT NULL,
	"current_clients" integer DEFAULT 0 NOT NULL,
	"region" text DEFAULT 'us-east-1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "cells_code_unique" UNIQUE("code"),
	CONSTRAINT "cells_status_check" CHECK (status IN ('active', 'draining', 'readonly', 'maintenance')),
	CONSTRAINT "cells_max_clients_check" CHECK (max_clients > 0),
	CONSTRAINT "cells_capacity_check" CHECK (current_clients <= max_clients)
);
--> statement-breakpoint
CREATE TABLE "admin"."client_routing" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"cell_id" uuid NOT NULL,
	"routing_status" text DEFAULT 'pending' NOT NULL,
	"routing_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "client_routing_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "client_routing_status_check" CHECK (routing_status IN ('pending', 'active', 'draining', 'readonly', 'maintenance', 'migrating', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."clients" ADD CONSTRAINT "clients_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "admin"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_plans" ADD CONSTRAINT "client_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_plans" ADD CONSTRAINT "client_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "admin"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_plans" ADD CONSTRAINT "client_plans_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_routing" ADD CONSTRAINT "client_routing_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."client_routing" ADD CONSTRAINT "client_routing_cell_id_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "admin"."cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_plans_client_id_idx" ON "admin"."client_plans" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "admin"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "client_routing_cell_id_idx" ON "admin"."client_routing" USING btree ("cell_id");