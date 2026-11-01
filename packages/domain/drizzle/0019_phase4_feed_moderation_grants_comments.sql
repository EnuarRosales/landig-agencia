-- Hand-written migration (drizzle-kit --custom). Applies after 0019_nice_krista_starr.sql (ADM-001 T-21, T-22).
--
-- Grants privileges and documents community feed posts and moderation events.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.feed_posts IS 'Community feed posts published by tenant_owner or tenant_agent subject to org moderation mode (ADM-001 T-22, RF-08.8).';
--> statement-breakpoint
COMMENT ON TABLE admin.feed_moderation_events IS 'Audit ledger of feed moderation actions (approve, reject, hide) executed by leader or co-leader (ADM-001 T-22, RF-08.19).';
