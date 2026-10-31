import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createWompiWebhookHandler,
  verifyWompiChecksum,
  type WompiWebhookPayload,
} from "./route";
import { ok } from "@mocter/domain";
import type { BillingService } from "@mocter/domain";

describe("BILL-001 T-04 · Wompi Webhook Route Handler", () => {
  const SECRET = "test_events_secret_12345";
  let mockBillingService: {
    registerPayment: ReturnType<typeof vi.fn>;
  };
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    mockBillingService = {
      registerPayment: vi.fn(),
    };
    handler = createWompiWebhookHandler(
      mockBillingService as unknown as BillingService,
      SECRET,
    );
  });

  function generateValidPayload(status: "APPROVED" | "DECLINED" = "APPROVED"): WompiWebhookPayload {
    const data = {
      transaction: {
        id: "tx_wompi_001",
        amount_in_cents: 8000000,
        reference: "cli_11111111-1111-7111-8111-111111111111_inv-999",
        customer_email: "cliente@tienda.com",
        currency: "COP" as const,
        status,
        payment_method_type: "CARD",
      },
    };

    // Concatenar: transaction.id + transaction.status + transaction.amount_in_cents + SECRET
    const stringToHash = `${data.transaction.id}${data.transaction.status}${data.transaction.amount_in_cents}${SECRET}`;
    const checksum = createHash("sha256").update(stringToHash).digest("hex");

    return {
      event: "transaction.updated",
      data,
      environment: "test",
      signature: {
        properties: [
          "transaction.id",
          "transaction.status",
          "transaction.amount_in_cents",
        ],
        checksum,
      },
      timestamp: Date.now(),
    };
  }

  function createRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost:3003/api/webhooks/wompi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rechaza con 401 si el checksum es inválido o fue alterado", async () => {
    const payload = generateValidPayload();
    payload.signature!.checksum = "checksum_falso_invalido";

    const res = await handler(createRequest(payload));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Checksum verification failed");
    expect(mockBillingService.registerPayment).not.toHaveBeenCalled();
  });

  it("descarta con 200 ignored si la transacción no fue aprobada", async () => {
    const payload = generateValidPayload("DECLINED");

    const res = await handler(createRequest(payload));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ignored: boolean };
    expect(json.ignored).toBe(true);
    expect(mockBillingService.registerPayment).not.toHaveBeenCalled();
  });

  it("procesa exitosamente la transacción aprobada y delega a BillingService", async () => {
    mockBillingService.registerPayment.mockResolvedValue(
      ok({
        payment: { id: "p-wompi-1" },
        receipt: { receiptNumber: "REC-2026-99" },
        invoice: { id: "inv-999", status: "paid" },
        alreadyProcessed: false,
      }),
    );

    const payload = generateValidPayload("APPROVED");
    const res = await handler(createRequest(payload));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; paymentId: string; receiptNumber: string };
    expect(json.ok).toBe(true);
    expect(json.paymentId).toBe("p-wompi-1");
    expect(json.receiptNumber).toBe("REC-2026-99");

    expect(mockBillingService.registerPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: "wompi",
        gatewayReference: "tx_wompi_001",
        amountCents: 8000000,
        currency: "COP",
        invoiceId: "inv-999",
      }),
    );
  });
});

