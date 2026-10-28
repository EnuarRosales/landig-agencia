-- Hand-written migration (drizzle-kit --custom). Applies after 0002_auth_identity_tables.sql.
--
-- Grants the identity role mocter_auth (AUTH-001 T-03) its domain permissions on the Router.
-- Role creation lives in 0001; this file only grants privileges and adds comments.
-- Privileges are DML only: no DDL, no BYPASSRLS, no access to clients, tenant_users or business data.
-- Cell-side grants (users and identities inside a dedicated cell) belong to AUTH-001 T-04.

GRANT USAGE ON SCHEMA admin TO mocter_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  admin.users,
  admin.identities,
  admin.sessions,
  admin.email_verification_tokens,
  admin.password_reset_tokens,
  admin.user_consents
TO mocter_auth;
--> statement-breakpoint
-- Pendiente de ADM-001: admin.audit_log aún no existe. Al crearla, NO conceder INSERT a mocter_auth;
-- los eventos de auditoría de identidad los escribe el rol de ADM. Aplicar esta prohibición en la migración que cree la tabla.
--> statement-breakpoint
COMMENT ON TABLE admin.identities IS 'Federated identities (Google, Facebook) linked to a platform user. Owned by AUTH-001. Holds no OAuth tokens.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.provider IS 'Identity provider: google or facebook.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.provider_user_id IS 'Subject identifier issued by the provider; unique per provider.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.provider_email IS 'Email returned by the provider. Informational only; linking is decided by the anchor users.email.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.email_verified IS 'Whether the provider reported the email as verified (Google email_verified; Facebook verified email).';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.linked_at IS 'Instant the identity was linked to the user.';
--> statement-breakpoint
COMMENT ON COLUMN admin.identities.last_login_at IS 'Last successful login through this identity; nullable until the first login.';
--> statement-breakpoint
COMMENT ON TABLE admin.sessions IS 'Opaque panel sessions. Only the SHA-256 of the session identifier is stored; the Router holds sessions even when credentials live in a cell.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.sid_hash IS 'SHA-256 of the session identifier (32 bytes). Unique. The raw sid is never stored.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.csrf_hash IS 'SHA-256 of the CSRF token (32 bytes), compared in constant time on authenticated mutations.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.client_id IS 'Tenant copied from users.active_client_id at session time. Plain UUID without foreign key; null without membership.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.routing_version IS 'Routing version in force for client_id; null when the user has no membership.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.auth_method IS 'How the session was created: password, google or facebook.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.mfa_at IS 'Instant of the successful TOTP check; null when the session did not pass 2FA.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.reauth_at IS 'Last explicit password or TOTP proof. Sensitive actions require it within 5 minutes.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.expires_at IS 'Inactivity expiry (30 minutes), extended on activity but never past absolute_expires_at.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.absolute_expires_at IS 'Absolute maximum lifetime (12 hours). Never extended.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.revoked_at IS 'Logical deletion of the session. Its partial indexes only cover active rows (revoked_at IS NULL).';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.revoked_reason IS 'Why the session was revoked, for example logout, membership_changed, restore or password_changed.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.ip_hash IS 'HMAC of the client IP with AUTH_RATE_LIMIT_PEPPER. The IP is never stored in clear.';
--> statement-breakpoint
COMMENT ON COLUMN admin.sessions.user_agent_hash IS 'HMAC of the user agent. Never stored in clear.';
--> statement-breakpoint
COMMENT ON TABLE admin.email_verification_tokens IS 'Single-use email verification tokens. Only the SHA-256 of the token is stored.';
--> statement-breakpoint
COMMENT ON COLUMN admin.email_verification_tokens.token_hash IS 'SHA-256 of the 32-byte token. Unique. The raw token exists only in the email link.';
--> statement-breakpoint
COMMENT ON COLUMN admin.email_verification_tokens.expires_at IS 'Expiry instant, 24 hours after issue.';
--> statement-breakpoint
COMMENT ON COLUMN admin.email_verification_tokens.consumed_at IS 'Set in the same transaction as the verification; a consumed token cannot be used again.';
--> statement-breakpoint
COMMENT ON COLUMN admin.email_verification_tokens.requested_ip_hash IS 'HMAC of the requesting IP with AUTH_RATE_LIMIT_PEPPER.';
--> statement-breakpoint
COMMENT ON TABLE admin.password_reset_tokens IS 'Single-use password reset and setup tokens. Only the SHA-256 of the token is stored.';
--> statement-breakpoint
COMMENT ON COLUMN admin.password_reset_tokens.token_hash IS 'SHA-256 of the 32-byte token. Unique. The raw token exists only in the email link.';
--> statement-breakpoint
COMMENT ON COLUMN admin.password_reset_tokens.purpose IS 'reset for accounts with a password; setup for a federated account that sets its first password.';
--> statement-breakpoint
COMMENT ON COLUMN admin.password_reset_tokens.expires_at IS 'Expiry instant, 30 minutes after issue.';
--> statement-breakpoint
COMMENT ON COLUMN admin.password_reset_tokens.consumed_at IS 'Set in the same transaction as the password change; a consumed token cannot be used again.';
--> statement-breakpoint
COMMENT ON COLUMN admin.password_reset_tokens.requested_ip_hash IS 'HMAC of the requesting IP with AUTH_RATE_LIMIT_PEPPER.';
--> statement-breakpoint
COMMENT ON TABLE admin.user_consents IS 'Personal data treatment consents (Ley 1581 de 2012, Colombia). Append-only per grant; revocation marks revoked_at on the current row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.user_consents.purpose IS 'data_treatment (required at registration) or commercial_comms (optional).';
--> statement-breakpoint
COMMENT ON COLUMN admin.user_consents.policy_version IS 'Version of the privacy notice accepted by the user.';
--> statement-breakpoint
COMMENT ON COLUMN admin.user_consents.status IS 'granted or revoked. Must agree with revoked_at (user_consents_revocation_check).';
--> statement-breakpoint
COMMENT ON COLUMN admin.user_consents.revoked_at IS 'Instant of revocation; null while the consent is granted.';
--> statement-breakpoint
COMMENT ON COLUMN admin.user_consents.channel IS 'Capture channel, for example register_form or onboarding.';
--> statement-breakpoint
COMMENT ON COLUMN admin.user_consents.evidence_ref IS 'Reference to the evidence of the grant. Never the raw form payload.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.password_hash IS 'Argon2id hash with parameters and salt embedded. Null means a federated-only account.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.password_updated_at IS 'Instant of the last password change; null when the account has no password.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_secret_ciphertext IS 'AES-256-GCM ciphertext (nonce and tag included) of the active TOTP secret. Null when 2FA is off. AAD is user_id:key_id.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_key_id IS 'Identifier of the key that encrypted totp_secret_ciphertext; null when there is no secret.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_enabled_at IS 'Instant 2FA was confirmed; null means 2FA is off.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_pending_secret_ciphertext IS 'Enrollment TOTP secret not yet confirmed (AES-256-GCM). Expires 10 minutes after totp_pending_created_at.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_pending_key_id IS 'Identifier of the key that encrypted totp_pending_secret_ciphertext.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_pending_created_at IS 'Instant the pending enrollment secret was created; drives the 10-minute expiry.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.totp_last_used_step IS 'Last accepted TOTP time step. A code with an equal or earlier step is rejected (replay protection).';
