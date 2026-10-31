-- Hand-written migration (drizzle-kit --custom). Applies after 0008_phase2_admin_ntf_leads_catalogs.sql.
--
-- Grants privileges on all Phase 2 Control Plane tables to mocter_migrator and mocter_admin,
-- grants transactional email enqueue/read privileges to mocter_auth, and documents tables/columns (AGENTS.md §4.5).

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
GRANT SELECT ON TABLE admin.email_events, admin.email_templates, admin.email_senders, admin.email_provider_configs TO mocter_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE admin.email_deliveries, admin.email_delivery_events TO mocter_auth;
--> statement-breakpoint
COMMENT ON TABLE admin.plan_dimensions IS 'Catalog of numeric quota dimensions governed by the platform (ADM-001 T-10, RF-04.8).';
--> statement-breakpoint
COMMENT ON TABLE admin.plan_limits IS 'Numeric quota limits per plan and dimension (ADM-001 T-10, DAT-001 §3.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.client_plan_overrides IS 'Negotiated numeric quota overrides per tenant with validity window (ADM-001 T-10).';
--> statement-breakpoint
COMMENT ON TABLE admin.plan_features IS 'Catalog of boolean and enum capability gates governed by the platform (ADM-001 T-10, RF-04.8).';
--> statement-breakpoint
COMMENT ON TABLE admin.plan_feature_values IS 'Declared capability values per plan (ADM-001 T-10).';
--> statement-breakpoint
COMMENT ON TABLE admin.client_feature_overrides IS 'Negotiated capability overrides per tenant with validity window (ADM-001 T-10).';
--> statement-breakpoint
COMMENT ON TABLE admin.vectorization_config IS 'Platform configuration of product attributes included in semantic embedding composition; excludes prompt (ADM-001 T-13, RF-05.7).';
--> statement-breakpoint
COMMENT ON TABLE admin.chatwoot_accounts IS 'Correlation between Mocter tenants and Chatwoot accounts, including encrypted service token, webchat inbox and sync state (ADM-001 T-11, T-12).';
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_invitations IS 'Invitations to join an existing tenant as tenant_agent with SHA-256 token hash and expiration (ADM-001 T-08, RF-14.7).';
--> statement-breakpoint
COMMENT ON TABLE admin.onboarding_sessions IS 'Interruptible and resumable onboarding wizard state per user preserving plan_code prior to tenant creation (ADM-001 T-07, RF-14).';
--> statement-breakpoint
COMMENT ON TABLE admin.external_media_providers IS 'Allowlist catalog of admissible external media platforms (YouTube, TikTok, Vimeo, Instagram, Facebook) (ADM-001 T-14, §11.5).';
--> statement-breakpoint
COMMENT ON TABLE admin.media_catalog IS 'Global deduplicated media catalog in the Control Plane without client_id; stores content hash, SeaweedFS key and technical metadata (ADM-001 T-14, §11.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.media_variants IS 'Transcoded media variants in the Control Plane such as mp4_compat (ADM-001 T-14, §11.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.platform_user_roles IS 'Platform-scope role assignments (platform_owner, platform_admin, platform_sales) (ADM-001 D-31).';
--> statement-breakpoint
COMMENT ON TABLE admin.audit_log IS 'Global control-plane audit trail recording actor, action, entity and break-glass justifications without conversation content (ADM-001 §14.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.email_provider_configs IS 'Transactional email provider configurations (SMTP) with AES-256-GCM encrypted credentials (NTF-001 T-02, RF-02).';
--> statement-breakpoint
COMMENT ON TABLE admin.email_senders IS 'Manageable transactional email sender identities with a single active default sender (NTF-001 T-02, RF-01).';
--> statement-breakpoint
COMMENT ON TABLE admin.email_events IS 'Transactional email event catalog and required variables schema (NTF-001 T-02, RF-03).';
--> statement-breakpoint
COMMENT ON TABLE admin.email_templates IS 'Versioned TipTap and sanitized HTML email templates per event and locale, enforcing one published version per pair (NTF-001 T-02, RF-04).';
--> statement-breakpoint
COMMENT ON TABLE admin.email_deliveries IS 'Non-blocking transactional email outbox and delivery state log with unique idempotency_key (NTF-001 T-02, RF-05).';
--> statement-breakpoint
COMMENT ON TABLE admin.email_delivery_events IS 'Append-only log of delivery attempts, SMTP responses and errors (NTF-001 T-02).';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.status IS 'Commercial qualification state managed in /admin/leads: new, contacted, qualified or discarded (ADM-001 T-37, RF-16.3).';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.assigned_to_user_id IS 'Optional platform user UUID assigned to follow up this landing lead (ADM-001 T-37).';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.notes IS 'Internal commercial follow-up notes for this landing lead (ADM-001 T-37).';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.updated_at IS 'Timestamp of the last modification to the landing lead.';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.updated_by IS 'Actor identifier that last updated the landing lead.';
