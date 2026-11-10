import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appLogger } from "@mocter/domain";
import type { BillingService } from "@mocter/domain";

export interface StripeEventPayload {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: Record<string, string>;
      customer?: string;
    };
  };
}

/**
 * Valida la cabecera `Stripe-Signature` (v1) mediante HMAC SHA256.
 *
 * Formato de la cabecera: `t=<timestamp>,v1=<signature>`
 * Signed payload: `${timestamp}.${rawBody}`
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds: number = 300,
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = signatureHeader.split(",");
  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") signature = v;
  }

  if (!timestamp || !signature) return false;

  // Chequeo de tolerancia temporal para mitigar ataques de repetición (replay)
  const now = Math.floor(Date.now() / 1000);
  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum) || Math.abs(now - tsNum) > toleranceSeconds) {
    return false;
  }

  const payloadToSign = `${timestamp}.${rawBody}`;
  const computed = createHmac("sha256", webhookSecret).update(payloadToSign).digest("hex");

  return computed.toLowerCase() === signature.toLowerCase();
}

/**
 * Factory para el Route Handler del Webhook de Stripe (BILL-001 T-05, §4.2).
 */
export function createStripeWebhookHandler(
  billingService: BillingService,
  webhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_stripe_123",
) {
  return async function POST(req: NextRequest) {
    try {
      const rawBody = await req.text();
      const signatureHeader = req.headers.get("stripe-signature");

      // 1. Validar firma criptográfica
      const isValid = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        appLogger.warn("[StripeWebhook] Firma criptográfica inválida en webhook Stripe");
        return NextResponse.json(
          { error: "Stripe signature verification failed" },
          { status: 401 },
        );
      }

      const event = JSON.parse(rawBody) as StripeEventPayload;

      // 2. Procesar únicamente eventos de cobro exitoso
      if (event.type !== "payment_intent.succeeded") {
        appLogger.info("[StripeWebhook] Evento Stripe descartado por tipo", {
          type: event.type,
          id: event.id,
        });
        return NextResponse.json({ ok: true, ignored: true, type: event.type });
      }

      const intent = event.data.object;
      const invoiceId = intent.metadata?.invoice_id ?? intent.id;
      const clientId = intent.metadata?.client_id ?? "00000000-0000-7000-8000-000000000001";

      const result = await billingService.registerPayment({
        clientId,
        invoiceId,
        gateway: "stripe",
        gatewayReference: intent.id,
        amountCents: intent.amount,
        currency: intent.currency.toUpperCase() as "USD" | "COP",
        executedBy: "stripe.webhook",
      });

      if (!result.ok) {
        appLogger.error("[StripeWebhook] Fallo al conciliar pago Stripe", {
          error: result.error,
          code: result.code,
        });
        return NextResponse.json(
          { error: result.error, code: result.code },
          { status: 422 },
        );
      }

      return NextResponse.json({
        ok: true,
        alreadyProcessed: result.data.alreadyProcessed,
        paymentId: result.data.payment.id,
        receiptNumber: result.data.receipt.receiptNumber,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[StripeWebhook] Error inesperado en webhook: ${msg}`, error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

export const POST = createStripeWebhookHandler({} as any, process.env.STRIPE_WEBHOOK_SECRET || "");

