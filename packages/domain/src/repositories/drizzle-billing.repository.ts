import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  clientBillingProfiles,
  paymentMethods,
  subscriptions,
  invoices,
  payments,
  paymentReceipts,
  subscriptionChanges,
  type ClientBillingProfile,
  type NewClientBillingProfile,
  type PaymentMethod,
  type NewPaymentMethod,
  type Subscription,
  type NewSubscription,
  type Invoice,
  type NewInvoice,
  type Payment,
  type NewPayment,
  type PaymentReceipt,
  type NewPaymentReceipt,
  type SubscriptionChange,
  type NewSubscriptionChange,
} from "../db/schemas/admin/billing";
import {
  paymentGatewaysConfig,
  type PaymentGatewayConfigRow,
  type NewPaymentGatewayConfigRow,
} from "../db/schemas/admin/payment-gateways-config";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import type {
  IBillingRepository,
  SubscriptionDetail,
  BillingOverviewMetrics,
} from "./billing.repository.interface";

/**
 * Implementación Drizzle del repositorio de facturación SaaS (BILL-001).
 */
export class DrizzleBillingRepository implements IBillingRepository {
  constructor(private readonly db: PostgresJsDatabase<Record<string, unknown>>) {}

  async getBillingProfile(clientId: string): Promise<ClientBillingProfile | null> {
    const rows = await this.db
      .select()
      .from(clientBillingProfiles)
      .where(eq(clientBillingProfiles.clientId, clientId));
    return (rows[0] as ClientBillingProfile) ?? null;
  }

  async upsertBillingProfile(profile: NewClientBillingProfile): Promise<ClientBillingProfile> {
    const rows = await this.db
      .insert(clientBillingProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: clientBillingProfiles.clientId,
        set: {
          identityDocumentId: profile.identityDocumentId,
          dni: profile.dni,
          companyName: profile.companyName,
          email: profile.email,
          address: profile.address,
          cityCode: profile.cityCode,
          updatedBy: profile.updatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0] as unknown as ClientBillingProfile;
  }

  async getPaymentMethods(clientId: string): Promise<PaymentMethod[]> {
    return this.db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.clientId, clientId)) as unknown as Promise<PaymentMethod[]>;
  }

  async getDefaultPaymentMethod(clientId: string): Promise<PaymentMethod | null> {
    const rows = await this.db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.clientId, clientId),
          eq(paymentMethods.isDefault, true),
          eq(paymentMethods.status, "active"),
        ),
      );
    return (rows[0] as PaymentMethod) ?? null;
  }

  async createPaymentMethod(method: NewPaymentMethod): Promise<PaymentMethod> {
    const rows = await this.db.insert(paymentMethods).values(method).returning();
    return rows[0] as unknown as PaymentMethod;
  }

  async setDefaultPaymentMethod(clientId: string, methodId: string): Promise<void> {
    // 1. Quitar default a todos los demás del cliente
    await this.db
      .update(paymentMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(paymentMethods.clientId, clientId));

    // 2. Establecer el indicado como default
    await this.db
      .update(paymentMethods)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(paymentMethods.clientId, clientId), eq(paymentMethods.id, methodId)));
  }

  async getSubscriptionByClientId(clientId: string): Promise<Subscription | null> {
    const rows = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.clientId, clientId));
    return (rows[0] as Subscription) ?? null;
  }

  async createSubscription(subscription: NewSubscription): Promise<Subscription> {
    const rows = await this.db.insert(subscriptions).values(subscription).returning();
    return rows[0] as unknown as Subscription;
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: Subscription["status"],
    updatedBy: string,
  ): Promise<Subscription> {
    const rows = await this.db
      .update(subscriptions)
      .set({ status, updatedBy, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    return rows[0] as unknown as Subscription;
  }

  async getInvoiceById(invoiceId: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    return (rows[0] as Invoice) ?? null;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoiceNumber));
    return (rows[0] as Invoice) ?? null;
  }

  async listInvoicesByClientId(clientId: string): Promise<Invoice[]> {
    return this.db
      .select()
      .from(invoices)
      .where(eq(invoices.clientId, clientId)) as unknown as Promise<Invoice[]>;
  }

  async createInvoice(invoice: NewInvoice): Promise<Invoice> {
    const rows = await this.db.insert(invoices).values(invoice).returning();
    return rows[0] as unknown as Invoice;
  }

  async updateInvoiceStatus(
    invoiceId: string,
    status: Invoice["status"],
    paidAt?: Date,
  ): Promise<Invoice> {
    const rows = await this.db
      .update(invoices)
      .set({
        status,
        paidAt: paidAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return rows[0] as unknown as Invoice;
  }

  async getPaymentByGatewayReference(gateway: string, reference: string): Promise<Payment | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.gateway, gateway),
          eq(payments.gatewayReference, reference),
        ),
      );
    return (rows[0] as Payment) ?? null;
  }

  async createPayment(payment: NewPayment): Promise<Payment> {
    const rows = await this.db.insert(payments).values(payment).returning();
    return rows[0] as unknown as Payment;
  }

  async createReceipt(receipt: NewPaymentReceipt): Promise<PaymentReceipt> {
    const rows = await this.db.insert(paymentReceipts).values(receipt).returning();
    return rows[0] as unknown as PaymentReceipt;
  }

  async getReceiptByPaymentId(paymentId: string): Promise<PaymentReceipt | null> {
    const rows = await this.db
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.paymentId, paymentId));
    return (rows[0] as PaymentReceipt) ?? null;
  }

  async updateReceiptEmailStatus(
    receiptId: string,
    emailedTo: string,
    emailedAt: Date,
  ): Promise<PaymentReceipt> {
    const rows = await this.db
      .update(paymentReceipts)
      .set({
        emailedTo,
        emailedAt,
        updatedAt: new Date(),
      })
      .where(eq(paymentReceipts.id, receiptId))
      .returning();
    return rows[0] as unknown as PaymentReceipt;
  }

  async recordSubscriptionChange(change: NewSubscriptionChange): Promise<SubscriptionChange> {
    const rows = await this.db.insert(subscriptionChanges).values(change).returning();
    return rows[0] as unknown as SubscriptionChange;
  }

  async updateSubscriptionTrial(
    subscriptionId: string,
    trialEndsAt: Date,
    updatedBy: string,
  ): Promise<Subscription> {
    const rows = await this.db
      .update(subscriptions)
      .set({
        trialEndsAt,
        status: "trialing",
        updatedAt: new Date(),
        updatedBy,
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    return rows[0] as unknown as Subscription;
  }

  async listAllSubscriptions(): Promise<SubscriptionDetail[]> {
    const rows = await this.db
      .select({
        id: subscriptions.id,
        clientId: subscriptions.clientId,
        clientName: clients.displayName,
        clientSlug: clients.slug,
        planId: subscriptions.planId,
        planCode: plans.code,
        planName: plans.name,
        planPriceMonthlyCents: plans.priceMonthlyCents,
        planPriceAnnualCents: plans.priceAnnualCents,
        currency: plans.currency,
        status: subscriptions.status,
        cycle: subscriptions.cycle,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        createdAt: subscriptions.createdAt,
        billingCompanyName: clientBillingProfiles.companyName,
        billingDni: clientBillingProfiles.dni,
        billingEmail: clientBillingProfiles.email,
      })
      .from(subscriptions)
      .innerJoin(clients, eq(subscriptions.clientId, clients.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .leftJoin(clientBillingProfiles, eq(subscriptions.clientId, clientBillingProfiles.clientId))
      .orderBy(desc(subscriptions.createdAt));

    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName,
      clientSlug: r.clientSlug,
      planId: r.planId,
      planCode: r.planCode,
      planName: r.planName,
      planPriceMonthlyCents: Number(r.planPriceMonthlyCents),
      planPriceAnnualCents: Number(r.planPriceAnnualCents),
      currency: r.currency,
      status: r.status,
      cycle: r.cycle,
      trialEndsAt: r.trialEndsAt,
      currentPeriodStart: r.currentPeriodStart,
      currentPeriodEnd: r.currentPeriodEnd,
      createdAt: r.createdAt,
      billingProfile: r.billingCompanyName
        ? {
            companyName: r.billingCompanyName,
            dni: r.billingDni!,
            email: r.billingEmail!,
          }
        : null,
    }));
  }

  async getBillingOverviewMetrics(): Promise<BillingOverviewMetrics> {
    const allSubs = await this.listAllSubscriptions();
    let mrrCents = 0;
    let activeCount = 0;
    let trialingCount = 0;
    let pastDueCount = 0;

    for (const sub of allSubs) {
      if (sub.status === "active") {
        activeCount++;
        // Si el ciclo es mensual suma el mensual, si es anual prorratea / 12
        mrrCents += sub.cycle === "annual"
          ? Math.round(sub.planPriceAnnualCents / 12)
          : sub.planPriceMonthlyCents;
      } else if (sub.status === "trialing") {
        trialingCount++;
      } else if (sub.status === "past_due") {
        pastDueCount++;
      }
    }

    const [invoicesCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices);

    return {
      mrrCents,
      activeCount,
      trialingCount,
      pastDueCount,
      totalInvoicesCount: invoicesCountRow?.count ?? 0,
    };
  }

  async listAllInvoices(limit: number = 50): Promise<Invoice[]> {
    const rows = await this.db
      .select()
      .from(invoices)
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
    return rows as unknown as Invoice[];
  }

  async listAllReceipts(limit: number = 50): Promise<PaymentReceipt[]> {
    const rows = await this.db
      .select()
      .from(paymentReceipts)
      .orderBy(desc(paymentReceipts.createdAt))
      .limit(limit);
    return rows as unknown as PaymentReceipt[];
  }

  async listPaymentGatewaysConfig(): Promise<PaymentGatewayConfigRow[]> {
    const rows = await this.db
      .select()
      .from(paymentGatewaysConfig)
      .orderBy(asc(paymentGatewaysConfig.id));
    return rows as unknown as PaymentGatewayConfigRow[];
  }

  async getPaymentGatewayConfig(id: "wompi" | "stripe"): Promise<PaymentGatewayConfigRow | null> {
    const rows = await this.db
      .select()
      .from(paymentGatewaysConfig)
      .where(eq(paymentGatewaysConfig.id, id))
      .limit(1);
    return (rows[0] as unknown as PaymentGatewayConfigRow) ?? null;
  }

  async upsertPaymentGatewayConfig(
    config: NewPaymentGatewayConfigRow,
  ): Promise<PaymentGatewayConfigRow> {
    const rows = await this.db
      .insert(paymentGatewaysConfig)
      .values(config)
      .onConflictDoUpdate({
        target: paymentGatewaysConfig.id,
        set: {
          displayName: config.displayName,
          isEnabled: config.isEnabled,
          environment: config.environment,
          publicKey: config.publicKey,
          secretKeyEncrypted: config.secretKeyEncrypted,
          webhookSecretEncrypted: config.webhookSecretEncrypted,
          secretKeyId: config.secretKeyId,
          webhookUrl: config.webhookUrl,
          updatedAt: new Date(),
          updatedBy: config.updatedBy,
        },
      })
      .returning();
    return rows[0] as unknown as PaymentGatewayConfigRow;
  }
}

