import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createStripeWebhookHandler,
  verifyStripeSignature,
  type StripeEventPayload,
} from "./route";
import { ok } from "@mocter/domain";
import type { BillingService } from "@mocter/domain";

describe("BILL-001 T-05 · Stripe Webhook Route Handler", () => {
  const SECRET = "whsec_test_secret_abc123";
  let mockBillingService: {
    registerPayment: ReturnType<typeof vi.fn>;
  };
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    mockBillingService = {
      registerPayment: vi.fn(),
    };
    handler = createStripeWebhookHandler(
      mockBillingService as unknown as BillingService,
      SECRET,
    );
  });

  function generateValidRequest(type: string = "payment_intent.succeeded"): {
    req: NextRequest;
    payload: StripeEventPayload;
  } {
    const payload: StripeEventPayload = {
      id: "evt_123456",
      type,
      data: {
        object: {
          id: "pi_stripe_999",
          amount: 5900,
          currency: "usd",
          status: "succeeded",
          metadata: {
            client_id: "11111111-1111-7111-8111-111111111111",
            invoice_id: "inv-stripe-888",
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const stripeSignature = `t=${timestamp},v1=${signature}`;

    const req = new NextRequest("http://localhost:3003/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripeSignature,
      },
      body: rawBody,
    });

    return { req, payload };
  }

  it("rechaza con 401 si falta o es inválida la cabecera stripe-signature", async () => {
    const { payload } = generateValidRequest();
    const req = new NextRequest("http://localhost:3003/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=12345,v1=firma_invalida",
      },
      body: JSON.stringify(payload),
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Stripe signature verification failed");
    expect(mockBillingService.registerPayment).not.toHaveBeenCalled();
  });

  it("ignora con 200 eventos distintos de payment_intent.succeeded", async () => {
    const { req } = generateValidRequest("payment_intent.created");

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ignored: boolean };
    expect(json.ignored).toBe(true);
    expect(mockBillingService.registerPayment).not.toHaveBeenCalled();
  });

  it("procesa payment_intent.succeeded con éxito y concilia en BillingService", async () => {
    mockBillingService.registerPayment.mockResolvedValue(
      ok({
        payment: { id: "p-stripe-1" },
        receipt: { receiptNumber: "REC-2026-ST-01" },
        invoice: { id: "inv-stripe-888", status: "paid" },
        alreadyProcessed: false,
      }),
    );

    const { req } = generateValidRequest("payment_intent.succeeded");
    const res = await handler(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; paymentId: string; receiptNumber: string };
    expect(json.ok).toBe(true);
    expect(json.paymentId).toBe("p-stripe-1");
    expect(json.receiptNumber).toBe("REC-2026-ST-01");

    expect(mockBillingService.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: "stripe",
        gatewayReference: "pi_stripe_999",
        amountCents: 5900,
        currency: "USD",
        invoiceId: "inv-stripe-888",
        clientId: "11111111-1111-7111-8111-111111111111",
      }),
    );
  });
});

