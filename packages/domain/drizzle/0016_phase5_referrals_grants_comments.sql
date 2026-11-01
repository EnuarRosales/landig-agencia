-- Hand-written migration (drizzle-kit --custom). Applies after 0016_silly_shape.sql (REF-001 T-02).
--
-- Grants privileges and documents the Referral Program tables in Router Global.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.referral_programs IS 'Master configuration for client referral programs under unilateral Model A (credits) in v1 (REF-001 §3).';
--> statement-breakpoint
COMMENT ON TABLE admin.referral_codes IS 'Unique referral invite codes and link identifiers assigned to tenant accounts (REF-001 §3).';
--> statement-breakpoint
COMMENT ON TABLE admin.referrals IS 'Referral attribution records linking referrers with referred tenants and tracking qualification (REF-001 §3).';
--> statement-breakpoint
COMMENT ON TABLE admin.referral_rewards IS 'Earned referral credits ledger with 365-day validity and invoice application tracking (REF-001 §3).';

