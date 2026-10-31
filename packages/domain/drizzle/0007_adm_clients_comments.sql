-- Hand-written migration (drizzle-kit --custom). Applies after 0006_adm_clients_owner_and_profile.sql.
--
-- Documents the tenant ownership and commercial profile columns added in ADM-001 T-06,
-- as well as the deferred foreign key on admin.users.active_client_id (ADM-001 D-34, AGENTS.md §4.5).

COMMENT ON COLUMN admin.clients.owner_user_id IS 'Mandatory user_id of the tenant_owner in admin.users. Unique across live tenants (lifecycle_status <> baja via clients_one_live_owner).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.contact_email IS 'Primary commercial contact email of the tenant, enforced lowercase (clients_contact_email_lowercase_check).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.phone IS 'Optional commercial contact phone in E.164 format (RF-01.11). Does not represent the Chatwoot WhatsApp channel.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.website_url IS 'Optional public website URL of the tenant business.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.quota_version IS 'Monotonically increasing counter incremented whenever the tenant plan or plan override changes (DAT-001 §3.2).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.tax_id IS 'Optional tax identification number (NIT in Colombia) for billing and commercial profile (RF-01.11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.country IS 'Optional ISO country code or name of the tenant physical address.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.state IS 'Optional state or department of the tenant physical address.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.city IS 'Optional city or municipality of the tenant physical address.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.address_line IS 'Optional street address line of the tenant business.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.postal_code IS 'Optional postal or ZIP code of the tenant physical address.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.industry IS 'Optional business industry or vertical classification.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.timezone IS 'IANA timezone identifier of the tenant business. Defaults to America/Bogota.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.logo_media_id IS 'Optional UUID reference to the tenant logo in admin.media_catalog.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.social_links IS 'JSONB object mapping social network keys to profile URLs. Defaults to {}.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.active_client_id IS 'Single active membership pointer (ADM-001 D-15, D-34). References admin.clients(id) ON DELETE SET NULL.';
