import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getDb } from "../db/client";
import { DrizzleBillingRepository } from "../repositories/drizzle-billing.repository";
import type {
  IBillingRepository,
  SupportedPaymentGatewayId,
} from "../repositories/billing.repository.interface";
import { BreBQrService, defaultBreBQrService } from "./breb-qr.service";
import { getReferralsService, type ReferralsService } from "./referrals.service";

export type CheckoutReferralsFacade = Pick<
  ReferralsService,
  "getAvailableCreditBalance" | "redeemCreditsFefoForInvoice" | "qualifyReferral"
>;

export interface PaymentChannelOption {
  id: SupportedPaymentGatewayId;
  displayName: string;
  currency: "COP" | "USD";
  manualVerification: boolean;
}

export interface CreateCheckoutSessionInput {
  clientId: string;
  planId: string;
  planCode: string;
  amountCents: number;
  currency: "COP" | "USD";
  cycle?: "monthly" | "annual";
  gateway?: SupportedPaymentGatewayId;
  operationKind?: "new_subscription" | "renewal" | "upgrade";
  country?: string;
  customerEmail: string;
  redirectUrl?: string;
  /** Si es `true` (default), aplica créditos vigentes de referidos en orden FEFO (`SPEC-16 D-02`). */
  applyReferralCredits?: boolean;
  executedBy: string;
}

export type CheckoutSessionResponse =
  | {
      gateway: "wompi";
      invoiceId: string;
      invoiceNumber: string;
      reference: string;
      subtotalCents?: number;
      creditsAppliedCents?: number;
      amountCents: number;
      currency: "COP";
      publicKey: string;
      checkoutUrl: string;
    }
  | {
      gateway: "stripe";
      invoiceId: string;
      invoiceNumber: string;
      reference: string;
      subtotalCents?: number;
      creditsAppliedCents?: number;
      amountCents: number;
      currency: "USD";
      clientSecret: string;
      publishableKey: string;
    }
  | {
      gateway: "bre_b";
      invoiceId: string;
      invoiceNumber: string;
      reference: string;
      subtotalCents?: number;
      creditsAppliedCents?: number;
      amountCents: number;
      currency: "COP";
      recipientName: string;
      keyType: string;
      keyValue: string;
      qrPayload: string;
      qrSvgDataUrl: string;
      amountFormattedCop: string;
    }
  | {
      gateway: "referral_credit";
      invoiceId: string;
      invoiceNumber: string;
      reference: string;
      subtotalCents: number;
      creditsAppliedCents: number;
      amountCents: 0;
      currency: "COP" | "USD";
      paidWithoutGateway: true;
      receiptNumber: string;
    };

export interface ResolvedCountryPlanPricing {
  currency: "COP" | "USD";
  priceMonthlyCents: number;
  priceAnnualCents: number;
}

/**
 * Resuelve la moneda y los montos fijos de un plan según el territorio del inquilino (`RN-SPEC-04-02`).
 * Colombia (`CO`) factura en `COP`; cualquier otro país factura en `USD` con precio fijo independiente.
 */
export function resolvePlanPricingForCountry(
  plan:
    | {
        priceMonthlyCents?: number | null;
        priceAnnualCents?: number | null;
        priceMonthlyUsdCents?: number | null;
        priceAnnualUsdCents?: number | null;
      }
    | null
    | undefined,
  country: string | null | undefined,
): ResolvedCountryPlanPricing {
  const normalizedCountry = (country || "CO").trim().toUpperCase();
  if (normalizedCountry === "CO") {
    return {
      currency: "COP",
      priceMonthlyCents: Number(plan?.priceMonthlyCents ?? 0),
      priceAnnualCents: Number(plan?.priceAnnualCents ?? 0),
    };
  }
  const usdMonthly = Number(plan?.priceMonthlyUsdCents ?? 0);
  const usdAnnual = Number(plan?.priceAnnualUsdCents ?? 0);
  return {
    currency: "USD",
    priceMonthlyCents: usdMonthly > 0 ? usdMonthly : Number(plan?.priceMonthlyCents ?? 0),
    priceAnnualCents: usdAnnual > 0 ? usdAnnual : Number(plan?.priceAnnualCents ?? 0),
  };
}

/**
 * Servicio para inicializar sesiones de pago de suscripción SaaS y canal Bre-B (BILL-001 T-06, SPEC-04 T-03).
 *
 * Reglas:
 * 1. Solo expone canales con `isEnabled = true` en `payment_gateways_config`.
 * 2. Bre-B es exclusivo de Colombia (`country === "CO"`) y facturación en `COP`, con QR Dinámico EMVCo exacto.
 * 3. Bloquea nuevas órdenes Bre-B si ya existe un reporte `pending_review` para el espacio.
 */
export class CheckoutService {
  constructor(
    private readonly repository: IBillingRepository,
    private readonly wompiPublicKey: string = "pub_test_wompi_public_key_123",
    private readonly stripePublishableKey: string = "pk_test_stripe_publishable_key_123",
    private readonly breBQrService: BreBQrService = defaultBreBQrService,
    private readonly referralsService?: CheckoutReferralsFacade,
  ) {}

  /**
   * Lista los canales de pago habilitados (`isEnabled = true`) compatibles con país y moneda del inquilino.
   */
  async listAvailableChannelsForTenant(
    country: string | null | undefined,
    currency: string,
  ): Promise<Result<PaymentChannelOption[]>> {
    try {
      const normalizedCountry = (country || "").trim().toUpperCase();
      const normalizedCurrency = (currency || "").trim().toUpperCase() === "USD" ? "USD" : "COP";
      const rows = await this.repository.listPaymentGatewaysConfig();
      const options: PaymentChannelOption[] = [];

      for (const row of rows) {
        if (!row.isEnabled) continue;

        const supported = (row.supportedCountries || []).map((c) => c.toUpperCase());
        const countryAllowed =
          supported.length === 0 ||
          supported.includes("*") ||
          (normalizedCountry !== "" && supported.includes(normalizedCountry));

        if (!countryAllowed) continue;

        if (row.id === "bre_b") {
          const isConfigured = Boolean(
            row.breBKeyType?.trim() && row.breBKeyValue?.trim() && row.breBRecipientName?.trim(),
          );
          if (normalizedCountry === "CO" && normalizedCurrency === "COP" && isConfigured) {
            options.push({
              id: "bre_b",
              displayName: row.displayName,
              currency: "COP",
              manualVerification: true,
            });
          }
          continue;
        }

        if (row.id === "wompi" && normalizedCurrency === "COP") {
          options.push({
            id: "wompi",
            displayName: row.displayName,
            currency: "COP",
            manualVerification: false,
          });
          continue;
        }

        if (row.id === "stripe") {
          options.push({
            id: "stripe",
            displayName: row.displayName,
            currency: "USD",
            manualVerification: false,
          });
        }
      }

      return ok(options);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CheckoutService.listAvailableChannelsForTenant] Error: ${msg}`, error);
      return err(msg, "CHECKOUT_CHANNELS_ERROR");
    }
  }

  /**
   * Inicializa una orden/sesión de checkout para Wompi, Stripe o Bre-B Colombia.
   */
  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<Result<CheckoutSessionResponse>> {
    try {
      let resolvedCountry = (input.country || "").trim().toUpperCase();
      if (!resolvedCountry && this.repository.getClientBillingSummary) {
        const client = await this.repository.getClientBillingSummary(input.clientId);
        resolvedCountry = (client?.country || "").trim().toUpperCase();
      }

      const resolvedCurrency: "COP" | "USD" = resolvedCountry
        ? resolvedCountry === "CO"
          ? "COP"
          : "USD"
        : input.currency;

      let resolvedAmountCents = input.amountCents;
      if (this.repository.getPlanById) {
        const plan = await this.repository.getPlanById(input.planId);
        if (plan) {
          const pricingCountry = resolvedCountry || (resolvedCurrency === "USD" ? "US" : "CO");
          const pricing = resolvePlanPricingForCountry(plan, pricingCountry);
          const cycle = input.cycle === "annual" ? "annual" : "monthly";
          const candidateAmount =
            cycle === "annual" && pricing.priceAnnualCents > 0
              ? pricing.priceAnnualCents
              : pricing.priceMonthlyCents;
          if (candidateAmount > 0) {
            resolvedAmountCents = candidateAmount;
          }
        }
      }

      const subtotalCents = resolvedAmountCents;
      let plannedCreditCents = 0;

      if (input.applyReferralCredits !== false && this.referralsService && subtotalCents > 0) {
        const balanceRes = await this.referralsService.getAvailableCreditBalance(
          input.clientId,
          resolvedCurrency,
        );
        if (balanceRes.ok && balanceRes.data.availableCreditCents > 0) {
          plannedCreditCents = Math.min(balanceRes.data.availableCreditCents, subtotalCents);
        }
      }

      const netAmountCents = Math.max(0, subtotalCents - plannedCreditCents);
      const year = new Date().getFullYear();
      const rand = Math.floor(100000 + Math.random() * 900000);
      const invoiceNumber = `INV-${year}-${rand}`;
      const reference = `cli_${input.clientId}_${invoiceNumber}`;

      // Caso A: Créditos de referidos cubren el 100% del monto (totalCents === 0) → liquidación inmediata sin pasarela (SPEC-16 D-02)
      if (netAmountCents === 0 && plannedCreditCents > 0 && this.referralsService) {
        const now = new Date();
        const invoice = await this.repository.createInvoice({
          clientId: input.clientId,
          invoiceNumber,
          status: "paid",
          subtotalCents,
          taxCents: 0,
          creditCents: plannedCreditCents,
          prorationCents: 0,
          totalCents: 0,
          currency: resolvedCurrency,
          dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          paidAt: now,
          createdBy: input.executedBy,
          updatedBy: input.executedBy,
        });

        await this.referralsService.redeemCreditsFefoForInvoice({
          clientId: input.clientId,
          invoiceId: invoice.id,
          maxAmountCents: plannedCreditCents,
          currency: resolvedCurrency,
          executedBy: input.executedBy,
        });

        const receiptNumber = `REC-${year}-${rand}`;
        const payment = await this.repository.createPayment({
          clientId: input.clientId,
          invoiceId: invoice.id,
          gateway: "wompi",
          gatewayReference: `credit_${invoice.id}`,
          amountCents: 0,
          currency: resolvedCurrency,
          status: "approved",
          createdBy: input.executedBy,
          updatedBy: input.executedBy,
        });

        await this.repository.createReceipt({
          paymentId: payment.id,
          receiptNumber,
          pdfUrl: `/receipts/${receiptNumber}.pdf`,
          emailedTo: null,
          emailedAt: null,
          createdBy: input.executedBy,
          updatedBy: input.executedBy,
        });

        if (this.repository.activateOrRenewPaidSubscription) {
          await this.repository.activateOrRenewPaidSubscription({
            clientId: input.clientId,
            planId: input.planId,
            cycle: input.cycle === "annual" ? "annual" : "monthly",
            operationKind: input.operationKind ?? "renewal",
            gateway: "wompi",
            now,
            actor: input.executedBy,
          });
        }

        // Calificación no bloqueante si corresponde al primer pago efectivo
        try {
          await this.referralsService.qualifyReferral({
            referredClientId: input.clientId,
            firstInvoiceAmountCents: subtotalCents,
            currency: resolvedCurrency,
            executedBy: input.executedBy,
          });
        } catch {
          // Ignorar fallo no bloqueante de calificación
        }

        appLogger.info("[CheckoutService] Factura cubierta 100% con créditos de referidos", {
          clientId: input.clientId,
          invoiceId: invoice.id,
          subtotalCents,
          creditsAppliedCents: plannedCreditCents,
          currency: resolvedCurrency,
        });

        return ok({
          gateway: "referral_credit",
          invoiceId: invoice.id,
          invoiceNumber,
          reference,
          subtotalCents,
          creditsAppliedCents: plannedCreditCents,
          amountCents: 0,
          currency: resolvedCurrency,
          paidWithoutGateway: true,
          receiptNumber,
        });
      }

      const selectedGateway: SupportedPaymentGatewayId =
        input.gateway ?? (resolvedCurrency === "COP" ? "wompi" : "stripe");

      const gatewayConfig = await this.repository.getPaymentGatewayConfig(selectedGateway);

      if (gatewayConfig && !gatewayConfig.isEnabled) {
        return err(
          `El canal de pago "${selectedGateway}" se encuentra deshabilitado en la plataforma.`,
          "GATEWAY_DISABLED",
        );
      }

      if (selectedGateway === "bre_b") {
        if (!gatewayConfig) {
          return err(
            "El canal de pago inmediato Bre-B no está configurado ni habilitado.",
            "GATEWAY_DISABLED",
          );
        }

        const pendingExisting = await this.repository.getPendingManualReportByClientId?.(
          input.clientId,
        );
        if (pendingExisting) {
          return err(
            "Ya existe un pago por Bre-B pendiente de verificación para este espacio. Espera su aprobación antes de enviar otro.",
            "PENDING_BRE_B_REVIEW_EXISTS",
          );
        }

        // Prevalidar país/moneda/llave antes de emitir factura en BD (usando el monto neto tras crédito)
        const previewQr = this.breBQrService.buildDynamicBreBPaymentPayload({
          config: {
            isEnabled: gatewayConfig.isEnabled,
            supportedCountries: gatewayConfig.supportedCountries ?? ["CO"],
            breBKeyType: gatewayConfig.breBKeyType ?? null,
            breBKeyValue: gatewayConfig.breBKeyValue ?? null,
            breBRecipientName: gatewayConfig.breBRecipientName ?? null,
          },
          country: resolvedCountry || undefined,
          currency: resolvedCurrency,
          amountCents: netAmountCents,
          invoiceNumber: "INV-PREVIEW",
          referenceCode: "MOC-PREVIEW",
        });

        if (!previewQr.ok) {
          return previewQr;
        }
      }

      // 1. Crear factura pendiente con el crédito planificado (los lotes FEFO se descuentan al confirmarse el pago)
      const invoice = await this.repository.createInvoice({
        clientId: input.clientId,
        invoiceNumber,
        status: "issued",
        subtotalCents,
        taxCents: 0,
        creditCents: plannedCreditCents,
        prorationCents: 0,
        totalCents: netAmountCents,
        currency: resolvedCurrency,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // 2. Construir respuesta según canal seleccionado usando el importe neto
      if (selectedGateway === "bre_b" && gatewayConfig) {
        const qrResult = this.breBQrService.buildDynamicBreBPaymentPayload({
          config: {
            isEnabled: gatewayConfig.isEnabled,
            supportedCountries: gatewayConfig.supportedCountries ?? ["CO"],
            breBKeyType: gatewayConfig.breBKeyType ?? null,
            breBKeyValue: gatewayConfig.breBKeyValue ?? null,
            breBRecipientName: gatewayConfig.breBRecipientName ?? null,
          },
          country: resolvedCountry || undefined,
          currency: resolvedCurrency,
          amountCents: netAmountCents,
          invoiceNumber,
          referenceCode: invoiceNumber,
        });

        if (!qrResult.ok) {
          return qrResult;
        }

        appLogger.info("[CheckoutService] Orden Bre-B Colombia inicializada", {
          clientId: input.clientId,
          invoiceId: invoice.id,
          invoiceNumber,
          subtotalCents,
          creditsAppliedCents: plannedCreditCents,
          amountCents: netAmountCents,
        });

        return ok({
          gateway: "bre_b",
          invoiceId: invoice.id,
          invoiceNumber,
          reference,
          subtotalCents,
          creditsAppliedCents: plannedCreditCents,
          amountCents: netAmountCents,
          currency: "COP",
          recipientName: qrResult.data.recipientName,
          keyType: qrResult.data.keyType,
          keyValue: qrResult.data.keyValue,
          qrPayload: qrResult.data.payload,
          qrSvgDataUrl: qrResult.data.qrSvgDataUrl,
          amountFormattedCop: qrResult.data.amountFormattedCop,
        });
      }

      if (selectedGateway === "wompi") {
        const publicKey = gatewayConfig?.publicKey?.trim() || this.wompiPublicKey;
        const redirectParam = input.redirectUrl
          ? `&redirect-url=${encodeURIComponent(input.redirectUrl)}`
          : "";
        const checkoutUrl = `https://checkout.wompi.co/p/?public-key=${publicKey}&currency=COP&amount-in-cents=${netAmountCents}&reference=${reference}&customer-data:email=${encodeURIComponent(input.customerEmail)}${redirectParam}`;

        appLogger.info("[CheckoutService] Sesión de Checkout Wompi inicializada", {
          clientId: input.clientId,
          invoiceId: invoice.id,
          reference,
          subtotalCents,
          creditsAppliedCents: plannedCreditCents,
          amountCents: netAmountCents,
        });

        return ok({
          gateway: "wompi",
          invoiceId: invoice.id,
          invoiceNumber,
          reference,
          subtotalCents,
          creditsAppliedCents: plannedCreditCents,
          amountCents: netAmountCents,
          currency: "COP",
          publicKey,
          checkoutUrl,
        });
      }

      const publishableKey = gatewayConfig?.publicKey?.trim() || this.stripePublishableKey;
      const clientSecret = `pi_mock_${rand}_secret_${rand}`;

      appLogger.info("[CheckoutService] Sesión de Stripe Payment Intent inicializada", {
        clientId: input.clientId,
        invoiceId: invoice.id,
        reference,
        subtotalCents,
        creditsAppliedCents: plannedCreditCents,
        amountCents: netAmountCents,
      });

      return ok({
        gateway: "stripe",
        invoiceId: invoice.id,
        invoiceNumber,
        reference,
        subtotalCents,
        creditsAppliedCents: plannedCreditCents,
        amountCents: netAmountCents,
        currency: "USD",
        clientSecret,
        publishableKey,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CheckoutService] Error al crear sesión de checkout: ${msg}`, error);
      return err(msg, "CHECKOUT_SESSION_ERROR");
    }
  }
}

let defaultCheckoutServiceInstance: CheckoutService | null = null;

/**
 * Retorna la instancia singleton del servicio de checkout conectada a la base de datos control-plane.
 */
export function getCheckoutService(): CheckoutService {
  if (!defaultCheckoutServiceInstance) {
    const repo = new DrizzleBillingRepository(getDb());
    defaultCheckoutServiceInstance = new CheckoutService(
      repo,
      undefined,
      undefined,
      defaultBreBQrService,
      getReferralsService(),
    );
  }
  return defaultCheckoutServiceInstance;
}

