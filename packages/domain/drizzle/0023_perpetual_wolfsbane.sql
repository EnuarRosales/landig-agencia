CREATE TABLE "admin"."role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."system_permissions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "system_permissions_key_unique" UNIQUE("key"),
	CONSTRAINT "system_permissions_key_check" CHECK (key = lower(key))
);
--> statement-breakpoint
CREATE TABLE "admin"."system_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"scope" text DEFAULT 'platform' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "system_roles_key_unique" UNIQUE("key"),
	CONSTRAINT "system_roles_key_check" CHECK (key = lower(key)),
	CONSTRAINT "system_roles_status_check" CHECK (status IN ('active', 'disabled')),
	CONSTRAINT "system_roles_scope_check" CHECK (scope IN ('platform', 'tenant', 'community'))
);
--> statement-breakpoint
ALTER TABLE "admin"."role_permissions" ADD CONSTRAINT "role_permissions_role_key_system_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "admin"."system_roles"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."role_permissions" ADD CONSTRAINT "role_permissions_permission_key_system_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "admin"."system_permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_unique" ON "admin"."role_permissions" USING btree ("role_key","permission_key");