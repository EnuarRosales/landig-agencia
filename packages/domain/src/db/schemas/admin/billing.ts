import {
  bigint,
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { clients } from "./clients";
import { plans } from "./plans";

/**
 * Perfil de facturación y datos fiscales bajo el estándar de Matías API (`admin.client_billing_profiles`, BILL-001 §3.1).
 * Permite capturar los atributos necesarios para la futura facturación electrónica ante la DIAN sin bloquear el lanzamiento.
 */
export const clientBillingProfiles = adminSchema.table(
  "client_billing_profiles",
  {
    /** Identificador del inquilino (PK y FK hacia clients.id). */
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => clients.id),
    /** Código numérico del tipo de documento según catálogo Matías API (ej. 3 = CC, 6 = NIT). */
    identityDocumentId: integer("identity_document_id").notNull(),
    /** Número de identificación fiscal o tributario (con dígito de verificación si aplica). */
    dni: varchar("dni", { length: 32 }).notNull(),
    /** Razón social o nombres y apellidos completos registrados ante la autoridad tributaria. */
    companyName: varchar("company_name", { length: 255 }).notNull(),
    /** Correo electrónico oficial para recepción de notificaciones contables y facturación. */
    email: varchar("email", { length: 255 }).notNull(),
    /** Dirección física o fiscal del establecimiento u oficina principal. */
    address: varchar("address", { length: 255 }),
    /** Código DANE municipal de Colombia (ej. '11001' para Bogotá D.C.). */
    cityCode: varchar("city_code", { length: 16 }),
    ...auditColumns(),
  },
  (table) => [
    check("billing_profiles_dni_non_empty", sql.raw("length(trim(dni)) > 0")),
    check("billing_profiles_company_non_empty", sql.raw("length(trim(company_name)) > 0")),
  ],
);

/**
 * Métodos de pago tokenizados delegados en pasarelas Wompi y Stripe (`admin.payment_methods`, BILL-001 §3.2).
 * Cero almacenamiento de PAN ni CVV. Únicamente se persisten tokens de cliente/método, franquicia y últimos 4 dígitos.
 */
export const paymentMethods = adminSchema.table(
  "payment_methods",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    gateway: varchar("gateway", { length: 16 }).notNull(), // 'wompi' | 'stripe'
    gatewayCustomerId: varchar("gateway_customer_id", { length: 255 }).notNull(),
    gatewayPaymentMethodId: varchar("gateway_payment_method_id", { length: 255 }).notNull(),
    brand: varchar("brand", { length: 32 }).notNull(), // 'visa', 'mastercard', 'pse', 'nequi'
    last4: varchar("last4", { length: 4 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    status: varchar("status", { length: 16 }).notNull().default("active"), // 'active' | 'inactive'
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("payment_methods_client_gateway_method_unique").on(
      table.clientId,
      table.gateway,
      table.gatewayPaymentMethodId,
    ),
    uniqueIndex("payment_methods_client_default_unique")
      .on(table.clientId)
      .where(sql`is_default = true AND status = 'active'`),
    check("payment_methods_gateway_check", sql.raw("gateway IN ('wompi', 'stripe')")),
    check("payment_methods_status_check", sql.raw("status IN ('active', 'inactive')")),
  ],
);

/**
 * Suscripciones SaaS recurrentes por inquilino (`admin.subscriptions`, BILL-001 §3.3).
 * Maneja el ciclo de vida, plan activo, periodicidad y ventana de trial.
 */
export const subscriptions = adminSchema.table(
  "subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: varchar("status", { length: 32 }).notNull().default("trialing"),
    cycle: varchar("cycle", { length: 16 }).notNull().default("monthly"), // 'monthly' | 'annual'
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    gateway: varchar("gateway", { length: 16 }), // 'wompi' | 'stripe' | 'bre_b' | 'trial'
    pendingUpgradePlanId: uuid("pending_upgrade_plan_id").references(() => plans.id, {
      onDelete: "set null",
    }),
    pendingUpgradeCycle: varchar("pending_upgrade_cycle", { length: 16 }),
    d5ReminderSentAt: timestamp("d5_reminder_sent_at", { withTimezone: true }),
    d0ReminderSentAt: timestamp("d0_reminder_sent_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("subscriptions_client_unique").on(table.clientId),
    check(
      "subscriptions_status_check",
      sql.raw("status IN ('trialing', 'active', 'past_due', 'paused', 'suspended', 'cancelled', 'expired')"),
    ),
    check("subscriptions_cycle_check", sql.raw("cycle IN ('monthly', 'annual')")),
    check(
      "subscriptions_gateway_check",
      sql.raw("gateway IS NULL OR gateway IN ('wompi', 'stripe', 'bre_b', 'trial')"),
    ),
    check(
      "subscriptions_pending_upgrade_cycle_check",
      sql.raw("pending_upgrade_cycle IS NULL OR pending_upgrade_cycle IN ('monthly', 'annual')"),
    ),
  ],
);

/**
 * Facturas internas de cobro SaaS (`admin.invoices`, BILL-001 §3.4).
 * En v1: tax_cents = 0 (sin retenciones ni IVA), soporte para créditos de referidos y prorrateo.
 */
export const invoices = adminSchema.table(
  "invoices",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
    taxCents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
    creditCents: bigint("credit_cents", { mode: "number" }).notNull().default(0),
    appliedReferralCreditId: uuid("applied_referral_credit_id"),
    prorationCents: bigint("proration_cents", { mode: "number" }).notNull().default(0),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("invoices_number_unique").on(table.invoiceNumber),
    check(
      "invoices_status_check",
      sql.raw("status IN ('draft', 'issued', 'paid', 'past_due', 'void')"),
    ),
    check("invoices_currency_check", sql.raw("currency IN ('COP', 'USD')")),
    check("invoices_total_non_negative", sql.raw("total_cents >= 0")),
  ],
);

/**
 * Registro de pagos y transacciones conciliadas con pasarelas (`admin.payments`, BILL-001 §3.5).
 * Idempotencia estricta por `gateway_reference`.
 */
export const payments = adminSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    gateway: varchar("gateway", { length: 16 }).notNull(),
    gatewayReference: varchar("gateway_reference", { length: 255 }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("payments_gateway_reference_unique").on(table.gateway, table.gatewayReference),
    check("payments_gateway_check", sql.raw("gateway IN ('wompi', 'stripe', 'bre_b', 'trial')")),
    check(
      "payments_status_check",
      sql.raw("status IN ('pending', 'approved', 'rejected', 'refunded')"),
    ),
    check("payments_currency_check", sql.raw("currency IN ('COP', 'USD')")),
  ],
);

/**
 * Comprobantes de pago internos generados para inquilino y SaaS (`admin.payment_receipts`, BILL-001 §3.6).
 */
export const paymentReceipts = adminSchema.table(
  "payment_receipts",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    receiptNumber: varchar("receipt_number", { length: 32 }).notNull(),
    pdfUrl: varchar("pdf_url", { length: 512 }),
    emailedTo: varchar("emailed_to", { length: 255 }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("payment_receipts_payment_unique").on(table.paymentId),
    uniqueIndex("payment_receipts_number_unique").on(table.receiptNumber),
  ],
);

/**
 * Registro de cambios de plan y prorrateo de días restantes (`admin.subscription_changes`, BILL-001 §3.7).
 */
export const subscriptionChanges = adminSchema.table(
  "subscription_changes",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    fromPlanId: uuid("from_plan_id")
      .notNull()
      .references(() => plans.id),
    toPlanId: uuid("to_plan_id")
      .notNull()
      .references(() => plans.id),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    remainingDays: integer("remaining_days").notNull(),
    creditCents: bigint("credit_cents", { mode: "number" }).notNull(),
    chargeCents: bigint("charge_cents", { mode: "number" }).notNull(),
    netCents: bigint("net_cents", { mode: "number" }).notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // 'pending' | 'applied' | 'void'
    ...auditColumns(),
  },
  (table) => [
    check("sub_changes_status_check", sql.raw("status IN ('pending', 'applied', 'void')")),
  ],
);

/**
 * Reportes de pago manual vía Bre-B Colombia enviados por inquilinos para revisión de plataforma
 * (`admin.billing_manual_payment_reports`, SPEC-04 §7.3).
 *
 * Registro contable inmutable (`ON DELETE RESTRICT`): conserva snapshot de QR dinámico y llave Bre-B
 * usada al momento de la orden, junto con la clave privada en SeaweedFS del comprobante/voucher.
 */
export const billingManualPaymentReports = adminSchema.table(
  "billing_manual_payment_reports",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    targetPlanId: uuid("target_plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    targetCycle: varchar("target_cycle", { length: 16 }).notNull(),
    operationKind: varchar("operation_kind", { length: 24 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull().default("bre_b"),
    expectedAmountCents: bigint("expected_amount_cents", { mode: "number" }).notNull(),
    reportedAmountCents: bigint("reported_amount_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("COP"),
    paymentReference: varchar("payment_reference", { length: 120 }),
    voucherMediaKey: text("voucher_media_key").notNull(),
    voucherMimeType: varchar("voucher_mime_type", { length: 64 }).notNull(),
    dynamicQrPayload: text("dynamic_qr_payload").notNull(),
    breBKeySnapshot: varchar("bre_b_key_snapshot", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending_review"),
    submittedByUserId: uuid("submitted_by_user_id").notNull(),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    ...auditColumns(),
  },
  (table) => [
    index("billing_manual_reports_client_status_idx").on(table.clientId, table.status),
    index("billing_manual_reports_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("billing_manual_reports_one_pending_per_invoice")
      .on(table.invoiceId)
      .where(sql`status = 'pending_review'`),
    check(
      "billing_manual_reports_cycle_check",
      sql.raw("target_cycle IN ('monthly', 'annual')"),
    ),
    check(
      "billing_manual_reports_operation_kind_check",
      sql.raw("operation_kind IN ('new_subscription', 'renewal', 'upgrade')"),
    ),
    check("billing_manual_reports_channel_check", sql.raw("channel IN ('bre_b')")),
    check("billing_manual_reports_currency_check", sql.raw("currency IN ('COP')")),
    check(
      "billing_manual_reports_expected_amount_check",
      sql.raw("expected_amount_cents >= 0"),
    ),
    check(
      "billing_manual_reports_reported_amount_check",
      sql.raw("reported_amount_cents > 0"),
    ),
    check(
      "billing_manual_reports_status_check",
      sql.raw("status IN ('pending_review', 'approved', 'rejected')"),
    ),
  ],
);

export type ClientBillingProfile = typeof clientBillingProfiles.$inferSelect;
export type NewClientBillingProfile = typeof clientBillingProfiles.$inferInsert;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;
export type NewPaymentReceipt = typeof paymentReceipts.$inferInsert;
export type SubscriptionChange = typeof subscriptionChanges.$inferSelect;
export type NewSubscriptionChange = typeof subscriptionChanges.$inferInsert;
export type BillingManualPaymentReport = typeof billingManualPaymentReports.$inferSelect;
export type NewBillingManualPaymentReport = typeof billingManualPaymentReports.$inferInsert;

