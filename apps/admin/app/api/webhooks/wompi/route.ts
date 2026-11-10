import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appLogger } from "@mocter/domain";
import type { BillingService } from "@mocter/domain";

export interface WompiWebhookPayload {
  event: string;
  data: {
    transaction: {
      id: string;
      amount_in_cents: number;
      reference: string;
      customer_email: string;
      currency: "COP" | "USD";
      status: "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
      payment_method_type: string;
    };
  };
  environment: "prod" | "test";
  signature?: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
}

/**
 * Valida la firma criptográfica enviada por el webhook de Wompi (SHA256).
 *
 * Fórmula oficial Wompi:
 * Concatena en orden los valores de los campos especificados en `signature.properties`,
 * añade el secreto de eventos (`eventsSecret`) y calcula el hash SHA256.
 */
export function verifyWompiChecksum(
  payload: WompiWebhookPayload,
  eventsSecret: string,
): boolean {
  if (!payload.signature || !payload.signature.properties || !payload.signature.checksum) {
    return false;
  }

  const { properties, checksum } = payload.signature;
  let concatenated = "";

  for (const prop of properties) {
    // Resolver propiedades anidadas tipo "transaction.id"
    const parts = prop.split(".");
    let current: any = payload.data;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        current = undefined;
        break;
      }
    }
    if (current !== undefined && current !== null) {
      concatenated += String(current);
    }
  }

  concatenated += eventsSecret;
  const calculated = createHash("sha256").update(concatenated).digest("hex");

  return calculated.toLowerCase() === checksum.toLowerCase();
}

/**
 * Factory para el Route Handler del Webhook de Wompi (BILL-001 T-04, §4.1).
 */
export function createWompiWebhookHandler(
  billingService: BillingService,
  eventsSecret: string = process.env.WOMPI_EVENTS_SECRET ?? "wompi_events_secret_test",
) {
  return async function POST(req: NextRequest) {
    try {
      const payload = (await req.json()) as WompiWebhookPayload;

      // 1. Validar estructura mínima
      if (!payload.event || !payload.data?.transaction) {
        return NextResponse.json(
          { error: "Payload no compatible con evento Wompi" },
          { status: 400 },
        );
      }

      // 2. Verificar firma de seguridad
      const isValid = verifyWompiChecksum(payload, eventsSecret);
      if (!isValid) {
        appLogger.warn("[WompiWebhook] Firma o checksum inválido en webhook", {
          transactionId: payload.data.transaction.id,
        });
        return NextResponse.json(
          { error: "Checksum verification failed" },
          { status: 401 },
        );
      }

      const tx = payload.data.transaction;

      // 3. Procesar únicamente transacciones aprobadas (transición de pago)
      if (tx.status !== "APPROVED") {
        appLogger.info("[WompiWebhook] Transacción Wompi descartada por estado no aprobado", {
          status: tx.status,
          transactionId: tx.id,
        });
        return NextResponse.json({ ok: true, ignored: true, status: tx.status });
      }

      // 4. La referencia de Wompi guarda la convención `inv_<invoiceId>` o `cli_<clientId>_<invoiceId>`
      const parts = tx.reference.split("_");
      const invoiceId = parts.length >= 2 ? parts[parts.length - 1] : tx.reference;
      const clientId = parts.length >= 3 ? parts[1] : "00000000-0000-7000-8000-000000000001";

      const result = await billingService.registerPayment({
        clientId,
        invoiceId,
        gateway: "wompi",
        gatewayReference: tx.id,
        amountCents: tx.amount_in_cents,
        currency: tx.currency,
        executedBy: "wompi.webhook",
      });

      if (!result.ok) {
        appLogger.error("[WompiWebhook] Fallo al conciliar pago", {
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
      appLogger.error(`[WompiWebhook] Error inesperado en webhook: ${msg}`, error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

export const POST = createWompiWebhookHandler({} as any, process.env.WOMPI_EVENTS_SECRET || "");

