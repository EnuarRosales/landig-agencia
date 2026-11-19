CREATE TABLE "admin"."referral_reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reward_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'COP' NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "referral_reward_redemptions_amount_positive" CHECK (amount_cents > 0),
	CONSTRAINT "referral_reward_redemptions_currency_check" CHECK (currency IN ('COP', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "admin"."users" ADD COLUMN "referred_by_code" varchar(32);--> statement-breakpoint
ALTER TABLE "admin"."referrals" ADD COLUMN "attributed_ip_hash" varchar(128);--> statement-breakpoint
ALTER TABLE "admin"."referral_reward_redemptions" ADD CONSTRAINT "referral_reward_redemptions_reward_id_referral_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "admin"."referral_rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referral_reward_redemptions" ADD CONSTRAINT "referral_reward_redemptions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "admin"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referral_reward_redemptions" ADD CONSTRAINT "referral_reward_redemptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_reward_redemptions_reward_invoice_unique" ON "admin"."referral_reward_redemptions" USING btree ("reward_id","invoice_id");--> statement-breakpoint
CREATE INDEX "referral_reward_redemptions_client_idx" ON "admin"."referral_reward_redemptions" USING btree ("client_id","redeemed_at");--> statement-breakpoint
CREATE INDEX "referral_reward_redemptions_invoice_idx" ON "admin"."referral_reward_redemptions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_ip_hash_idx" ON "admin"."referrals" USING btree ("referrer_client_id","attributed_ip_hash");--> statement-breakpoint
GRANT ALL ON TABLE "admin"."referral_reward_redemptions" TO mocter_migrator;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "admin"."referral_reward_redemptions" TO mocter_admin;--> statement-breakpoint
COMMENT ON TABLE "admin"."referral_reward_redemptions" IS 'Ledger normalizado de redenciones FEFO de créditos de referidos aplicadas a facturas SaaS (SPEC-16 D-02).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referral_reward_redemptions"."reward_id" IS 'Identificador del lote de recompensa de referido del cual se descontó el crédito.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referral_reward_redemptions"."invoice_id" IS 'Identificador de la factura SaaS sobre la cual se aplicó el descuento.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referral_reward_redemptions"."client_id" IS 'Identificador del comercio referente titular del crédito redimido.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referral_reward_redemptions"."amount_cents" IS 'Monto descontado de este lote en centavos (entero estrictamente positivo).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referral_reward_redemptions"."currency" IS 'Moneda ISO 4217 del crédito redimido (COP o USD).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referral_reward_redemptions"."redeemed_at" IS 'Marca temporal en que se consolidó la redención del crédito.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."users"."referred_by_code" IS 'Código de referido capturado durante el registro web para atribuir automáticamente el comercio en Onboarding Paso 1 (SPEC-16 D-01).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."referrals"."attributed_ip_hash" IS 'Hash HMAC-SHA256 de la dirección IP de atribución usado para control antifraude sin almacenar IPs en claro (SPEC-16 D-03).';--> statement-breakpoint
INSERT INTO "admin"."email_events" ("key", "category", "description", "variables_schema", "default_sender_key", "is_enabled", "is_system", "tenant_configurable", "created_by", "updated_by")
VALUES (
  'referral.reward_credited',
  'referral',
  'Notificación de crédito de referido acreditado tras el primer pago efectivo del comercio invitado.',
  '["referrer_name","referred_name","reward_amount","currency","expires_at","referrals_url"]'::jsonb,
  (SELECT "key" FROM "admin"."email_senders" WHERE "key" = 'referidos' LIMIT 1),
  true,
  false,
  true,
  'migration',
  'migration'
)
ON CONFLICT ("key") DO NOTHING;
