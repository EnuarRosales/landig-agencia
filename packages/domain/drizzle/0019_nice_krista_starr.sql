CREATE TABLE "admin"."feed_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"post_id" uuid NOT NULL,
	"actor_client_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_client_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending_review' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin"."feed_moderation_events" ADD CONSTRAINT "feed_moderation_events_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "admin"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_moderation_events" ADD CONSTRAINT "feed_moderation_events_actor_client_id_clients_id_fk" FOREIGN KEY ("actor_client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_moderation_events" ADD CONSTRAINT "feed_moderation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD CONSTRAINT "feed_posts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "admin"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD CONSTRAINT "feed_posts_author_client_id_clients_id_fk" FOREIGN KEY ("author_client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."feed_posts" ADD CONSTRAINT "feed_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "admin"."users"("id") ON DELETE restrict ON UPDATE no action;