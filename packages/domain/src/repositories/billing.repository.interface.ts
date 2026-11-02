import type { Result } from "../types/result";
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
} from "../db/schemas/admin/billing";
import type {
  PaymentGatewayConfigRow,
  NewPaymentGatewayConfigRow,
} from "../db/schemas/admin/payment-gateways-config";
import type { LocalizedText } from "../db/schemas/shared/i18n";

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

  // Payment Gateways Config (D-11)
  listPaymentGatewaysConfig(): Promise<PaymentGatewayConfigRow[]>;
  getPaymentGatewayConfig(id: "wompi" | "stripe"): Promise<PaymentGatewayConfigRow | null>;
  upsertPaymentGatewayConfig(config: NewPaymentGatewayConfigRow): Promise<PaymentGatewayConfigRow>;

  // Subscription Changes / Proration
  recordSubscriptionChange(change: NewSubscriptionChange): Promise<SubscriptionChange>;
}

