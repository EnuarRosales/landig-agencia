-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0010_cell_phase5_payment_channels.sql (SPEC-05 T-01).
--
-- Grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on tenant_payment_channels,
-- and documents the table and columns.

GRANT ALL ON TABLE admin.tenant_payment_channels TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.tenant_payment_channels TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.tenant_payment_channels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.tenant_payment_channels FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_tenant_payment_channels_isolation ON admin.tenant_payment_channels;
--> statement-breakpoint
CREATE POLICY cell_tenant_payment_channels_isolation ON admin.tenant_payment_channels
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON TABLE admin.tenant_payment_channels IS 'Structured informational payment channels accepted by the tenant business (Nequi, Daviplata, Bre-B, bank transfer, cash on delivery, etc.) under FORCE ROW LEVEL SECURITY (SPEC-05).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_payment_channels.channel_code IS 'Normalized payment channel identifier code (e.g. nequi, daviplata, bancolombia, bre_b, cash_on_delivery).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_payment_channels.display_name IS 'Public payment channel display name shown to end buyers and AI assistant.';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_payment_channels.account_identifier IS 'Public account number, phone number, Bre-B key or informative payment link.';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_payment_channels.instructions IS 'Buyer instructions communicated during checkout and bot replies.';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.payment_channel_id IS 'Optional reference to the structured tenant payment channel used for the order (SPEC-05 / SPEC-11).';
