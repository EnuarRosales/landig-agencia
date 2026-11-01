CREATE TABLE "admin"."client_brandings" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"brand_name" varchar(120),
	"logo_url" text,
	"favicon_url" text,
	"palette" jsonb,
	"remove_mocter_branding" boolean DEFAULT false NOT NULL,
	"custom_domain" varchar(255),
	"custom_font" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."client_brandings" ADD CONSTRAINT "client_brandings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE cascade ON UPDATE no action;