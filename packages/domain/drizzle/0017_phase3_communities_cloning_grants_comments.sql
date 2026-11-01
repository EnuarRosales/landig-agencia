-- Hand-written migration (drizzle-kit --custom). Applies after 0017_cultured_skaar.sql (ADM-001 T-16, T-17, T-18, T-19).
--
-- Grants privileges and documents organizations, product shares, adoptions and sync tables in Router Global.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.organizations IS 'Tenant community organizations originated by a leader tenant with configurable feed moderation (ADM-001 T-19, RF-08.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.organization_members IS 'Membership ledger for organizations with one-active-community invariant per tenant (ADM-001 T-19, RF-08.2, RF-08.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.product_shares IS 'Community product sharing proposals published by any tenant with version tracking (ADM-001 T-16, RF-08.11).';
--> statement-breakpoint
COMMENT ON TABLE admin.product_share_versions IS 'Historical versions and changed attributes of shared community products (ADM-001 T-16, RF-08.15).';
--> statement-breakpoint
COMMENT ON TABLE admin.product_adoptions IS 'Cloned product adoptions referencing the shared proposal and cell clone product (ADM-001 T-17, RF-06.1, RF-06.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.clone_sync_policies IS 'Granular attribute-level auto-synchronization policies for adopted products (ADM-001 T-18, RF-08.16).';
--> statement-breakpoint
COMMENT ON TABLE admin.sync_runs IS 'Execution audit trail of manual or automatic attribute synchronizations (ADM-001 T-18).';

