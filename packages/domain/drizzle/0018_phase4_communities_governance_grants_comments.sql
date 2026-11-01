-- Hand-written migration (drizzle-kit --custom). Applies after 0018_jittery_emma_frost.sql (ADM-001 T-19, T-20).
--
-- Grants privileges and documents community governance, join requests, invitations and promotions.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.organization_invitations IS 'Direct tokenized invitations to organizations with expiration (ADM-001 T-19).';
--> statement-breakpoint
COMMENT ON TABLE admin.organization_join_requests IS 'Admission requests from tenants reviewed and decided exclusively by originator tenant_owner (ADM-001 T-20, RF-08.6).';
--> statement-breakpoint
COMMENT ON TABLE admin.organization_promotions IS 'Co-leader promotion invitations requiring explicit tenant_owner acceptance (ADM-001 T-20, RF-08.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.client_sharing_profiles IS 'Community visibility settings controlling phone, email and address exposure (ADM-001 RF-08.10).';
