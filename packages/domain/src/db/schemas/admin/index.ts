// Router Global tables in the `admin` schema (Phase 1 subset of DAT-001 §3.2).
// Identity tables (identities, sessions, tokens, user_consents, auth_providers_config)
// are added by AUTH-001. Plan limits, migrations, media and organizations come later.
export * from "./namespace";
export * from "./plans";
export * from "./clients";
export * from "./client-plans";
export * from "./users";
export * from "./cells";
export * from "./client-routing";
