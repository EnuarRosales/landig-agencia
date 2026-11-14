CREATE TABLE "admin"."billing_manual_payment_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"target_plan_id" uuid NOT NULL,
	"target_cycle" varchar(16) NOT NULL,
	"operation_kind" varchar(24) NOT NULL,
	"channel" varchar(16) DEFAULT 'bre_b' NOT NULL,
	"expected_amount_cents" bigint NOT NULL,
	"reported_amount_cents" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'COP' NOT NULL,
	"payment_reference" varchar(120),
	"voucher_media_key" text NOT NULL,
	"voucher_mime_type" varchar(64) NOT NULL,
	"dynamic_qr_payload" text NOT NULL,
	"bre_b_key_snapshot" varchar(160) NOT NULL,
	"status" varchar(24) DEFAULT 'pending_review' NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "billing_manual_reports_cycle_check" CHECK (target_cycle IN ('monthly', 'annual')),
	CONSTRAINT "billing_manual_reports_operation_kind_check" CHECK (operation_kind IN ('new_subscription', 'renewal', 'upgrade')),
	CONSTRAINT "billing_manual_reports_channel_check" CHECK (channel IN ('bre_b')),
	CONSTRAINT "billing_manual_reports_currency_check" CHECK (currency IN ('COP')),
	CONSTRAINT "billing_manual_reports_expected_amount_check" CHECK (expected_amount_cents >= 0),
	CONSTRAINT "billing_manual_reports_reported_amount_check" CHECK (reported_amount_cents > 0),
	CONSTRAINT "billing_manual_reports_status_check" CHECK (status IN ('pending_review', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "admin"."payments" DROP CONSTRAINT "payments_gateway_check";--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" DROP CONSTRAINT "subscriptions_status_check";--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" DROP CONSTRAINT "subscriptions_gateway_check";--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" DROP CONSTRAINT "payment_gateways_config_id_check";--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD COLUMN "pending_upgrade_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD COLUMN "pending_upgrade_cycle" varchar(16);--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD COLUMN "d5_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD COLUMN "d0_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD COLUMN "supported_countries" jsonb DEFAULT '["*"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD COLUMN "bre_b_key_type" varchar(32);--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD COLUMN "bre_b_key_value" varchar(160);--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD COLUMN "bre_b_recipient_name" varchar(160);--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD COLUMN "bre_b_qr_payload_template" text;--> statement-breakpoint
ALTER TABLE "admin"."billing_manual_payment_reports" ADD CONSTRAINT "billing_manual_payment_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."billing_manual_payment_reports" ADD CONSTRAINT "billing_manual_payment_reports_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "admin"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."billing_manual_payment_reports" ADD CONSTRAINT "billing_manual_payment_reports_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "admin"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."billing_manual_payment_reports" ADD CONSTRAINT "billing_manual_payment_reports_target_plan_id_plans_id_fk" FOREIGN KEY ("target_plan_id") REFERENCES "admin"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_manual_reports_client_status_idx" ON "admin"."billing_manual_payment_reports" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "billing_manual_reports_status_created_idx" ON "admin"."billing_manual_payment_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_manual_reports_one_pending_per_invoice" ON "admin"."billing_manual_payment_reports" USING btree ("invoice_id") WHERE status = 'pending_review';--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_pending_upgrade_plan_id_plans_id_fk" FOREIGN KEY ("pending_upgrade_plan_id") REFERENCES "admin"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."payments" ADD CONSTRAINT "payments_gateway_check" CHECK (gateway IN ('wompi', 'stripe', 'bre_b', 'trial'));--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_pending_upgrade_cycle_check" CHECK (pending_upgrade_cycle IS NULL OR pending_upgrade_cycle IN ('monthly', 'annual'));--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_status_check" CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'suspended', 'cancelled', 'expired'));--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_gateway_check" CHECK (gateway IS NULL OR gateway IN ('wompi', 'stripe', 'bre_b', 'trial'));--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD CONSTRAINT "payment_gateways_config_bre_b_key_type_check" CHECK (bre_b_key_type IS NULL OR bre_b_key_type IN ('phone', 'email', 'document', 'alphanumeric', 'merchant_code'));--> statement-breakpoint
ALTER TABLE "admin"."payment_gateways_config" ADD CONSTRAINT "payment_gateways_config_id_check" CHECK (id IN ('wompi', 'stripe', 'bre_b'));--> statement-breakpoint
COMMENT ON TABLE "admin"."billing_manual_payment_reports" IS 'Immutable audit ledger of manual Bre-B payment vouchers uploaded by tenants for SaaS subscription review (SPEC-04).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."billing_manual_payment_reports"."expected_amount_cents" IS 'Net expected invoice amount in COP cents calculated at checkout.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."billing_manual_payment_reports"."reported_amount_cents" IS 'Transferred amount in COP cents declared by the tenant owner.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."billing_manual_payment_reports"."voucher_media_key" IS 'Private SeaweedFS S3 object key storing the payment voucher image or PDF.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."billing_manual_payment_reports"."dynamic_qr_payload" IS 'Exact EMVCo/Bre-B QR payload snapshot presented at checkout generation.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."billing_manual_payment_reports"."bre_b_key_snapshot" IS 'Snapshot of platform Bre-B key displayed to the tenant at checkout.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."billing_manual_payment_reports"."status" IS 'Review workflow state: pending_review, approved or rejected.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."subscriptions"."pending_upgrade_plan_id" IS 'Target plan ID awaiting manual Bre-B payment verification without mutating active quotas.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."subscriptions"."pending_upgrade_cycle" IS 'Target billing cycle (monthly or annual) awaiting manual Bre-B payment verification.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."subscriptions"."d5_reminder_sent_at" IS 'Idempotency timestamp recording when the D-5 expiration reminder was dispatched.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."subscriptions"."d0_reminder_sent_at" IS 'Idempotency timestamp recording when the D-0 expiration day reminder was dispatched.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."payment_gateways_config"."supported_countries" IS 'JSON array of ISO-3166 alpha-2 country codes supported by this payment channel (e.g. ["CO"] or ["*"]).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."payment_gateways_config"."bre_b_key_type" IS 'Bre-B receiver key type: phone, email, document, alphanumeric or merchant_code.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."payment_gateways_config"."bre_b_key_value" IS 'Public Bre-B key value displayed to Colombian tenants for manual instant transfers.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."payment_gateways_config"."bre_b_recipient_name" IS 'Official receiver merchant/owner name registered for Bre-B transfers.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."payment_gateways_config"."bre_b_qr_payload_template" IS 'Optional parameterized EMVCo/Bre-B payload template used for dynamic QR generation.';--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_migrator') THEN
    EXECUTE 'GRANT ALL ON TABLE "admin"."billing_manual_payment_reports" TO mocter_migrator';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mocter_admin') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE "admin"."billing_manual_payment_reports" TO mocter_admin';
  END IF;
END $$;--> statement-breakpoint
UPDATE "admin"."payment_gateways_config" SET "supported_countries" = '["CO"]'::jsonb WHERE "id" = 'wompi';--> statement-breakpoint
UPDATE "admin"."payment_gateways_config" SET "supported_countries" = '["*"]'::jsonb WHERE "id" = 'stripe';--> statement-breakpoint
INSERT INTO "admin"."payment_gateways_config" (
  "id",
  "display_name",
  "is_enabled",
  "environment",
  "supported_countries",
  "webhook_url",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
) VALUES (
  'bre_b',
  'Bre-B (Colombia / COP)',
  false,
  'production',
  '["CO"]'::jsonb,
  NULL,
  now(),
  now(),
  'migration',
  'migration'
) ON CONFLICT ("id") DO NOTHING;