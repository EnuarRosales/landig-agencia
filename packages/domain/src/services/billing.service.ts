import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getDb } from "../db/client";
import { DrizzleBillingRepository } from "../repositories/drizzle-billing.repository";
import type {
  IBillingRepository,
  SubscriptionDetail,
  BillingOverviewMetrics,
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
} from "../db/schemas/admin/billing";
import type { PaymentGatewayConfigRow } from "../db/schemas/admin/payment-gateways-config";

export interface PaymentGatewayPublicView {
  id: "wompi" | "stripe";
  displayName: string;
  isEnabled: boolean;
  environment: "sandbox" | "production";
  publicKey: string | null;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  updatedAt: Date;
}

export interface UpdatePaymentGatewayInput {
  id: "wompi" | "stripe";
  displayName?: string;
  isEnabled: boolean;
  environment: "sandbox" | "production";
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  webhookUrl?: string;
  actor: string;
}

export interface RegisterPaymentInput {
  clientId: string;
  invoiceId: string;
  gateway: "wompi" | "stripe";
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
    tenantName: string;
    recipientEmail: string;
    planName: string;
    amountFormatted: string;
    currency: string;
    receiptNumber: string;
    receiptPdfUrl?: string;
  }): Promise<{ dispatched: boolean; deliveryId?: string }>;
}

/**
 * Servicio de Dominio para el ciclo de Facturación SaaS y Conciliación de Pagos (BILL-001 §3, RF-01 a RF-04).
 *
 * Principios:
 * 1. Idempotencia absoluta por `gatewayReference` para webhooks de Wompi y Stripe.
 * 2. Prorrateo determinista por días restantes: net = charge - credit.
 * 3. En v1 `tax_cents = 0` (sin retenciones de renta ni IVA).
 * 4. Generación de comprobante interno (`payment_receipts`) y despacho de email vía NTF-001 (T-07).
 */
export class BillingService {
  constructor(
    private readonly repository: IBillingRepository,
    private readonly notificationDispatcher?: IBillingNotificationDispatcher,
    private readonly totpCrypto: TotpCryptoService = defaultTotpCryptoService,
  ) {}

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
          updatedAt: new Date(),
        },
      ];

      for (const row of rows) {
        const idx = views.findIndex((v) => v.id === row.id);
        if (idx !== -1) {
          views[idx] = {
            id: row.id as "wompi" | "stripe",
            displayName: row.displayName || views[idx].displayName,
            isEnabled: row.isEnabled,
            environment: (row.environment as "sandbox" | "production") || "sandbox",
            publicKey: row.publicKey ?? null,
            hasSecretKey: Boolean(row.secretKeyEncrypted && row.secretKeyId),
            hasWebhookSecret: Boolean(row.webhookSecretEncrypted && row.secretKeyId),
            webhookUrl: row.webhookUrl || views[idx].webhookUrl,
            updatedAt: row.updatedAt,
          };
        }
      }

      return ok(views);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.listPaymentGatewaysPublicConfig] Error: ${msg}`, error);
      return err(msg, "GATEWAYS_CONFIG_ERROR");
    }
  }

  /**
   * Actualiza o crea la configuración de una pasarela con cifrado AES-256-GCM.
   */
  async upsertPaymentGatewayConfig(
    input: UpdatePaymentGatewayInput,
  ): Promise<Result<PaymentGatewayPublicView>> {
    try {
      const existing = await this.repository.getPaymentGatewayConfig(input.id);
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

      const now = new Date();
      const saved = await this.repository.upsertPaymentGatewayConfig({
        id: input.id,
        displayName: input.displayName || (input.id === "wompi" ? "Wompi (Colombia / COP)" : "Stripe (Internacional / USD)"),
        isEnabled: input.isEnabled,
        environment: input.environment,
        publicKey: input.publicKey !== undefined ? input.publicKey : existing?.publicKey ?? null,
        secretKeyEncrypted,
        webhookSecretEncrypted,
        secretKeyId,
        webhookUrl: input.webhookUrl || (input.id === "wompi" ? "/api/webhooks/wompi" : "/api/webhooks/stripe"),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        createdBy: existing?.createdBy ?? input.actor,
        updatedBy: input.actor,
      });

      return ok({
        id: saved.id as "wompi" | "stripe",
        displayName: saved.displayName,
        isEnabled: saved.isEnabled,
        environment: saved.environment as "sandbox" | "production",
        publicKey: saved.publicKey ?? null,
        hasSecretKey: Boolean(saved.secretKeyEncrypted && saved.secretKeyId),
        hasWebhookSecret: Boolean(saved.webhookSecretEncrypted && saved.secretKeyId),
        webhookUrl: saved.webhookUrl || (input.id === "wompi" ? "/api/webhooks/wompi" : "/api/webhooks/stripe"),
        updatedAt: saved.updatedAt,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingService.upsertPaymentGatewayConfig] Error: ${msg}`, error);
      return err(msg, "GATEWAYS_UPDATE_ERROR");
    }
  }
}

let defaultBillingServiceInstance: BillingService | null = null;

export function getBillingService(): BillingService {
  if (!defaultBillingServiceInstance) {
    const repo = new DrizzleBillingRepository(getDb());
    defaultBillingServiceInstance = new BillingService(repo);
  }
  return defaultBillingServiceInstance;
}

