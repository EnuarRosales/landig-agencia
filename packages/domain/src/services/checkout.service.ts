import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { IBillingRepository } from "../repositories/billing.repository.interface";
import type { Invoice, Subscription } from "../db/schemas/admin/billing";

export interface CreateCheckoutSessionInput {
  clientId: string;
  planId: string;
  planCode: string;
  amountCents: number;
  currency: "COP" | "USD";
  cycle?: "monthly" | "annual";
  customerEmail: string;
  redirectUrl?: string;
  executedBy: string;
}

export type CheckoutSessionResponse =
  | {
      gateway: "wompi";
      invoiceId: string;
      reference: string;
      amountCents: number;
      currency: "COP";
      publicKey: string;
      checkoutUrl: string;
    }
  | {
      gateway: "stripe";
      invoiceId: string;
      reference: string;
      amountCents: number;
      currency: "USD";
      clientSecret: string;
      publishableKey: string;
    };

/**
 * Servicio para inicializar sesiones de pago de suscripción SaaS (BILL-001 T-06).
 *
 * Flujo:
 * 1. Moneda COP → Pasarela Wompi con Checkout URL o Widget parameters.
 * 2. Moneda USD → Pasarela Stripe con Payment Intent clientSecret.
 * 3. Crea la factura en estado 'issued' y la asocia a la referencia generada.
 * 4. Cero almacenamiento o manipulación de datos de tarjeta en servidores de Mocter.
 */
export class CheckoutService {
  constructor(
    private readonly repository: IBillingRepository,
    private readonly wompiPublicKey: string = "pub_test_wompi_public_key_123",
    private readonly stripePublishableKey: string = "pk_test_stripe_publishable_key_123",
  ) {}

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<Result<CheckoutSessionResponse>> {
    try {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-${year}-${rand}`;
      const reference = `cli_${input.clientId}_${invoiceNumber}`;

      // 1. Crear factura pendiente
      const invoice = await this.repository.createInvoice({
        clientId: input.clientId,
        invoiceNumber,
        status: "issued",
        subtotalCents: input.amountCents,
        taxCents: 0,
        creditCents: 0,
        prorationCents: 0,
        totalCents: input.amountCents,
        currency: input.currency,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días de gracia
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // 2. Resolver pasarela según moneda
      if (input.currency === "COP") {
        const checkoutUrl = `https://checkout.wompi.co/p/?public-key=${this.wompiPublicKey}&currency=COP&amount-in-cents=${input.amountCents}&reference=${reference}&customer-data:email=${encodeURIComponent(input.customerEmail)}`;

        appLogger.info("[CheckoutService] Sesión de Checkout Wompi inicializada", {
          clientId: input.clientId,
          invoiceId: invoice.id,
          reference,
          amountCents: input.amountCents,
        });

        return ok({
          gateway: "wompi",
          invoiceId: invoice.id,
          reference,
          amountCents: input.amountCents,
          currency: "COP",
          publicKey: this.wompiPublicKey,
          checkoutUrl,
        });
      } else {
        // Simular o generar client_secret de Stripe Payment Intent
        const clientSecret = `pi_mock_${rand}_secret_${rand}`;

        appLogger.info("[CheckoutService] Sesión de Stripe Payment Intent inicializada", {
          clientId: input.clientId,
          invoiceId: invoice.id,
          reference,
          amountCents: input.amountCents,
        });

        return ok({
          gateway: "stripe",
          invoiceId: invoice.id,
          reference,
          amountCents: input.amountCents,
          currency: "USD",
          clientSecret,
          publishableKey: this.stripePublishableKey,
        });
      }
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CheckoutService] Error al crear sesión de checkout: ${msg}`, error);
      return err(msg, "CHECKOUT_SESSION_ERROR");
    }
  }
}

