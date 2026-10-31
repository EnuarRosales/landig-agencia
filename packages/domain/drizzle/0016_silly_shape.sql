CREATE TABLE "admin"."referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "referral_codes_status_check" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "admin"."referral_programs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"model" varchar(32) DEFAULT 'credit' NOT NULL,
	"reward_type" varchar(16) DEFAULT 'fixed' NOT NULL,
	"reward_value" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'COP' NOT NULL,
	"trigger" varchar(32) DEFAULT 'first_paid_invoice' NOT NULL,
	"attribution_days" integer DEFAULT 60 NOT NULL,
	"cap_referrals_per_referrer" integer,
	"credit_validity_days" integer DEFAULT 365 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "ref_programs_model_check" CHECK (model IN ('credit', 'cash_discount')),
	CONSTRAINT "ref_programs_reward_type_check" CHECK (reward_type IN ('fixed', 'percent')),
	CONSTRAINT "ref_programs_status_check" CHECK (status IN ('draft', 'active', 'paused', 'ended')),
	CONSTRAINT "ref_programs_currency_check" CHECK (currency IN ('COP', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "admin"."referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"referral_id" uuid NOT NULL,
	"referrer_client_id" uuid NOT NULL,
	"model" varchar(32) DEFAULT 'credit' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"remaining_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'COP' NOT NULL,
	"status" varchar(32) DEFAULT 'available' NOT NULL,
	"credited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"applied_invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "referral_rewards_status_check" CHECK (status IN ('pending', 'available', 'partially_redeemed', 'redeemed', 'expired', 'void')),
	CONSTRAINT "referral_rewards_currency_check" CHECK (currency IN ('COP', 'USD')),
	CONSTRAINT "referral_rewards_remaining_non_negative" CHECK (remaining_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."referrals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"program_id" uuid NOT NULL,
	"referrer_client_id" uuid NOT NULL,
	"referred_client_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "referrals_status_check" CHECK (status IN ('pending', 'qualified', 'rewarded', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "admin"."referral_codes" ADD CONSTRAINT "referral_codes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referral_rewards" ADD CONSTRAINT "referral_rewards_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "admin"."referrals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_client_id_clients_id_fk" FOREIGN KEY ("referrer_client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referral_rewards" ADD CONSTRAINT "referral_rewards_applied_invoice_id_invoices_id_fk" FOREIGN KEY ("applied_invoice_id") REFERENCES "admin"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referrals" ADD CONSTRAINT "referrals_program_id_referral_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "admin"."referral_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referrals" ADD CONSTRAINT "referrals_referrer_client_id_clients_id_fk" FOREIGN KEY ("referrer_client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."referrals" ADD CONSTRAINT "referrals_referred_client_id_clients_id_fk" FOREIGN KEY ("referred_client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_unique" ON "admin"."referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_client_unique" ON "admin"."referral_codes" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_referral_unique" ON "admin"."referral_rewards" USING btree ("referral_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referred_client_unique" ON "admin"."referrals" USING btree ("referred_client_id");