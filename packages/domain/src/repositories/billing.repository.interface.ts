import type {
  ClientBillingProfile,
  NewClientBillingProfile,
  PaymentMethod,
  NewPaymentMethod,
  Subscription,
  NewSubscription,
  Invoice,
  NewInvoice,
  Payment,
  NewPayment,
  PaymentReceipt,
  NewPaymentReceipt,
  SubscriptionChange,
  NewSubscriptionChange,
  BillingManualPaymentReport,
  NewBillingManualPaymentReport,
} from "../db/schemas/admin/billing";
import type {
  PaymentGatewayConfigRow,
  NewPaymentGatewayConfigRow,
} from "../db/schemas/admin/payment-gateways-config";
import type { Plan } from "../db/schemas/admin/plans";
import type { LocalizedText } from "../db/schemas/shared/i18n";

export type SupportedPaymentGatewayId = "wompi" | "stripe" | "bre_b";

export interface ClientBillingSummary {
  id: string;
  slug: string;
  displayName: string;
  contactEmail: string;
  country: string;
  currency: string;
  planId: string | null;
  locale: string;
}

export interface ManualPaymentReportDetail extends BillingManualPaymentReport {
  clientName: string;
  clientSlug: string;
  clientCountry: string;
  clientEmail: string;
  clientLocale: string;
  planCode: string;
  planName: LocalizedText;
  invoiceNumber: string;
  invoiceStatus: string;
}

export interface UpsertTrialSubscriptionInput {
  clientId: string;
  planId: string;
  cycle: "monthly" | "annual";
  trialEndsAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  actor: string;
}

export interface ApproveManualReportTxResult {
  report: BillingManualPaymentReport;
  payment: Payment;
  receipt: PaymentReceipt;
  invoice: Invoice;
  subscription: Subscription;
}

export interface RejectManualReportTxResult {
  report: BillingManualPaymentReport;
  subscription: Subscription;
}

export interface SubscriptionDetail {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  planId: string;
  planCode: string;
  planName: LocalizedText;
  planPriceMonthlyCents: number;
  planPriceAnnualCents: number;
  currency: string;
  status: string;
  cycle: string;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  billingProfile?: {
    companyName: string;
    dni: string;
    email: string;
  } | null;
}

export interface BillingOverviewMetrics {
  mrrCents: number;
  activeCount: number;
  trialingCount: number;
  pastDueCount: number;
  totalInvoicesCount: number;
}

/**
 * Contrato de persistencia para el sistema de facturación SaaS (BILL-001 RF-01 a RF-04, D-10, D-11).
 */
export interface IBillingRepository {
  // Billing Profiles
  getBillingProfile(clientId: string): Promise<ClientBillingProfile | null>;
  upsertBillingProfile(profile: NewClientBillingProfile): Promise<ClientBillingProfile>;

  // Payment Methods
  getPaymentMethods(clientId: string): Promise<PaymentMethod[]>;
  getDefaultPaymentMethod(clientId: string): Promise<PaymentMethod | null>;
  createPaymentMethod(method: NewPaymentMethod): Promise<PaymentMethod>;
  setDefaultPaymentMethod(clientId: string, methodId: string): Promise<void>;

  // Subscriptions
  getSubscriptionByClientId(clientId: string): Promise<Subscription | null>;
  createSubscription(subscription: NewSubscription): Promise<Subscription>;
  updateSubscriptionStatus(
    subscriptionId: string,
    status: Subscription["status"],
    updatedBy: string,
  ): Promise<Subscription>;
  updateSubscriptionTrial(
    subscriptionId: string,
    trialEndsAt: Date,
    updatedBy: string,
  ): Promise<Subscription>;
  listAllSubscriptions(): Promise<SubscriptionDetail[]>;
  getBillingOverviewMetrics(): Promise<BillingOverviewMetrics>;

  // Invoices
  getInvoiceById(invoiceId: string): Promise<Invoice | null>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null>;
  listInvoicesByClientId(clientId: string): Promise<Invoice[]>;
  listAllInvoices(limit?: number): Promise<Invoice[]>;
  createInvoice(invoice: NewInvoice): Promise<Invoice>;
  updateInvoiceStatus(
    invoiceId: string,
    status: Invoice["status"],
    paidAt?: Date,
  ): Promise<Invoice>;

  // Payments
  getPaymentByGatewayReference(gateway: string, reference: string): Promise<Payment | null>;
  createPayment(payment: NewPayment): Promise<Payment>;

  // Payment Receipts
  createReceipt(receipt: NewPaymentReceipt): Promise<PaymentReceipt>;
  getReceiptByPaymentId(paymentId: string): Promise<PaymentReceipt | null>;
  updateReceiptEmailStatus(receiptId: string, emailedTo: string, emailedAt: Date): Promise<PaymentReceipt>;
  listAllReceipts(limit?: number): Promise<PaymentReceipt[]>;

  // Subscription Changes
  recordSubscriptionChange(change: NewSubscriptionChange): Promise<SubscriptionChange>;

  // Payment Gateways Config (D-11 / SPEC-04)
  listPaymentGatewaysConfig(): Promise<PaymentGatewayConfigRow[]>;
  getPaymentGatewayConfig(id: SupportedPaymentGatewayId): Promise<PaymentGatewayConfigRow | null>;
  upsertPaymentGatewayConfig(config: NewPaymentGatewayConfigRow): Promise<PaymentGatewayConfigRow>;

  // Client & Plans lookup (SPEC-04)
  getClientBillingSummary?(clientId: string): Promise<ClientBillingSummary | null>;
  getPlanById?(planId: string): Promise<Plan | null>;
  listActivePublicPlans?(): Promise<Plan[]>;

  // Trial, Continuidad y Reportes Bre-B (SPEC-04)
  upsertTrialSubscription?(input: UpsertTrialSubscriptionInput): Promise<Subscription>;
  setSubscriptionPendingUpgrade?(
    subscriptionId: string,
    pendingUpgradePlanId: string | null,
    pendingUpgradeCycle: "monthly" | "annual" | null,
    actor: string,
  ): Promise<Subscription>;
  listManualPaymentReports?(filter?: {
    status?: "pending_review" | "approved" | "rejected";
    clientId?: string;
  }): Promise<ManualPaymentReportDetail[]>;
  getManualPaymentReportById?(reportId: string): Promise<ManualPaymentReportDetail | null>;
  getPendingManualReportByInvoiceId?(invoiceId: string): Promise<BillingManualPaymentReport | null>;
  getPendingManualReportByClientId?(clientId: string): Promise<BillingManualPaymentReport | null>;
  getLatestRejectedManualReportByClientId?(clientId: string): Promise<BillingManualPaymentReport | null>;
  createManualPaymentReport?(
    report: NewBillingManualPaymentReport,
  ): Promise<BillingManualPaymentReport>;
  approveManualPaymentReportTransaction?(input: {
    reportId: string;
    reviewerUserId: string;
    now: Date;
    receiptNumber: string;
  }): Promise<
    ApproveManualReportTxResult | { error: string; code: "NOT_FOUND" | "ALREADY_PROCESSED" }
  >;
  rejectManualPaymentReportTransaction?(input: {
    reportId: string;
    reviewerUserId: string;
    rejectionReason: string;
    now: Date;
  }): Promise<
    RejectManualReportTxResult | { error: string; code: "NOT_FOUND" | "ALREADY_PROCESSED" }
  >;
}

