-- Hand-written migration (drizzle-kit --custom). Applies after 0015_low_kylun.sql (BILL-001 T-03).
--
-- Grants privileges and documents the SaaS billing, subscription and payment tables in Router Global.

GRANT ALL ON ALL TABLES IN SCHEMA admin TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin TO mocter_admin;
--> statement-breakpoint

COMMENT ON TABLE admin.client_billing_profiles IS 'Fiscal and tax data for Colombian DIAN compliance under Matias API standards without immediate filing friction (BILL-001 §3.1).';
--> statement-breakpoint
COMMENT ON TABLE admin.payment_methods IS 'Tokenized Wompi and Stripe payment methods; zero PAN or CVV stored; only tokens and card brands (BILL-001 §3.2).';
--> statement-breakpoint
COMMENT ON TABLE admin.subscriptions IS 'SaaS subscription lifecycle (trialing, active, past_due, suspended, cancelled) with plan_id UUID reference (BILL-001 §3.3).';
--> statement-breakpoint
COMMENT ON TABLE admin.invoices IS 'Internal billing invoices with deterministic zero-tax v1 model, proration and referral credits (BILL-001 §3.4).';
--> statement-breakpoint
COMMENT ON TABLE admin.payments IS 'Idempotent gateway payment reconciliation transactions by gateway_reference (BILL-001 §3.5).';
--> statement-breakpoint
COMMENT ON TABLE admin.payment_receipts IS 'Internal payment receipts downloadable in Excel and PDF for tenants and platform owners (BILL-001 §3.6).';
--> statement-breakpoint
COMMENT ON TABLE admin.subscription_changes IS 'Proration ledger tracking remaining days credit and charges upon mid-cycle plan changes (BILL-001 §3.7).';

