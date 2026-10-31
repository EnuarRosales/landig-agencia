-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0002_cell_phase2_tenancy_products_media.sql (ADM-001 T-07, T-10, T-12, T-13, T-14).
--
-- Enables pgvector extension, grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on all Phase 2 cell tables,
-- and documents tables and columns.

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.tenant_users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.tenant_users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_tenant_users_isolation ON admin.tenant_users;
--> statement-breakpoint
CREATE POLICY cell_tenant_users_isolation ON admin.tenant_users
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.tenant_labels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.tenant_labels FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_tenant_labels_isolation ON admin.tenant_labels;
--> statement-breakpoint
CREATE POLICY cell_tenant_labels_isolation ON admin.tenant_labels
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.client_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.client_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_client_usage_isolation ON admin.client_usage;
--> statement-breakpoint
CREATE POLICY cell_client_usage_isolation ON admin.client_usage
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.client_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.client_media FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_client_media_isolation ON admin.client_media;
--> statement-breakpoint
CREATE POLICY cell_client_media_isolation ON admin.client_media
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_products_isolation ON admin.products;
--> statement-breakpoint
CREATE POLICY cell_products_isolation ON admin.products
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.product_embeddings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.product_embeddings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_product_embeddings_isolation ON admin.product_embeddings;
--> statement-breakpoint
CREATE POLICY cell_product_embeddings_isolation ON admin.product_embeddings
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.product_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.product_media FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_product_media_isolation ON admin.product_media;
--> statement-breakpoint
CREATE POLICY cell_product_media_isolation ON admin.product_media
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.client_business_info ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.client_business_info FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_client_business_info_isolation ON admin.client_business_info;
--> statement-breakpoint
CREATE POLICY cell_client_business_info_isolation ON admin.client_business_info
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_users IS 'Tenant membership bindings inside a cell (tenant_owner or tenant_agent) under FORCE ROW LEVEL SECURITY (ADM-001 §5.2, D-15, D-31).';
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_labels IS 'Tenant-owned mirror of Chatwoot labels including reserved Mocter lead classification slugs under FORCE ROW LEVEL SECURITY (ADM-001 T-12, RF-03.6, RF-03.7).';
--> statement-breakpoint
COMMENT ON TABLE admin.client_usage IS 'Authoritative quota consumption counter per tenant and dimension inside the cell under FORCE ROW LEVEL SECURITY (ADM-001 T-10, T-14).';
--> statement-breakpoint
COMMENT ON TABLE admin.client_media IS 'Distinct references from a tenant to the global media_catalog for storage billing under FORCE ROW LEVEL SECURITY (ADM-001 T-14).';
--> statement-breakpoint
COMMENT ON TABLE admin.products IS 'Transactional catalog of tenant goods and services with ERP/feed attributes under FORCE ROW LEVEL SECURITY (ADM-001 T-13, §9.0).';
--> statement-breakpoint
COMMENT ON TABLE admin.product_embeddings IS 'Semantic halfvec(1536) embeddings for tenant products decoupled from transactional product updates under FORCE ROW LEVEL SECURITY (ADM-001 T-13, DAT-001 §6.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.product_media IS 'Product-to-media links with independent per-product alt_text under FORCE ROW LEVEL SECURITY (ADM-001 T-13, T-14).';
--> statement-breakpoint
COMMENT ON TABLE admin.client_business_info IS 'Tenant business attention context (payment methods, policies, FAQs, bot preset) under FORCE ROW LEVEL SECURITY (ADM-001 §5.2, RF-03.8).';
