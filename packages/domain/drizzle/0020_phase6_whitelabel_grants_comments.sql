-- Hand-written migration (drizzle-kit --custom). Applies after 0020_funny_slapstick.sql (ADM-001 T-28, RF-15).
--
-- Grants privileges and documents client white-label branding configuration.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.client_brandings IS 'Tenant white-label visual customization settings including logos, accessible palette tokens and custom domain (ADM-001 T-28, RF-15, DSN-001 §7).';

