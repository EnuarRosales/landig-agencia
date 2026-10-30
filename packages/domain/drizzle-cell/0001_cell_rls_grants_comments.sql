-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0000_cell_foundation.sql (ADM-001 T-04, AUTH-001 T-04, DAT-001 §6.8).
--
-- Configures:
-- 1. Cluster NOLOGIN group roles (mocter_migrator, mocter_admin, mocter_auth) without BYPASSRLS.
--    Public landing roles are excluded by design from tenant data cells.
-- 2. Least-privilege schema and table grants (mocter_auth has SELECT, UPDATE on admin.users
--    and SELECT, INSERT, UPDATE on admin.identities; no DELETE, no DDL).
-- 3. Strict Row-Level Security (ENABLE + FORCE ROW LEVEL SECURITY) isolated by app.current_client_id.
-- 4. Mandatory schema, table and column comments.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_migrator') THEN
    CREATE ROLE mocter_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_admin') THEN
    CREATE ROLE mocter_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_auth') THEN
    CREATE ROLE mocter_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA admin FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA admin FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT USAGE ON SCHEMA admin TO mocter_admin;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
GRANT USAGE ON SCHEMA admin TO mocter_auth;
--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE admin.users TO mocter_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE admin.identities TO mocter_auth;
--> statement-breakpoint
ALTER TABLE admin.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_users_client_isolation ON admin.users;
--> statement-breakpoint
CREATE POLICY cell_users_client_isolation ON admin.users
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.identities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.identities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_identities_client_isolation ON admin.identities;
--> statement-breakpoint
CREATE POLICY cell_identities_client_isolation ON admin.identities
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON SCHEMA admin IS 'Cell Data Plane administrative and identity schema. Isolated per tenant through FORCE ROW LEVEL SECURITY (ADM-001 T-04, AUTH-001 T-04).';
--> statement-breakpoint
COMMENT ON TABLE admin.users IS 'Tenant-scoped user projection and credential store inside a data cell. Preserves Router users.id under composite PK (client_id, id) and FORCE ROW LEVEL SECURITY (AUTH-001 §4.2).';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.id IS 'User UUID preserved from Router Global admin.users.id.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.client_id IS 'Owning tenant UUID enforced by RLS policy cell_users_client_isolation.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.email IS 'Normalized lowercase login email; unique per tenant (cell_users_email_unique).';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.email_verified_at IS 'Instant the user email was verified; null while unverified.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.password_hash IS 'Argon2id hash with embedded parameters and salt; null for federated-only accounts.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.password_updated_at IS 'Instant of the last password update; null when password_hash is null.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_secret_ciphertext IS 'AES-256-GCM ciphertext (nonce and tag included) of the active TOTP secret; AAD is user_id:key_id.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_key_id IS 'Identifier of the symmetric key used to encrypt totp_secret_ciphertext.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_enabled_at IS 'Instant 2FA TOTP was confirmed; null when 2FA is disabled.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_pending_secret_ciphertext IS 'Enrollment TOTP secret pending confirmation (AES-256-GCM, 10-minute TTL).';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_pending_key_id IS 'Identifier of the symmetric key used to encrypt totp_pending_secret_ciphertext.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_pending_created_at IS 'Creation timestamp of the pending enrollment TOTP secret.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_last_used_step IS 'Last accepted TOTP 30-second step for replay protection.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.status IS 'Cell account status: active or disabled.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.display_name IS 'Optional display name of the user.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.avatar_url IS 'Optional avatar URL of the user.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.created_at IS 'Row creation timestamp in UTC.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.updated_at IS 'Row last modification timestamp in UTC.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.created_by IS 'Actor (user or service) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.updated_by IS 'Actor (user or service) that last updated the row.';
--> statement-breakpoint
COMMENT ON TABLE admin.identities IS 'Tenant-scoped federated identities (Google, Facebook) linked to a cell user under FORCE ROW LEVEL SECURITY. Holds no OAuth tokens (AUTH-001 §4.2).';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.id IS 'Cell federated identity UUID.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.client_id IS 'Owning tenant UUID enforced by RLS policy cell_identities_client_isolation.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.user_id IS 'Referenced user UUID within the same tenant (cell_identities_client_user_fk).';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.provider IS 'Federated identity provider: google or facebook.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.provider_user_id IS 'Subject identifier issued by the provider; unique per (client_id, provider).';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.provider_email IS 'Email returned by the provider (informational).';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.email_verified IS 'Whether the provider certified the email as verified.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.display_name IS 'Optional display name reported by the provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.avatar_url IS 'Optional avatar URL reported by the provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.linked_at IS 'Timestamp when the federated identity was linked.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.last_login_at IS 'Timestamp of the last successful login via this federated identity.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.created_at IS 'Row creation timestamp in UTC.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.updated_at IS 'Row last modification timestamp in UTC.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.created_by IS 'Actor (user or service) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.updated_by IS 'Actor (user or service) that last updated the row.';
