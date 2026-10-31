-- Hand-written migration (drizzle-kit --custom). Applies after 0004_auth_providers_config.sql.
--
-- Grants privileges on admin.auth_providers_config (AUTH-001 AUTH-D-08, design §4.1, CA-AUTH-02)
-- to mocter_auth (runtime OAuth resolution) and mocter_admin (SaaS backoffice management),
-- and documents table and columns per PostgreSQL best practices (AGENTS.md §4.5).

GRANT SELECT, INSERT, UPDATE ON TABLE admin.auth_providers_config TO mocter_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.auth_providers_config TO mocter_admin;
--> statement-breakpoint
COMMENT ON TABLE admin.auth_providers_config IS 'Dynamic OAuth/OIDC provider configuration in the Global Router (AUTH-001 AUTH-D-08, CA-AUTH-02). Stores enablement state, endpoints, scopes and AES-256-GCM encrypted client secret.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.id IS 'Canonical lowercase provider identifier (google, facebook, microsoft, etc.). Primary key.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.display_name IS 'Human-readable provider label displayed in login/registration buttons and SaaS backoffice.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.is_enabled IS 'Whether this OAuth provider is currently active for authentication and account linking at runtime.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.client_id IS 'Public OAuth2 client_id or app_id issued by the external identity provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.client_secret_encrypted IS 'AES-256-GCM ciphertext (nonce + ciphertext + auth tag) of the provider client_secret. Never stored in plaintext.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.secret_key_id IS 'Key identifier from /run/secrets/ used to encrypt client_secret_encrypted with AAD oauth_provider:<id>:<key_id>.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.scopes IS 'JSON array of OAuth2 scopes requested during authorization (for example ["openid","email","profile"]).';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.auth_url IS 'OAuth2 authorization endpoint URL of the provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.token_url IS 'OAuth2 token exchange endpoint URL of the provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.user_info_url IS 'OAuth2/OIDC userinfo or profile endpoint URL of the provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.created_at IS 'Timestamp when the provider configuration row was created.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.updated_at IS 'Timestamp when the provider configuration row was last updated.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.created_by IS 'Actor identifier that created the provider configuration row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.auth_providers_config.updated_by IS 'Actor identifier that last updated the provider configuration row.';
