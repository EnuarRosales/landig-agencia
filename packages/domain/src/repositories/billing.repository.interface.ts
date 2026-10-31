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

/**
 * Contrato de persistencia para el sistema de facturación SaaS (BILL-001 RF-01 a RF-04).
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

  // Invoices
  getInvoiceById(invoiceId: string): Promise<Invoice | null>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null>;
  listInvoicesByClientId(clientId: string): Promise<Invoice[]>;
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

  // Subscription Changes / Proration
  recordSubscriptionChange(change: NewSubscriptionChange): Promise<SubscriptionChange>;
}

