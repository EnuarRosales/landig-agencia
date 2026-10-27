-- Hand-written migration (drizzle-kit --custom). Drizzle does not model cluster roles,
-- grants or COMMENT ON, so they live here. Applies after 0000_foundation.sql.
--
-- Roles are cluster-wide NOLOGIN group roles: no passwords are created or versioned here.
-- Login roles that inherit them (for example `GRANT mocter_admin TO <login_role>`) are
-- provisioned by operations outside the repository (R-01). CREATE ROLE is guarded so the
-- migration can run again on a cluster where the roles already exist.
--
-- Privileges granted here apply to the objects that exist when this file runs. Tables
-- created by later migrations must receive their own grants in the migration that creates them.

DO $$
BEGIN
  -- DDL owner: runs migrations and owns the schema objects. No login, no RLS bypass.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_migrator') THEN
    CREATE ROLE mocter_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Application role for mocter-admin: data access only, no DDL, no RLS bypass (ADM-001 T-03).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_admin') THEN
    CREATE ROLE mocter_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Landing role: may only insert contact requests into public.leads (ADM-001 D-25, RF-16.6).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_landing') THEN
    CREATE ROLE mocter_landing NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Identity role. Created here; AUTH-001 T-03 grants its domain permissions.
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
GRANT USAGE, CREATE ON SCHEMA public TO mocter_migrator;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA public TO mocter_migrator;
--> statement-breakpoint
GRANT USAGE ON SCHEMA admin TO mocter_admin;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO mocter_admin;
--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE public.leads TO mocter_admin;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO mocter_landing;
--> statement-breakpoint
GRANT INSERT ON TABLE public.leads TO mocter_landing;
--> statement-breakpoint
COMMENT ON SCHEMA admin IS 'Router Global schema owned by mocter-admin. Privilege unit for ADM-001 (D-25); the landing role has no access.';
--> statement-breakpoint
COMMENT ON TABLE admin.plans IS 'Canonical plan catalog. code is the stable public slug; prices are integer cents.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.code IS 'Stable public slug used by /register?plan_code=...; unique.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.name IS 'Localized name as JSONB {"es": string, "en": string}.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.description IS 'Localized description as JSONB {"es": string, "en": string}; nullable.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.status IS 'Lifecycle: draft, active or retired. Only active plans with is_public=true appear on the landing.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.billing_cycles IS 'JSON array of supported billing cycles: "monthly" and/or "annual".';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.price_monthly_cents IS 'Monthly price in minor currency units (cents).';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.price_annual_cents IS 'Annual price in minor currency units (cents).';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.currency IS 'ISO 4217 currency code. Defaults to COP.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.marketing_features IS 'Localized feature list as JSONB {"es": string[], "en": string[]}.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.created_by IS 'Actor (user or service name) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.plans.updated_by IS 'Actor that last modified the row.';
--> statement-breakpoint
COMMENT ON TABLE admin.clients IS 'Tenants. clients.id is the tenant key (client_id) copied into child tables.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.slug IS 'Unique human-readable tenant identifier.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.lifecycle_status IS 'Tenant lifecycle: alta, activo, suspendido or baja.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.locale IS 'Tenant default locale: es or en.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.currency IS 'Tenant default ISO 4217 currency. Defaults to COP.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.created_by IS 'Actor (user or service name) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.updated_by IS 'Actor that last modified the row.';
--> statement-breakpoint
COMMENT ON TABLE admin.client_plans IS 'Plan assignment history per tenant. clients.plan_id holds the current plan.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_plans.source IS 'Origin of the assignment: manual (platform sales) or self_service (tenant owner).';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_plans.valid_to IS 'End of validity; NULL means open-ended. Must be later than valid_from when set.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_plans.created_by IS 'Actor (user or service name) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_plans.updated_by IS 'Actor that last modified the row.';
--> statement-breakpoint
COMMENT ON TABLE admin.users IS 'Global platform identity. No client_id and no RLS; one row per person (ADM-001 D-34, AUTH-001).';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.email IS 'Login email, always stored in lower case (users_email_lowercase_check).';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.identity_location IS 'Where credentials live: router, or the cell_id UUID of a dedicated cell.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.active_client_id IS 'Single active membership pointer. Nullable; the FK to admin.clients(id) is added by ADM-001 T-06.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.status IS 'Account status: active or disabled.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.created_by IS 'Actor (user or service name) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.users.updated_by IS 'Actor that last modified the row.';
--> statement-breakpoint
COMMENT ON TABLE admin.cells IS 'Catalog of tenant data cells. Each cell is a separate PostgreSQL instance behind its own PgBouncer.';
--> statement-breakpoint
COMMENT ON COLUMN admin.cells.status IS 'Cell state: active, draining, readonly or maintenance.';
--> statement-breakpoint
COMMENT ON COLUMN admin.cells.current_clients IS 'Tenant count reserved in this cell; must not exceed max_clients.';
--> statement-breakpoint
COMMENT ON COLUMN admin.cells.created_by IS 'Actor (user or service name) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.cells.updated_by IS 'Actor that last modified the row.';
--> statement-breakpoint
COMMENT ON TABLE admin.client_routing IS 'Current routing of each tenant to its cell. One row per client_id.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_routing.routing_status IS 'pending, active, draining, readonly, maintenance, migrating or failed.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_routing.routing_version IS 'Incremented on every routing change; used for cache invalidation.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_routing.created_by IS 'Actor (user or service name) that created the row.';
--> statement-breakpoint
COMMENT ON COLUMN admin.client_routing.updated_by IS 'Actor that last modified the row.';
--> statement-breakpoint
COMMENT ON TABLE public.leads IS 'Public contact and demo requests from the landing page. The landing role may only insert.';
