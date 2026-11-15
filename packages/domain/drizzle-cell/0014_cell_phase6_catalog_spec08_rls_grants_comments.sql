-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0013_cell_phase6_catalog_spec08.sql (SPEC-08 T-01).
--
-- Grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on product_bundle_items,
-- reaffirms RLS on products and product_media, and documents tables and columns.

GRANT ALL ON TABLE admin.product_bundle_items TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.product_bundle_items TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.product_bundle_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.product_bundle_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_product_bundle_items_isolation ON admin.product_bundle_items;
--> statement-breakpoint
CREATE POLICY cell_product_bundle_items_isolation ON admin.product_bundle_items
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.product_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.product_media FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE admin.product_bundle_items IS 'Composition links mapping a combo product to its simple component products with quantities and ordering under FORCE ROW LEVEL SECURITY (SPEC-08 §7.2).';
--> statement-breakpoint
COMMENT ON COLUMN admin.product_bundle_items.bundle_product_id IS 'Parent combo product UUID inside the same tenant scope.';
--> statement-breakpoint
COMMENT ON COLUMN admin.product_bundle_items.component_product_id IS 'Component simple product UUID inside the same tenant scope (ON DELETE RESTRICT).';
--> statement-breakpoint
COMMENT ON COLUMN admin.product_bundle_items.quantity IS 'Positive integer number of component units included per unit of combo.';
--> statement-breakpoint
COMMENT ON COLUMN admin.product_bundle_items.sort_order IS 'Display sort order of the component inside the combo detail.';
--> statement-breakpoint
COMMENT ON COLUMN admin.products.composition_type IS 'Catalog composition mode: simple standalone item or combo bundle of simple products (SPEC-08 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.products.bot_master_prompt IS 'High-capacity structured master sales prompt for the conversational AI assistant (up to 32,000 validated chars, SPEC-08 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.products.stock_quantity IS 'Current available units for simple physical products; NULL for digital, service, or dynamically calculated combos (SPEC-08 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.products.min_stock_threshold IS 'Minimum unit threshold triggering a low-stock alert notification for simple physical products (SPEC-08 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.products.low_stock_alert_sent_at IS 'Timestamp when the last low-stock alert notification was emitted; reset to NULL upon restock above min_stock_threshold (SPEC-08 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.product_media.media_kind IS 'Authoritative asset kind linked to the product: image, video, audio or pdf (SPEC-08 §7.3).';
--> statement-breakpoint
COMMENT ON COLUMN admin.product_media.is_cover IS 'Marks the unique primary cover image for the product; restricted to media_kind = image via check constraint and partial unique index (SPEC-08 §7.3).';
