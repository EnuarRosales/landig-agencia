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
  billingManualPaymentReports,
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
  type BillingManualPaymentReport,
  type NewBillingManualPaymentReport,
} from "../db/schemas/admin/billing";
import {
  paymentGatewaysConfig,
  type PaymentGatewayConfigRow,
  type NewPaymentGatewayConfigRow,
} from "../db/schemas/admin/payment-gateways-config";
import { clients } from "../db/schemas/admin/clients";
import { plans, type Plan } from "../db/schemas/admin/plans";
import type {
  IBillingRepository,
  SubscriptionDetail,
  BillingOverviewMetrics,
  SupportedPaymentGatewayId,
  ClientBillingSummary,
  ManualPaymentReportDetail,
  UpsertTrialSubscriptionInput,
  ApproveManualReportTxResult,
  RejectManualReportTxResult,
} from "./billing.repository.interface";

/**
 * Calcula la fecha fin de ciclo a partir de un punto temporal base (`monthly` = +1 mes, `annual` = +1 año).
 */
function addCycleDuration(anchor: Date, cycle: "monthly" | "annual"): Date {
  const next = new Date(anchor.getTime());
  if (cycle === "annual") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

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

  async getPaymentGatewayConfig(
    id: SupportedPaymentGatewayId,
  ): Promise<PaymentGatewayConfigRow | null> {
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
          supportedCountries: config.supportedCountries,
          breBKeyType: config.breBKeyType,
          breBKeyValue: config.breBKeyValue,
          breBRecipientName: config.breBRecipientName,
          breBQrPayloadTemplate: config.breBQrPayloadTemplate,
          updatedAt: new Date(),
          updatedBy: config.updatedBy,
        },
      })
      .returning();
    return rows[0] as unknown as PaymentGatewayConfigRow;
  }

  async getClientBillingSummary(clientId: string): Promise<ClientBillingSummary | null> {
    const rows = await this.db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        contactEmail: clients.contactEmail,
        country: clients.country,
        currency: clients.currency,
        planId: clients.planId,
        locale: clients.locale,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      country: row.country ?? "CO",
    };
  }

  async getPlanById(planId: string): Promise<Plan | null> {
    const rows = await this.db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);
    return (rows[0] as Plan) ?? null;
  }

  async listActivePublicPlans(): Promise<Plan[]> {
    const rows = await this.db
      .select()
      .from(plans)
      .where(and(eq(plans.status, "active"), eq(plans.isPublic, true)))
      .orderBy(asc(plans.sortOrder));
    return rows as Plan[];
  }

  async upsertTrialSubscription(input: UpsertTrialSubscriptionInput): Promise<Subscription> {
    const rows = await this.db
      .insert(subscriptions)
      .values({
        clientId: input.clientId,
        planId: input.planId,
        status: "trialing",
        cycle: input.cycle,
        trialEndsAt: input.trialEndsAt,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        gateway: "trial",
        createdBy: input.actor,
        updatedBy: input.actor,
      })
      .onConflictDoUpdate({
        target: subscriptions.clientId,
        set: {
          planId: input.planId,
          status: "trialing",
          cycle: input.cycle,
          trialEndsAt: input.trialEndsAt,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          gateway: "trial",
          updatedBy: input.actor,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0] as unknown as Subscription;
  }

  async setSubscriptionPendingUpgrade(
    subscriptionId: string,
    pendingUpgradePlanId: string | null,
    pendingUpgradeCycle: "monthly" | "annual" | null,
    actor: string,
  ): Promise<Subscription> {
    const rows = await this.db
      .update(subscriptions)
      .set({
        pendingUpgradePlanId,
        pendingUpgradeCycle,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    return rows[0] as unknown as Subscription;
  }

  async listManualPaymentReports(filter?: {
    status?: "pending_review" | "approved" | "rejected";
    clientId?: string;
  }): Promise<ManualPaymentReportDetail[]> {
    const conditions = [];
    if (filter?.status) {
      conditions.push(eq(billingManualPaymentReports.status, filter.status));
    }
    if (filter?.clientId) {
      conditions.push(eq(billingManualPaymentReports.clientId, filter.clientId));
    }

    const baseQuery = this.db
      .select({
        report: billingManualPaymentReports,
        clientName: clients.displayName,
        clientSlug: clients.slug,
        clientCountry: clients.country,
        clientEmail: clients.contactEmail,
        clientLocale: clients.locale,
        planCode: plans.code,
        planName: plans.name,
        invoiceNumber: invoices.invoiceNumber,
        invoiceStatus: invoices.status,
      })
      .from(billingManualPaymentReports)
      .innerJoin(clients, eq(billingManualPaymentReports.clientId, clients.id))
      .innerJoin(plans, eq(billingManualPaymentReports.targetPlanId, plans.id))
      .innerJoin(invoices, eq(billingManualPaymentReports.invoiceId, invoices.id));

    const rows =
      conditions.length > 0
        ? await baseQuery
            .where(conditions.length === 1 ? conditions[0] : and(...conditions))
            .orderBy(desc(billingManualPaymentReports.createdAt))
        : await baseQuery.orderBy(desc(billingManualPaymentReports.createdAt));

    return rows.map((r) => ({
      ...r.report,
      clientName: r.clientName,
      clientSlug: r.clientSlug,
      clientCountry: r.clientCountry ?? "CO",
      clientEmail: r.clientEmail,
      clientLocale: r.clientLocale,
      planCode: r.planCode,
      planName: r.planName,
      invoiceNumber: r.invoiceNumber,
      invoiceStatus: r.invoiceStatus,
    }));
  }

  async getManualPaymentReportById(reportId: string): Promise<ManualPaymentReportDetail | null> {
    const rows = await this.db
      .select({
        report: billingManualPaymentReports,
        clientName: clients.displayName,
        clientSlug: clients.slug,
        clientCountry: clients.country,
        clientEmail: clients.contactEmail,
        clientLocale: clients.locale,
        planCode: plans.code,
        planName: plans.name,
        invoiceNumber: invoices.invoiceNumber,
        invoiceStatus: invoices.status,
      })
      .from(billingManualPaymentReports)
      .innerJoin(clients, eq(billingManualPaymentReports.clientId, clients.id))
      .innerJoin(plans, eq(billingManualPaymentReports.targetPlanId, plans.id))
      .innerJoin(invoices, eq(billingManualPaymentReports.invoiceId, invoices.id))
      .where(eq(billingManualPaymentReports.id, reportId))
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return {
      ...r.report,
      clientName: r.clientName,
      clientSlug: r.clientSlug,
      clientCountry: r.clientCountry ?? "CO",
      clientEmail: r.clientEmail,
      clientLocale: r.clientLocale,
      planCode: r.planCode,
      planName: r.planName,
      invoiceNumber: r.invoiceNumber,
      invoiceStatus: r.invoiceStatus,
    };
  }

  async getPendingManualReportByInvoiceId(
    invoiceId: string,
  ): Promise<BillingManualPaymentReport | null> {
    const rows = await this.db
      .select()
      .from(billingManualPaymentReports)
      .where(
        and(
          eq(billingManualPaymentReports.invoiceId, invoiceId),
          eq(billingManualPaymentReports.status, "pending_review"),
        ),
      )
      .limit(1);
    return (rows[0] as BillingManualPaymentReport) ?? null;
  }

  async getPendingManualReportByClientId(
    clientId: string,
  ): Promise<BillingManualPaymentReport | null> {
    const rows = await this.db
      .select()
      .from(billingManualPaymentReports)
      .where(
        and(
          eq(billingManualPaymentReports.clientId, clientId),
          eq(billingManualPaymentReports.status, "pending_review"),
        ),
      )
      .orderBy(desc(billingManualPaymentReports.createdAt))
      .limit(1);
    return (rows[0] as BillingManualPaymentReport) ?? null;
  }

  async getLatestRejectedManualReportByClientId(
    clientId: string,
  ): Promise<BillingManualPaymentReport | null> {
    const rows = await this.db
      .select()
      .from(billingManualPaymentReports)
      .where(
        and(
          eq(billingManualPaymentReports.clientId, clientId),
          eq(billingManualPaymentReports.status, "rejected"),
        ),
      )
      .orderBy(desc(billingManualPaymentReports.reviewedAt), desc(billingManualPaymentReports.createdAt))
      .limit(1);
    return (rows[0] as BillingManualPaymentReport) ?? null;
  }

  async createManualPaymentReport(
    report: NewBillingManualPaymentReport,
  ): Promise<BillingManualPaymentReport> {
    const rows = await this.db
      .insert(billingManualPaymentReports)
      .values(report)
      .returning();
    return rows[0] as unknown as BillingManualPaymentReport;
  }

  async approveManualPaymentReportTransaction(input: {
    reportId: string;
    reviewerUserId: string;
    now: Date;
    receiptNumber: string;
  }): Promise<
    ApproveManualReportTxResult | { error: string; code: "NOT_FOUND" | "ALREADY_PROCESSED" }
  > {
    return this.db.transaction(async (tx) => {
      const [report] = await tx
        .select()
        .from(billingManualPaymentReports)
        .where(eq(billingManualPaymentReports.id, input.reportId))
        .for("update");

      if (!report) {
        return { error: "Reporte de pago Bre-B no encontrado.", code: "NOT_FOUND" as const };
      }

      if (report.status !== "pending_review") {
        return {
          error: "Este reporte de pago Bre-B ya fue revisado previamente.",
          code: "ALREADY_PROCESSED" as const,
        };
      }

      const [updatedReport] = await tx
        .update(billingManualPaymentReports)
        .set({
          status: "approved",
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: input.now,
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(eq(billingManualPaymentReports.id, report.id))
        .returning();

      const [updatedInvoice] = await tx
        .update(invoices)
        .set({
          status: "paid",
          paidAt: input.now,
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(eq(invoices.id, report.invoiceId))
        .returning();

      const gatewayReference = report.paymentReference
        ? `breb_${report.id.slice(0, 8)}_${report.paymentReference}`
        : `breb_${report.id}`;

      const [createdPayment] = await tx
        .insert(payments)
        .values({
          clientId: report.clientId,
          invoiceId: report.invoiceId,
          gateway: "bre_b",
          gatewayReference,
          amountCents: Number(report.reportedAmountCents),
          currency: "COP",
          status: "approved",
          createdBy: input.reviewerUserId,
          updatedBy: input.reviewerUserId,
        })
        .returning();

      const [createdReceipt] = await tx
        .insert(paymentReceipts)
        .values({
          paymentId: createdPayment!.id,
          receiptNumber: input.receiptNumber,
          pdfUrl: `/receipts/${input.receiptNumber}.pdf`,
          emailedTo: null,
          emailedAt: null,
          createdBy: input.reviewerUserId,
          updatedBy: input.reviewerUserId,
        })
        .returning();

      const [existingSub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, report.subscriptionId))
        .for("update");

      const cycle = report.targetCycle as "monthly" | "annual";
      const anchorDate =
        report.operationKind === "renewal" &&
        existingSub &&
        existingSub.currentPeriodEnd.getTime() > input.now.getTime()
          ? existingSub.currentPeriodEnd
          : input.now;
      const nextPeriodStart =
        report.operationKind === "renewal" && existingSub
          ? existingSub.currentPeriodStart
          : input.now;
      const nextPeriodEnd = addCycleDuration(anchorDate, cycle);

      const [updatedSubscription] = await tx
        .update(subscriptions)
        .set({
          planId: report.targetPlanId,
          cycle,
          status: "active",
          gateway: "bre_b",
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
          pendingUpgradePlanId: null,
          pendingUpgradeCycle: null,
          d5ReminderSentAt: null,
          d0ReminderSentAt: null,
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(eq(subscriptions.id, report.subscriptionId))
        .returning();

      await tx
        .update(clients)
        .set({
          planId: report.targetPlanId,
          quotaVersion: sql`${clients.quotaVersion} + 1`,
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(eq(clients.id, report.clientId));

      return {
        report: updatedReport as BillingManualPaymentReport,
        payment: createdPayment as Payment,
        receipt: createdReceipt as PaymentReceipt,
        invoice: updatedInvoice as Invoice,
        subscription: updatedSubscription as Subscription,
      };
    });
  }

  async rejectManualPaymentReportTransaction(input: {
    reportId: string;
    reviewerUserId: string;
    rejectionReason: string;
    now: Date;
  }): Promise<
    RejectManualReportTxResult | { error: string; code: "NOT_FOUND" | "ALREADY_PROCESSED" }
  > {
    return this.db.transaction(async (tx) => {
      const [report] = await tx
        .select()
        .from(billingManualPaymentReports)
        .where(eq(billingManualPaymentReports.id, input.reportId))
        .for("update");

      if (!report) {
        return { error: "Reporte de pago Bre-B no encontrado.", code: "NOT_FOUND" as const };
      }

      if (report.status !== "pending_review") {
        return {
          error: "Este reporte de pago Bre-B ya fue revisado previamente.",
          code: "ALREADY_PROCESSED" as const,
        };
      }

      const [updatedReport] = await tx
        .update(billingManualPaymentReports)
        .set({
          status: "rejected",
          rejectionReason: input.rejectionReason,
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: input.now,
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(eq(billingManualPaymentReports.id, report.id))
        .returning();

      await tx
        .update(invoices)
        .set({
          status: "void",
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(and(eq(invoices.id, report.invoiceId), eq(invoices.status, "issued")));

      // Continuidad: nunca se degrada planId ni status vigente; solo se limpia pendingUpgrade*.
      const [updatedSub] = await tx
        .update(subscriptions)
        .set({
          pendingUpgradePlanId: null,
          pendingUpgradeCycle: null,
          updatedBy: input.reviewerUserId,
          updatedAt: input.now,
        })
        .where(eq(subscriptions.id, report.subscriptionId))
        .returning();

      return {
        report: updatedReport as BillingManualPaymentReport,
        subscription: updatedSub as Subscription,
      };
    });
  }
}

