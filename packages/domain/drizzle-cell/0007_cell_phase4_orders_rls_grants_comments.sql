-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0006_cell_phase4_orders.sql (ORD-001 T-02, DAT-001 §6.3, §6.8).
--
-- Grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on all Phase 4 Orders cell tables,
-- and documents tables and columns.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_orders_isolation ON admin.orders;
--> statement-breakpoint
CREATE POLICY cell_orders_isolation ON admin.orders
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_order_items_isolation ON admin.order_items;
--> statement-breakpoint
CREATE POLICY cell_order_items_isolation ON admin.order_items
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.order_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_order_events_isolation ON admin.order_events;
--> statement-breakpoint
CREATE POLICY cell_order_events_isolation ON admin.order_events
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.order_returns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_returns FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_order_returns_isolation ON admin.order_returns;
--> statement-breakpoint
CREATE POLICY cell_order_returns_isolation ON admin.order_returns
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.order_sequences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_sequences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_order_sequences_isolation ON admin.order_sequences;
--> statement-breakpoint
CREATE POLICY cell_order_sequences_isolation ON admin.order_sequences
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.shipping_carriers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.shipping_carriers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_shipping_carriers_isolation ON admin.shipping_carriers;
--> statement-breakpoint
CREATE POLICY cell_shipping_carriers_isolation ON admin.shipping_carriers
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON TABLE admin.orders IS 'Master commercial orders table with conversation idempotency and immutable snapshots under FORCE ROW LEVEL SECURITY (ORD-001 §3.1, DAT-001 §6.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.order_items IS 'Immutable order line items and pricing tier snapshots under FORCE ROW LEVEL SECURITY (ORD-001 §3.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.order_events IS 'Append-only audit trail of order lifecycle state transitions under FORCE ROW LEVEL SECURITY (ORD-001 §3.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.order_returns IS 'Physical goods return requests, inspections, and refund tracking under FORCE ROW LEVEL SECURITY (ORD-001 §3.4).';
--> statement-breakpoint
COMMENT ON TABLE admin.order_sequences IS 'Atomic tenant monthly order sequence counters (ORD-YYYYMM-####) under FORCE ROW LEVEL SECURITY (ORD-001 §3.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.shipping_carriers IS 'Tenant shipping carriers catalog and tracking URL templates under FORCE ROW LEVEL SECURITY (ORD-001 §5.2).';
