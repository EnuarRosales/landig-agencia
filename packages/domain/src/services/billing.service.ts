import { randomUUID } from "crypto";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getDb } from "../db/client";
import { DrizzleBillingRepository } from "../repositories/drizzle-billing.repository";
import type {
  IBillingRepository,
  SubscriptionDetail,
  BillingOverviewMetrics,
  SupportedPaymentGatewayId,
  ManualPaymentReportDetail,
} from "../repositories/billing.repository.interface";
import { defaultTotpCryptoService, type TotpCryptoService } from "../auth/totp-crypto";
import type {
  ClientBillingProfile,
  NewClientBillingProfile,
  PaymentMethod,
  NewPaymentMethod,
  Subscription,
  Invoice,
  Payment,
  PaymentReceipt,
  BillingManualPaymentReport,
} from "../db/schemas/admin/billing";
import type { PaymentGatewayConfigRow } from "../db/schemas/admin/payment-gateways-config";
import { validateMediaMagicBytes } from "../utils/media-magic-bytes";
import { S3StorageService } from "./s3-storage.service";
import { BreBQrService, defaultBreBQrService } from "./breb-qr.service";
import { getReferralsService, type ReferralsService } from "./referrals.service";
import {
  buildAdminBreBReviewUrl,
  buildAdminPortalUrl,
  getNotificationDispatcherService,
} from "./notification-dispatcher.service";

export type BillingReferralsFacade = Pick<
  ReferralsService,
  "redeemCreditsFefoForInvoice" | "qualifyReferral"
>;
import { sendSystemNotificationEmail } from "./admin-dashboard.service";

export const MAX_VOUCHER_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

const ALLOWED_VOUCHER_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const VALID_BRE_B_KEY_TYPES = new Set([
  "phone",
  "email",
  "document",
  "alphanumeric",
  "merchant_code",
]);

export interface PaymentGatewayPublicView {
  id: SupportedPaymentGatewayId;
  displayName: string;
  isEnabled: boolean;
  environment: "sandbox" | "production";
  publicKey: string | null;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  supportedCountries: string[];
  breBKeyType: string | null;
  breBKeyValue: string | null;
  breBRecipientName: string | null;
  breBQrPayloadTemplate: string | null;
  updatedAt: Date;
}

export interface UpdatePaymentGatewayInput {
  id: SupportedPaymentGatewayId;
  displayName?: string;
  isEnabled: boolean;
  environment: "sandbox" | "production";
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  webhookUrl?: string;
  supportedCountries?: string[];
  breBKeyType?: string | null;
  breBKeyValue?: string | null;
  breBRecipientName?: string | null;
  breBQrPayloadTemplate?: string | null;
  actor: string;
}

export interface ActivateTrialInput {
  clientId: string;
  planId?: string;
  cycle?: "monthly" | "annual";
  executedBy: string;
}

export interface SubmitManualBreBReportInput {
  clientId: string;
  invoiceId: string;
  targetPlanId: string;
  targetCycle: "monthly" | "annual";
  operationKind: "new_subscription" | "renewal" | "upgrade";
  paymentReference?: string | null;
  reportedAmountCents: number;
  fileBuffer: Buffer;
  submittedByUserId: string;
}

export interface ReviewManualBreBReportInput {
  reportId: string;
  action: "approve" | "reject";
  rejectionReason?: string;
  reviewerUserId: string;
}

export interface ReviewManualBreBReportOutput {
  report: BillingManualPaymentReport;
  subscription: Subscription;
  payment?: Payment;
  receipt?: PaymentReceipt;
  invoice?: Invoice;
}

export interface RegisterPaymentInput {
  clientId: string;
  invoiceId: string;
  gateway: "wompi" | "stripe" | "bre_b";
  gatewayReference: string;
  amountCents: number;
  currency: "COP" | "USD";
  executedBy: string;
}

export interface RegisterPaymentResult {
  payment: Payment;
  receipt: PaymentReceipt;
  invoice: Invoice;
  alreadyProcessed: boolean;
}

export interface CalculateProrationInput {
  currentPriceCents: number;
  newPriceCents: number;
  cycleDays: number;
  remainingDays: number;
}

export interface ProrationResult {
  creditCents: number;
  chargeCents: number;
  netCents: number; // positivo: saldo a pagar adicional; negativo: crédito a favor
}

export interface IBillingNotificationDispatcher {
  dispatchPaymentSucceeded(params: {
    clientId?: string;
    tenantName: string;
    recipientEmail: string;
    planName: string;
    amountFormatted: string;
    currency: string;
    receiptNumber: string;
    receiptPdfUrl?: string;
  }): Promise<{ dispatched: boolean; deliveryId?: string }>;

  dispatchBreBReviewResult?(params: {
    clientId: string;
    tenantName: string;
    recipientEmail: string;
    locale: string;
    action: "approve" | "reject";
    planName: string;
    amountFormattedCop: string;
    receiptNumber?: string;
    rejectionReason?: string;
    reportId: string;
  }): Promise<{ dispatched: boolean; deliveryId?: string }>;

  dispatchBreBPendingAdminNotice?(params: {
    clientId: string;
    reportId: string;
    planName: string;
    amountFormattedCop: string;
    paymentReference?: string | null;
  }): Promise<{ dispatched: boolean; sentCount?: number }>;
}

/**
 * Servicio de Dominio para el ciclo de Facturación SaaS y Conciliación de Pagos (BILL-001, SPEC-04).
 */
export class BillingService {
  constructor (
    private readonly repository: IBillingRepository,
    private readonly notificationDispatcher?: IBillingNotificationDispatcher,
    private readonly totpCrypto: TotpCryptoService = defaultTotpCryptoService,
    private readonly storageService: Pick<S3StorageService, "putObject" | "getObject"> = new S3StorageService(),
    private readonly breBQrService: BreBQrService = defaultBreBQrService,
    private readonly referralsService?: BillingReferralsFacade,
  ) { }

  /**
   * Calcula el prorrateo financiero por cambio de plan a mitad de ciclo (RF-01.5).
   *
   * credit = precio_actual × días_restantes / días_del_ciclo
   * charge = precio_nuevo × días_restantes / días_del_ciclo
   * net = charge − credit
   */
  calculateProration(input: CalculateProrationInput): ProrationResult {
    if (input.cycleDays <= 0 || input.remainingDays <= 0) {
      return { creditCents: 0, chargeCents: 0, netCents: 0 };
    }

    const cappedRemaining = Math.min(input.remainingDays, input.cycleDays);
    const creditCents = Math.round(
      (input.currentPriceCents * cappedRemaining) / input.cycleDays,
    );
    const chargeCents = Math.round(
      (input.newPriceCents * cappedRemaining) / input.cycleDays,
    );
    const netCents = chargeCents - creditCents;

    return { creditCents, chargeCents, netCents };
  }

  /**
   * Registra y concilia un pago proveniente de pasarela de forma idempotente (RF-02.4).
   */
  async registerPayment(input: RegisterPaymentInput): Promise<Result<RegisterPaymentResult>> {
    try {
      // 1. Verificar idempotencia por gateway + reference
      const existing = await this.repository.getPaymentByGatewayReference(
        input.gateway,
        input.gatewayReference,
      );

      if (existing) {
        appLogger.info("[BillingService] Pago ya procesado previamente (idempotente)", {
          gateway: input.gateway,
          reference: input.gatewayReference,
          paymentId: existing.id,
        });

        const receipt = await this.repository.getReceiptByPaymentId(existing.id);
        const invoice = await this.repository.getInvoiceById(existing.invoiceId);

        return ok({
          payment: existing,
          receipt: receipt!,
          invoice: invoice!,
          alreadyProcessed: true,
        });
      }

      // 2. Buscar factura
      const invoice = await this.repository.getInvoiceById(input.invoiceId);
      if (!invoice) {
        return err(`Factura ${input.invoiceId} no encontrada.`, "INVOICE_NOT_FOUND");
      }

      // 3. Crear registro de pago
      const payment = await this.repository.createPayment({
        clientId: input.clientId,
        invoiceId: input.invoiceId,
        gateway: input.gateway,
        gatewayReference: input.gatewayReference,
        amountCents: input.amountCents,
        currency: input.currency,
        status: "approved",
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // 4. Actualizar estado de factura a 'paid'
      const updatedInvoice = await this.repository.updateInvoiceStatus(
        input.invoiceId,
        "paid",
        new Date(),
      );

      // 5. Generar comprobante interno de pago
      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const receiptNumber = `REC-${year}-${randomSuffix}`;

      const receipt = await this.repository.createReceipt({
        paymentId: payment.id,
        receiptNumber,
        pdfUrl: `/receipts/${receiptNumber}.pdf`,
        emailedTo: null,
        emailedAt: null,
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      let finalReceipt = receipt;

      // 6. Si hay dispatcher de notificaciones (NTF-001) y perfil fiscal, enviar correo con comprobante (T-07)
      if (this.notificationDispatcher) {
        try {
          const profile = await this.repository.getBillingProfile(input.clientId);
          const recipientEmail = profile?.email;
          if (recipientEmail) {
            const amountFormatted = (input.amountCents / 100).toFixed(2);
            await this.notificationDispatcher.dispatchPaymentSucceeded({
              clientId: input.clientId,
              tenantName: profile.companyName,
              recipientEmail,
              planName: "Suscripción Mocter",
              amountFormatted,
              currency: input.currency,
              receiptNumber,
              receiptPdfUrl: receipt.pdfUrl ?? undefined,
            });

            finalReceipt = await this.repository.updateReceiptEmailStatus(
              receipt.id,
              recipientEmail,
              new Date(),
            );
          }
        } catch (emailErr) {
          appLogger.warn("[BillingService] No se pudo despachar correo de comprobante", {
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
            receiptId: receipt.id,
          });
        }
      }

      // 7. Si el cliente tiene suscripción, actualizar a 'active' si estaba past_due
      const sub = await this.repository.getSubscriptionByClientId(input.clientId);
      if (sub && sub.status === "past_due") {
        await this.repository.updateSubscriptionStatus(sub.id, "active", input.executedBy);
      }

      // 8. Consolidar redención FEFO de créditos planificados en la factura y calificar referido si aplica (SPEC-16 D-02/D-03)
      if (this.referralsService) {
        const plannedCreditCents = Number(invoice.creditCents ?? 0);
        if (plannedCreditCents > 0) {
          try {
            await this.referralsService.redeemCreditsFefoForInvoice({
              clientId: input.clientId,
              invoiceId: invoice.id,
              maxAmountCents: plannedCreditCents,
              currency: input.currency,
              executedBy: input.executedBy,
            });
          } catch (redeemErr: unknown) {
            appLogger.warn("[BillingService.registerPayment] Fallo al consolidar redención FEFO", {
              clientId: input.clientId,
              invoiceId: invoice.id,
              error: redeemErr instanceof Error ? redeemErr.message : String(redeemErr),
            });
          }
        }

        try {
          await this.referralsService.qualifyReferral({
            referredClientId: input.clientId,
            firstInvoiceAmountCents: Number(invoice.subtotalCents || input.amountCents),
            currency: input.currency,
            executedBy: input.executedBy,
          });
        } catch (qualifyErr: unknown) {
          appLogger.warn("[BillingService.registerPayment] Fallo no bloqueante al calificar referido", {
            clientId: input.clientId,
            invoiceId: invoice.id,
            error: qualifyErr instanceof Error ? qualifyErr.message : String(qualifyErr),
          });
        }
      }

      appLogger.info("[BillingService] Pago registrado y conciliado exitosamente", {
        clientId: input.clientId,
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        receiptNumber,
      });

      return ok({
        payment,
        receipt: finalReceipt,
        invoice: updatedInvoice,
        alreadyProcessed: false,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService] Error al registrar pago: ${msg}`, error);
      return err(msg, "BILLING_PAYMENT_ERROR");
    }
  }

  /**
   * Guarda o actualiza los datos fiscales Matías API del inquilino (RF-04).
   */
  async upsertBillingProfile(
    profile: NewClientBillingProfile,
  ): Promise<Result<ClientBillingProfile>> {
    try {
      const saved = await this.repository.upsertBillingProfile(profile);
      return ok(saved);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService] Error al guardar perfil fiscal: ${msg}`, error);
      return err(msg, "BILLING_PROFILE_ERROR");
    }
  }

  /**
   * Obtiene la vista consolidada de facturación para el Platform Owner (D-10).
   */
  async getAdminBillingOverview(): Promise<Result<{
    metrics: BillingOverviewMetrics;
    subscriptions: SubscriptionDetail[];
    recentInvoices: Invoice[];
    recentReceipts: PaymentReceipt[];
  }>> {
    try {
      const [metrics, subscriptions, recentInvoices, recentReceipts] = await Promise.all([
        this.repository.getBillingOverviewMetrics(),
        this.repository.listAllSubscriptions(),
        this.repository.listAllInvoices(30),
        this.repository.listAllReceipts(30),
      ]);
      return ok({ metrics, subscriptions, recentInvoices, recentReceipts });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.getAdminBillingOverview] Error: ${msg}`, error);
      return err(msg, "BILLING_OVERVIEW_ERROR");
    }
  }

  /**
   * Ejecuta una acción de soporte sobre una suscripción (extender trial, suspender, reactivar).
   */
  async manageSubscriptionAction(
    subscriptionId: string,
    action: "extend_trial" | "suspend" | "activate",
    params: { days?: number; actor: string },
  ): Promise<Result<Subscription>> {
    try {
      if (action === "extend_trial") {
        const days = params.days && params.days > 0 ? params.days : 14;
        const newTrialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const updated = await this.repository.updateSubscriptionTrial(
          subscriptionId,
          newTrialEndsAt,
          params.actor,
        );
        return ok(updated);
      } else if (action === "suspend") {
        const updated = await this.repository.updateSubscriptionStatus(
          subscriptionId,
          "suspended",
          params.actor,
        );
        return ok(updated);
      } else if (action === "activate") {
        const updated = await this.repository.updateSubscriptionStatus(
          subscriptionId,
          "active",
          params.actor,
        );
        return ok(updated);
      }
      return err("Acción de suscripción inválida", "INVALID_ACTION");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.manageSubscriptionAction] Error: ${msg}`, error);
      return err(msg, "SUBSCRIPTION_ACTION_ERROR");
    }
  }

  /**
   * Obtiene la configuración pública de pasarelas registradas para el backoffice.
   */
  async listPaymentGatewaysPublicConfig(): Promise<Result<PaymentGatewayPublicView[]>> {
    try {
      const rows = await this.repository.listPaymentGatewaysConfig();
      const views: PaymentGatewayPublicView[] = [
        {
          id: "wompi",
          displayName: "Wompi (Colombia / COP)",
          isEnabled: false,
          environment: "sandbox",
          publicKey: null,
          hasSecretKey: false,
          hasWebhookSecret: false,
          webhookUrl: "/api/webhooks/wompi",
          supportedCountries: ["CO"],
          breBKeyType: null,
          breBKeyValue: null,
          breBRecipientName: null,
          breBQrPayloadTemplate: null,
          updatedAt: new Date(),
        },
        {
          id: "stripe",
          displayName: "Stripe (Internacional / USD)",
          isEnabled: false,
          environment: "sandbox",
          publicKey: null,
          hasSecretKey: false,
          hasWebhookSecret: false,
          webhookUrl: "/api/webhooks/stripe",
          supportedCountries: ["*"],
          breBKeyType: null,
          breBKeyValue: null,
          breBRecipientName: null,
          breBQrPayloadTemplate: null,
          updatedAt: new Date(),
        },
        {
          id: "bre_b",
          displayName: "Bre-B (Colombia / COP)",
          isEnabled: false,
          environment: "production",
          publicKey: null,
          hasSecretKey: false,
          hasWebhookSecret: false,
          webhookUrl: "/api/tenant/billing/bre-b/report",
          supportedCountries: ["CO"],
          breBKeyType: null,
          breBKeyValue: null,
          breBRecipientName: null,
          breBQrPayloadTemplate: null,
          updatedAt: new Date(),
        },
      ];

      for (const row of rows) {
        const idx = views.findIndex((v) => v.id === row.id);
        if (idx !== -1) {
          views[idx] = {
            id: row.id as SupportedPaymentGatewayId,
            displayName: row.displayName || views[idx]!.displayName,
            isEnabled: row.isEnabled,
            environment: (row.environment as "sandbox" | "production") || "sandbox",
            publicKey: row.publicKey ?? null,
            hasSecretKey: Boolean(row.secretKeyEncrypted && row.secretKeyId),
            hasWebhookSecret: Boolean(row.webhookSecretEncrypted && row.secretKeyId),
            webhookUrl: row.webhookUrl || views[idx]!.webhookUrl,
            supportedCountries:
              row.supportedCountries && row.supportedCountries.length > 0
                ? row.supportedCountries
                : views[idx]!.supportedCountries,
            breBKeyType: row.breBKeyType ?? null,
            breBKeyValue: row.breBKeyValue ?? null,
            breBRecipientName: row.breBRecipientName ?? null,
            breBQrPayloadTemplate: row.breBQrPayloadTemplate ?? null,
            updatedAt: row.updatedAt,
          };
        }
      }

      return ok(views);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.listPaymentGatewaysPublicConfig] Error: ${msg}`, error);
      return err(msg, "GATEWAYS_CONFIG_ERROR");
    }
  }

  /**
   * Actualiza o crea la configuración de una pasarela o canal (`wompi`, `stripe`, `bre_b`).
   */
  async upsertPaymentGatewayConfig(
    input: UpdatePaymentGatewayInput,
  ): Promise<Result<PaymentGatewayPublicView>> {
    try {
      const existing = await this.repository.getPaymentGatewayConfig(input.id);

      if (input.id === "bre_b" && input.supportedCountries && input.supportedCountries.length > 0) {
        const normalized = input.supportedCountries.map((c) => c.trim().toUpperCase());
        if (normalized.some((c) => c !== "CO")) {
          return err(
            "El canal de cobro Bre-B está restringido exclusivamente a Colombia (CO).",
            "BRE_B_COLOMBIA_ONLY",
          );
        }
      }

      const resolvedKeyType =
        input.breBKeyType !== undefined ? input.breBKeyType : existing?.breBKeyType ?? null;
      const resolvedKeyValue =
        input.breBKeyValue !== undefined ? input.breBKeyValue : existing?.breBKeyValue ?? null;
      const resolvedRecipientName =
        input.breBRecipientName !== undefined
          ? input.breBRecipientName
          : existing?.breBRecipientName ?? null;
      const resolvedQrTemplate =
        input.breBQrPayloadTemplate !== undefined
          ? input.breBQrPayloadTemplate
          : existing?.breBQrPayloadTemplate ?? null;

      if (resolvedKeyType && !VALID_BRE_B_KEY_TYPES.has(resolvedKeyType)) {
        return err(
          `Tipo de llave Bre-B inválido: "${resolvedKeyType}".`,
          "INVALID_BRE_B_KEY_TYPE",
        );
      }

      if (input.id === "bre_b" && input.isEnabled) {
        if (!resolvedKeyType?.trim() || !resolvedKeyValue?.trim() || !resolvedRecipientName?.trim()) {
          return err(
            "Para habilitar Bre-B debes configurar tipo de llave, valor de llave y nombre del titular receptor.",
            "BRE_B_NOT_CONFIGURED",
          );
        }
      }

      let secretKeyEncrypted = existing?.secretKeyEncrypted ?? null;
      let webhookSecretEncrypted = existing?.webhookSecretEncrypted ?? null;
      let secretKeyId = existing?.secretKeyId ?? null;

      if (input.secretKey && input.secretKey.trim()) {
        const encrypted = this.totpCrypto.encrypt(
          input.secretKey.trim(),
          `gateway_config:${input.id}:secret_key`,
        );
        secretKeyEncrypted = encrypted.ciphertext;
        secretKeyId = encrypted.keyId;
      }

      if (input.webhookSecret && input.webhookSecret.trim()) {
        const encrypted = this.totpCrypto.encrypt(
          input.webhookSecret.trim(),
          `gateway_config:${input.id}:webhook_secret`,
        );
        webhookSecretEncrypted = encrypted.ciphertext;
        secretKeyId = encrypted.keyId;
      }

      const defaultDisplayNames: Record<SupportedPaymentGatewayId, string> = {
        wompi: "Wompi (Colombia / COP)",
        stripe: "Stripe (Internacional / USD)",
        bre_b: "Bre-B (Colombia / COP)",
      };
      const defaultWebhookUrls: Record<SupportedPaymentGatewayId, string> = {
        wompi: "/api/webhooks/wompi",
        stripe: "/api/webhooks/stripe",
        bre_b: "/api/tenant/billing/bre-b/report",
      };
      const resolvedCountries =
        input.id === "bre_b"
          ? ["CO"]
          : input.supportedCountries && input.supportedCountries.length > 0
            ? input.supportedCountries
            : existing?.supportedCountries ?? (input.id === "wompi" ? ["CO"] : ["*"]);

      const now = new Date();
      const saved = await this.repository.upsertPaymentGatewayConfig({
        id: input.id,
        displayName: input.displayName || defaultDisplayNames[input.id],
        isEnabled: input.isEnabled,
        environment: input.environment,
        publicKey: input.publicKey !== undefined ? input.publicKey : existing?.publicKey ?? null,
        secretKeyEncrypted,
        webhookSecretEncrypted,
        secretKeyId,
        webhookUrl: input.webhookUrl || defaultWebhookUrls[input.id],
        supportedCountries: resolvedCountries,
        breBKeyType: input.id === "bre_b" ? resolvedKeyType : null,
        breBKeyValue: input.id === "bre_b" ? resolvedKeyValue : null,
        breBRecipientName: input.id === "bre_b" ? resolvedRecipientName : null,
        breBQrPayloadTemplate: input.id === "bre_b" ? resolvedQrTemplate : null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        createdBy: existing?.createdBy ?? input.actor,
        updatedBy: input.actor,
      });

      return ok({
        id: saved.id as SupportedPaymentGatewayId,
        displayName: saved.displayName,
        isEnabled: saved.isEnabled,
        environment: saved.environment as "sandbox" | "production",
        publicKey: saved.publicKey ?? null,
        hasSecretKey: Boolean(saved.secretKeyEncrypted && saved.secretKeyId),
        hasWebhookSecret: Boolean(saved.webhookSecretEncrypted && saved.secretKeyId),
        webhookUrl: saved.webhookUrl || defaultWebhookUrls[input.id],
        supportedCountries: saved.supportedCountries ?? resolvedCountries,
        breBKeyType: saved.breBKeyType ?? null,
        breBKeyValue: saved.breBKeyValue ?? null,
        breBRecipientName: saved.breBRecipientName ?? null,
        breBQrPayloadTemplate: saved.breBQrPayloadTemplate ?? null,
        updatedAt: saved.updatedAt,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.upsertPaymentGatewayConfig] Error: ${msg}`, error);
      return err(msg, "GATEWAYS_UPDATE_ERROR");
    }
  }

  /**
   * Inicia o retorna idempotentemente el periodo de prueba (`trialing`) para un espacio (SPEC-04 §3.2).
   */
  async activateTrialForTenant(input: ActivateTrialInput): Promise<Result<Subscription>> {
    try {
      const client = await this.repository.getClientBillingSummary?.(input.clientId);
      if (!client) {
        return err("Espacio de inquilino no encontrado.", "CLIENT_NOT_FOUND");
      }

      const targetPlanId = input.planId || client.planId;
      if (!targetPlanId) {
        return err("El espacio no tiene un plan asignado para iniciar el periodo de prueba.", "PLAN_NOT_FOUND");
      }

      const plan = await this.repository.getPlanById?.(targetPlanId);
      if (!plan) {
        return err("El plan seleccionado no existe.", "PLAN_NOT_FOUND");
      }

      if (!plan.trialDays || plan.trialDays <= 0) {
        return err(
          "El plan seleccionado no incluye días de prueba gratuita.",
          "TRIAL_NOT_AVAILABLE",
        );
      }

      const now = new Date();
      const existingSub = await this.repository.getSubscriptionByClientId(input.clientId);

      if (existingSub) {
        if (
          existingSub.status === "trialing" &&
          existingSub.trialEndsAt &&
          existingSub.trialEndsAt.getTime() > now.getTime()
        ) {
          return ok(existingSub);
        }
        if (existingSub.status === "active") {
          return err(
            "El espacio ya cuenta con una suscripción activa pagada.",
            "ALREADY_ACTIVE_SUBSCRIPTION",
          );
        }
        return err(
          "Este espacio ya consumió su periodo de prueba anteriormente.",
          "TRIAL_ALREADY_USED",
        );
      }

      if (!this.repository.upsertTrialSubscription) {
        return err("Repositorio de facturación sin soporte de trial.", "UNSUPPORTED_OPERATION");
      }

      const trialEndsAt = new Date(now.getTime() + plan.trialDays * 86_400_000);
      const sub = await this.repository.upsertTrialSubscription({
        clientId: input.clientId,
        planId: targetPlanId,
        cycle: input.cycle ?? "monthly",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        actor: input.executedBy,
      });

      appLogger.info("[BillingService.activateTrialForTenant] Periodo de prueba activado", {
        clientId: input.clientId,
        planId: targetPlanId,
        trialDays: plan.trialDays,
        trialEndsAt: trialEndsAt.toISOString(),
      });

      return ok(sub);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.activateTrialForTenant] Error: ${msg}`, error);
      return err(msg, "TRIAL_ACTIVATION_ERROR");
    }
  }

  /**
   * Registra un reporte de pago manual vía Bre-B con carga privada del comprobante a SeaweedFS
   * y **garantía estricta de continuidad operativa** (`SPEC-04 RN-SPEC-04-06`).
   */
  async submitManualBreBReport(
    input: SubmitManualBreBReportInput,
  ): Promise<Result<{ report: BillingManualPaymentReport; subscription: Subscription }>> {
    try {
      if (!input.fileBuffer || input.fileBuffer.byteLength === 0) {
        return err("Debes adjuntar el comprobante de pago Bre-B.", "INVALID_VOUCHER_FILE");
      }

      if (input.fileBuffer.byteLength > MAX_VOUCHER_SIZE_BYTES) {
        return err(
          "El comprobante supera el límite máximo permitido de 10 MB.",
          "INVALID_VOUCHER_FILE",
        );
      }

      const magic = validateMediaMagicBytes(input.fileBuffer);
      const extension = magic.detectedMime ? ALLOWED_VOUCHER_MIME_EXTENSIONS[magic.detectedMime] : undefined;
      if (!magic.valid || !magic.detectedMime || !extension) {
        return err(
          magic.error || "Formato de comprobante no admitido. Usa PNG, JPG, WEBP o PDF.",
          "INVALID_VOUCHER_FILE",
        );
      }

      if (!Number.isInteger(input.reportedAmountCents) || input.reportedAmountCents <= 0) {
        return err("El monto reportado del pago Bre-B debe ser mayor a cero.", "INVALID_AMOUNT");
      }

      const breBConfig = await this.repository.getPaymentGatewayConfig("bre_b");
      if (!breBConfig || !breBConfig.isEnabled) {
        return err(
          "El canal de pago inmediato Bre-B no está habilitado en la plataforma.",
          "GATEWAY_DISABLED",
        );
      }

      const client = await this.repository.getClientBillingSummary?.(input.clientId);
      if (!client) {
        return err("Espacio de inquilino no encontrado.", "CLIENT_NOT_FOUND");
      }

      const invoice = await this.repository.getInvoiceById(input.invoiceId);
      if (!invoice) {
        return err("La orden/factura seleccionada no existe.", "INVOICE_NOT_FOUND");
      }

      if (invoice.clientId !== input.clientId) {
        return err("La factura no pertenece a este espacio.", "FORBIDDEN_INVOICE_ACCESS");
      }

      if (invoice.status === "paid") {
        return err("Esta factura ya se encuentra pagada.", "INVOICE_ALREADY_PAID");
      }

      if (client.country.toUpperCase() !== "CO" || invoice.currency.toUpperCase() !== "COP") {
        return err(
          "Bre-B es exclusivo para comercios en Colombia (CO) con facturación en COP.",
          "BRE_B_COLOMBIA_ONLY",
        );
      }

      const pendingForInvoice = await this.repository.getPendingManualReportByInvoiceId?.(input.invoiceId);
      const pendingForClient = await this.repository.getPendingManualReportByClientId?.(input.clientId);
      if (pendingForInvoice || pendingForClient) {
        return err(
          "Ya existe un comprobante Bre-B en revisión para este espacio o factura.",
          "PENDING_BRE_B_REVIEW_EXISTS",
        );
      }

      const targetPlan = await this.repository.getPlanById?.(input.targetPlanId);
      if (!targetPlan) {
        return err("El plan destino seleccionado no existe.", "PLAN_NOT_FOUND");
      }

      const qrResult = this.breBQrService.buildDynamicBreBPaymentPayload({
        config: {
          isEnabled: breBConfig.isEnabled,
          supportedCountries: breBConfig.supportedCountries ?? ["CO"],
          breBKeyType: breBConfig.breBKeyType ?? null,
          breBKeyValue: breBConfig.breBKeyValue ?? null,
          breBRecipientName: breBConfig.breBRecipientName ?? null,
        },
        country: client.country,
        currency: "COP",
        amountCents: invoice.totalCents > 0 ? invoice.totalCents : input.reportedAmountCents,
        invoiceNumber: invoice.invoiceNumber,
        referenceCode: invoice.invoiceNumber,
      });

      if (!qrResult.ok) {
        return qrResult;
      }

      // 1. Almacenamiento privado en SeaweedFS antes de persistir referencia contable
      const mediaKey = `billing-vouchers/${input.clientId}/${input.invoiceId}-${randomUUID()}.${extension}`;
      const uploadRes = await this.storageService.putObject(
        mediaKey,
        input.fileBuffer,
        magic.detectedMime,
      );

      if (!uploadRes.ok) {
        appLogger.error("[BillingService.submitManualBreBReport] Error subiendo comprobante S3", {
          clientId: input.clientId,
          invoiceId: input.invoiceId,
          error: uploadRes.error,
        });
        return err(
          "No se pudo guardar el comprobante en el repositorio seguro. Intenta nuevamente.",
          "STORAGE_UPLOAD_ERROR",
        );
      }

      // 2. Garantía de continuidad:
      // - Nuevo inquilino (sin suscripción) -> arranca en 'trialing' para operar de inmediato.
      // - Inquilino existente -> conserva planId, status y cuotas intactos y marca pendingUpgrade*.
      const now = new Date();
      let subscription = await this.repository.getSubscriptionByClientId(input.clientId);

      if (!subscription) {
        if (!this.repository.upsertTrialSubscription) {
          return err("Repositorio sin soporte de suscripción inicial.", "UNSUPPORTED_OPERATION");
        }
        const trialDays = targetPlan.trialDays > 0 ? targetPlan.trialDays : 14;
        const trialEndsAt = new Date(now.getTime() + trialDays * 86_400_000);
        subscription = await this.repository.upsertTrialSubscription({
          clientId: input.clientId,
          planId: input.targetPlanId,
          cycle: input.targetCycle,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          actor: input.submittedByUserId,
        });
      } else if (this.repository.setSubscriptionPendingUpgrade) {
        subscription = await this.repository.setSubscriptionPendingUpgrade(
          subscription.id,
          input.targetPlanId,
          input.targetCycle,
          input.submittedByUserId,
        );
      }

      if (!this.repository.createManualPaymentReport) {
        return err("Repositorio sin soporte de reportes Bre-B.", "UNSUPPORTED_OPERATION");
      }

      const report = await this.repository.createManualPaymentReport({
        clientId: input.clientId,
        subscriptionId: subscription.id,
        invoiceId: input.invoiceId,
        targetPlanId: input.targetPlanId,
        targetCycle: input.targetCycle,
        operationKind: input.operationKind,
        channel: "bre_b",
        expectedAmountCents: invoice.totalCents,
        reportedAmountCents: input.reportedAmountCents,
        currency: "COP",
        paymentReference: input.paymentReference?.trim() || null,
        voucherMediaKey: mediaKey,
        voucherMimeType: magic.detectedMime,
        dynamicQrPayload: qrResult.data.payload,
        breBKeySnapshot: `${qrResult.data.keyType}:${qrResult.data.keyValue}`,
        status: "pending_review",
        submittedByUserId: input.submittedByUserId,
        createdBy: input.submittedByUserId,
        updatedBy: input.submittedByUserId,
      });

      appLogger.info("[BillingService.submitManualBreBReport] Reporte Bre-B registrado para revisión", {
        reportId: report.id,
        clientId: input.clientId,
        invoiceId: input.invoiceId,
        subscriptionStatus: subscription.status,
      });

      if (this.notificationDispatcher?.dispatchBreBPendingAdminNotice) {
        const planTitle =
          typeof targetPlan.name === "object" && targetPlan.name !== null
            ? targetPlan.name.es || targetPlan.name.en || targetPlan.code
            : targetPlan.code;
        const amountFormattedCop = `$${Math.round(input.reportedAmountCents / 100).toLocaleString("es-CO")} COP`;
        void this.notificationDispatcher
          .dispatchBreBPendingAdminNotice({
            clientId: input.clientId,
            reportId: report.id,
            planName: planTitle,
            amountFormattedCop,
            paymentReference: input.paymentReference ?? null,
          })
          .catch((notifyErr) => {
            appLogger.warn("[BillingService.submitManualBreBReport] Aviso admin Bre-B fallido", {
              reportId: report.id,
              error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
            });
          });
      }

      return ok({ report, subscription });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.submitManualBreBReport] Error: ${msg}`, error);
      return err(msg, "BRE_B_REPORT_ERROR");
    }
  }

  /**
   * Lista reportes manuales Bre-B enriquecidos para la bandeja administrativa (`/admin/billing`).
   */
  async listManualBreBReports(filter?: {
    status?: "pending_review" | "approved" | "rejected";
    clientId?: string;
  }): Promise<Result<ManualPaymentReportDetail[]>> {
    try {
      if (!this.repository.listManualPaymentReports) {
        return ok([]);
      }
      const rows = await this.repository.listManualPaymentReports(filter);
      return ok(rows);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.listManualBreBReports] Error: ${msg}`, error);
      return err(msg, "MANUAL_REPORTS_LIST_ERROR");
    }
  }

  /**
   * Obtiene un reporte manual Bre-B por identificador (incluye `voucherMediaKey` y metadatos).
   */
  async getManualBreBReportById(reportId: string): Promise<Result<ManualPaymentReportDetail>> {
    try {
      if (!this.repository.getManualPaymentReportById) {
        return err("Repositorio sin soporte de reportes Bre-B.", "UNSUPPORTED_OPERATION");
      }
      const row = await this.repository.getManualPaymentReportById(reportId);
      if (!row) {
        return err("Reporte de pago Bre-B no encontrado.", "NOT_FOUND");
      }
      return ok(row);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.getManualBreBReportById] Error: ${msg}`, error);
      return err(msg, "MANUAL_REPORT_GET_ERROR");
    }
  }

  /**
   * Aprueba o rechaza atómicamente un reporte manual Bre-B (SPEC-04 §3.4).
   */
  async reviewManualBreBReport(
    input: ReviewManualBreBReportInput,
  ): Promise<Result<ReviewManualBreBReportOutput>> {
    try {
      const trimmedReason = (input.rejectionReason || "").trim();
      if (input.action === "reject" && trimmedReason.length < 10) {
        return err(
          "Debes indicar un motivo de rechazo descriptivo de al menos 10 caracteres.",
          "INVALID_REJECTION_REASON",
        );
      }

      const detail = await this.repository.getManualPaymentReportById?.(input.reportId);
      const now = new Date();
      const year = now.getFullYear();
      const rand = Math.floor(100000 + Math.random() * 900000);
      const receiptNumber = `REC-${year}-${rand}`;

      if (input.action === "approve") {
        if (!this.repository.approveManualPaymentReportTransaction) {
          return err("Repositorio sin soporte transaccional de aprobación.", "UNSUPPORTED_OPERATION");
        }

        const txResult = await this.repository.approveManualPaymentReportTransaction({
          reportId: input.reportId,
          reviewerUserId: input.reviewerUserId,
          now,
          receiptNumber,
        });

        if ("error" in txResult) {
          return err(txResult.error, txResult.code);
        }

        // Consolidar créditos FEFO planificados en la factura y calificar referido tras aprobación Bre-B (SPEC-16 D-02/D-03)
        if (this.referralsService) {
          const plannedCreditCents = Number(txResult.invoice.creditCents ?? 0);
          if (plannedCreditCents > 0) {
            try {
              await this.referralsService.redeemCreditsFefoForInvoice({
                clientId: txResult.report.clientId,
                invoiceId: txResult.invoice.id,
                maxAmountCents: plannedCreditCents,
                currency: "COP",
                executedBy: input.reviewerUserId,
              });
            } catch (redeemErr: unknown) {
              appLogger.warn("[BillingService.reviewManualBreBReport] Fallo al consolidar redención FEFO", {
                reportId: txResult.report.id,
                invoiceId: txResult.invoice.id,
                error: redeemErr instanceof Error ? redeemErr.message : String(redeemErr),
              });
            }
          }

          try {
            await this.referralsService.qualifyReferral({
              referredClientId: txResult.report.clientId,
              firstInvoiceAmountCents: Number(
                txResult.invoice.subtotalCents || txResult.report.reportedAmountCents,
              ),
              currency: "COP",
              executedBy: input.reviewerUserId,
            });
          } catch (qualifyErr: unknown) {
            appLogger.warn("[BillingService.reviewManualBreBReport] Fallo no bloqueante al calificar referido", {
              reportId: txResult.report.id,
              clientId: txResult.report.clientId,
              error: qualifyErr instanceof Error ? qualifyErr.message : String(qualifyErr),
            });
          }
        }

        if (this.notificationDispatcher?.dispatchBreBReviewResult && detail) {
          const amountCop = new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            maximumFractionDigits: 0,
          }).format(Number(txResult.report.reportedAmountCents) / 100);
          try {
            await this.notificationDispatcher.dispatchBreBReviewResult({
              clientId: detail.clientId,
              tenantName: detail.clientName,
              recipientEmail: detail.clientEmail,
              locale: detail.clientLocale,
              action: "approve",
              planName: detail.planName.es || detail.planName.en || detail.planCode,
              amountFormattedCop: amountCop,
              receiptNumber,
              reportId: txResult.report.id,
            });
          } catch (notifyErr) {
            appLogger.warn("[BillingService.reviewManualBreBReport] Notificación de aprobación fallida", {
              reportId: input.reportId,
              error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
            });
          }
        }

        appLogger.info("[BillingService.reviewManualBreBReport] Reporte Bre-B aprobado", {
          reportId: txResult.report.id,
          clientId: txResult.report.clientId,
          paymentId: txResult.payment.id,
        });

        return ok({
          report: txResult.report,
          subscription: txResult.subscription,
          payment: txResult.payment,
          receipt: txResult.receipt,
          invoice: txResult.invoice,
        });
      }

      if (!this.repository.rejectManualPaymentReportTransaction) {
        return err("Repositorio sin soporte transaccional de rechazo.", "UNSUPPORTED_OPERATION");
      }

      const rejectTx = await this.repository.rejectManualPaymentReportTransaction({
        reportId: input.reportId,
        reviewerUserId: input.reviewerUserId,
        rejectionReason: trimmedReason,
        now,
      });

      if ("error" in rejectTx) {
        return err(rejectTx.error, rejectTx.code);
      }

      if (this.notificationDispatcher?.dispatchBreBReviewResult && detail) {
        const amountCop = new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: "COP",
          maximumFractionDigits: 0,
        }).format(Number(rejectTx.report.reportedAmountCents) / 100);
        try {
          await this.notificationDispatcher.dispatchBreBReviewResult({
            clientId: detail.clientId,
            tenantName: detail.clientName,
            recipientEmail: detail.clientEmail,
            locale: detail.clientLocale,
            action: "reject",
            planName: detail.planName.es || detail.planName.en || detail.planCode,
            amountFormattedCop: amountCop,
            rejectionReason: trimmedReason,
            reportId: rejectTx.report.id,
          });
        } catch (notifyErr) {
          appLogger.warn("[BillingService.reviewManualBreBReport] Notificación de rechazo fallida", {
            reportId: input.reportId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      appLogger.info("[BillingService.reviewManualBreBReport] Reporte Bre-B rechazado", {
        reportId: rejectTx.report.id,
        clientId: rejectTx.report.clientId,
      });

      return ok({
        report: rejectTx.report,
        subscription: rejectTx.subscription,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.reviewManualBreBReport] Error: ${msg}`, error);
      return err(msg, "MANUAL_REPORT_REVIEW_ERROR");
    }
  }
}

let defaultBillingServiceInstance: BillingService | null = null;

function createDefaultNotificationDispatcher(): IBillingNotificationDispatcher {
  const dispatcher = getNotificationDispatcherService();
  const billingUrl = buildAdminPortalUrl("/workspace/billing");

  return {
    async dispatchPaymentSucceeded(params) {
      const idempotencyKey = `billing:receipt:${params.receiptNumber}`;
      const variables = {
        tenant_name: params.tenantName,
        plan_name: params.planName,
        amount: params.amountFormatted,
        currency: params.currency,
        period_end: "vigente",
      };

      if (params.clientId) {
        const res = await dispatcher.dispatchTenantNotification({
          clientId: params.clientId,
          eventKey: "billing.payment_succeeded",
          recipientOverride: params.recipientEmail,
          variables,
          idempotencyKey,
          inAppPayload: {
            title: `Pago confirmado · ${params.planName}`,
            body: `Confirmamos tu pago de ${params.amountFormatted} ${params.currency} (Recibo ${params.receiptNumber}).`,
            severity: "success",
            actionUrl: "/workspace/billing",
          },
        });
        return {
          dispatched: res.ok ? res.data.dispatched : false,
          deliveryId: res.ok ? res.data.emailDeliveryId : undefined,
        };
      }

      const emailRes = await sendSystemNotificationEmail({
        eventKey: "billing.payment_succeeded",
        recipient: params.recipientEmail,
        locale: "es",
        variables,
        idempotencyKey,
      });
      return {
        dispatched: emailRes.status === "sent" || emailRes.status === "queued",
        deliveryId: emailRes.deliveryId,
      };
    },

    async dispatchBreBReviewResult(params) {
      const locale = params.locale === "en" ? "en" : "es";
      const isApprove = params.action === "approve";
      const eventKey = isApprove ? "billing.bre_b_approved" : "billing.bre_b_rejected";
      const inAppPayload = isApprove
        ? {
            title:
              locale === "en"
                ? `Bre-B payment approved · ${params.planName}`
                : `Pago Bre-B aprobado · ${params.planName}`,
            body:
              locale === "en"
                ? `Your Bre-B payment of ${params.amountFormattedCop} was verified (Receipt ${params.receiptNumber ?? "-"}).`
                : `Verificamos tu pago Bre-B por ${params.amountFormattedCop} (Recibo ${params.receiptNumber ?? "-"}).`,
            severity: "success" as const,
            actionUrl: "/workspace/billing",
          }
        : {
            title:
              locale === "en"
                ? `Bre-B voucher rejected · ${params.planName}`
                : `Comprobante Bre-B rechazado · ${params.planName}`,
            body:
              locale === "en"
                ? `Your Bre-B voucher of ${params.amountFormattedCop} could not be approved. Reason: ${params.rejectionReason ?? "-"}`
                : `Tu comprobante Bre-B por ${params.amountFormattedCop} no fue aprobado. Motivo: ${params.rejectionReason ?? "-"}`,
            severity: "critical" as const,
            actionUrl: "/workspace/billing",
          };

      const res = await dispatcher.dispatchTenantNotification({
        clientId: params.clientId,
        eventKey,
        recipientOverride: params.recipientEmail,
        locale,
        variables: isApprove
          ? {
              tenant_name: params.tenantName,
              plan_name: params.planName,
              amount: params.amountFormattedCop,
              receipt_number: params.receiptNumber ?? "-",
              billing_url: billingUrl,
            }
          : {
              tenant_name: params.tenantName,
              plan_name: params.planName,
              amount: params.amountFormattedCop,
              rejection_reason: params.rejectionReason ?? "",
              billing_url: billingUrl,
            },
        idempotencyKey: `billing:breb:${params.action}:${params.reportId}`,
        inAppPayload,
      });
      return {
        dispatched: res.ok ? res.data.dispatched : false,
        deliveryId: res.ok ? res.data.emailDeliveryId : undefined,
      };
    },

    async dispatchBreBPendingAdminNotice(params) {
      const repo = new DrizzleBillingRepository(getDb());
      const profile = await repo.getBillingProfile(params.clientId).catch(() => null);
      const tenantName = profile?.companyName || params.clientId;
      const res = await dispatcher.dispatchPlatformAdminNotification({
        eventKey: "billing.bre_b_report_pending_admin",
        locale: "es",
        variables: {
          tenant_name: tenantName,
          plan_name: params.planName,
          amount: params.amountFormattedCop,
          payment_reference: params.paymentReference || "Sin referencia",
          review_url: buildAdminBreBReviewUrl(),
        },
        idempotencyKey: `billing:breb:pending_admin:${params.reportId}`,
      });
      return {
        dispatched: res.ok ? res.data.sentCount > 0 : false,
        sentCount: res.ok ? res.data.sentCount : 0,
      };
    },
  };
}

export function getBillingService(): BillingService {
  if (!defaultBillingServiceInstance) {
    const repo = new DrizzleBillingRepository(getDb());
    defaultBillingServiceInstance = new BillingService(
      repo,
      createDefaultNotificationDispatcher(),
      defaultTotpCryptoService,
      new S3StorageService(),
      defaultBreBQrService,
      getReferralsService(),
    );
  }
  return defaultBillingServiceInstance;
}

