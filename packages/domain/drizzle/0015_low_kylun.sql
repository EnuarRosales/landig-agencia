CREATE TABLE "admin"."client_billing_profiles" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"identity_document_id" integer NOT NULL,
	"dni" varchar(32) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"address" varchar(255),
	"city_code" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "billing_profiles_dni_non_empty" CHECK (length(trim(dni)) > 0),
	CONSTRAINT "billing_profiles_company_non_empty" CHECK (length(trim(company_name)) > 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"credit_cents" bigint DEFAULT 0 NOT NULL,
	"applied_referral_credit_id" uuid,
	"proration_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'COP' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK (status IN ('draft', 'issued', 'paid', 'past_due', 'void')),
	CONSTRAINT "invoices_currency_check" CHECK (currency IN ('COP', 'USD')),
	CONSTRAINT "invoices_total_non_negative" CHECK (total_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "admin"."payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"gateway" varchar(16) NOT NULL,
	"gateway_customer_id" varchar(255) NOT NULL,
	"gateway_payment_method_id" varchar(255) NOT NULL,
	"brand" varchar(32) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "payment_methods_gateway_check" CHECK (gateway IN ('wompi', 'stripe')),
	CONSTRAINT "payment_methods_status_check" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "admin"."payment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"payment_id" uuid NOT NULL,
	"receipt_number" varchar(32) NOT NULL,
	"pdf_url" varchar(512),
	"emailed_to" varchar(255),
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"gateway" varchar(16) NOT NULL,
	"gateway_reference" varchar(255) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "payments_gateway_check" CHECK (gateway IN ('wompi', 'stripe')),
	CONSTRAINT "payments_status_check" CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
	CONSTRAINT "payments_currency_check" CHECK (currency IN ('COP', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "admin"."subscription_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_plan_id" uuid NOT NULL,
	"to_plan_id" uuid NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remaining_days" integer NOT NULL,
	"credit_cents" bigint NOT NULL,
	"charge_cents" bigint NOT NULL,
	"net_cents" bigint NOT NULL,
	"invoice_id" uuid,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "sub_changes_status_check" CHECK (status IN ('pending', 'applied', 'void'))
);
--> statement-breakpoint
CREATE TABLE "admin"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'trialing' NOT NULL,
	"cycle" varchar(16) DEFAULT 'monthly' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"gateway" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
	CONSTRAINT "subscriptions_cycle_check" CHECK (cycle IN ('monthly', 'annual')),
	CONSTRAINT "subscriptions_gateway_check" CHECK (gateway IS NULL OR gateway IN ('wompi', 'stripe'))
);
--> statement-breakpoint
ALTER TABLE "admin"."client_billing_profiles" ADD CONSTRAINT "client_billing_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."payment_methods" ADD CONSTRAINT "payment_methods_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "admin"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "admin"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."subscription_changes" ADD CONSTRAINT "subscription_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "admin"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."subscription_changes" ADD CONSTRAINT "subscription_changes_from_plan_id_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "admin"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."subscription_changes" ADD CONSTRAINT "subscription_changes_to_plan_id_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "admin"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."subscription_changes" ADD CONSTRAINT "subscription_changes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "admin"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "admin"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "admin"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "admin"."invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_client_gateway_method_unique" ON "admin"."payment_methods" USING btree ("client_id","gateway","gateway_payment_method_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_client_default_unique" ON "admin"."payment_methods" USING btree ("client_id") WHERE is_default = true AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipts_payment_unique" ON "admin"."payment_receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipts_number_unique" ON "admin"."payment_receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_reference_unique" ON "admin"."payments" USING btree ("gateway","gateway_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_client_unique" ON "admin"."subscriptions" USING btree ("client_id");