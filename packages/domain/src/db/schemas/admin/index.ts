// Router Global tables in the `admin` schema (Phase 1 subset of DAT-001 §3.2).
// Identity tables (identities, sessions, tokens, user_consents) are added by AUTH-001.
// auth_providers_config and plan limits, migrations, media and organizations come later.
export * from "./namespace";
export * from "./plans";
export * from "./clients";
export * from "./client-plans";
export * from "./users";
export * from "./cells";
export * from "./client-routing";
export * from "./identities";
export * from "./sessions";
export * from "./email-verification-tokens";
export * from "./password-reset-tokens";
export * from "./user-consents";
