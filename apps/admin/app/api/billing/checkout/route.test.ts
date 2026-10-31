import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createCheckoutRouteHandler } from "./route";
import { ok } from "@mocter/domain";
import type { CheckoutService } from "@mocter/domain";

describe("BILL-001 T-06 · Checkout Route Handler (/api/billing/checkout)", () => {
  let mockCheckoutService: {
    createCheckoutSession: ReturnType<typeof vi.fn>;
  };
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    mockCheckoutService = {
      createCheckoutSession: vi.fn(),
    };
    handler = createCheckoutRouteHandler(mockCheckoutService as unknown as CheckoutService);
  });

  function createRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost:3003/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("responde 400 Bad Request si la carga útil es inválida", async () => {
    const res = await handler(createRequest({ clientId: "invalido" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it("inicia checkout Wompi para COP y responde 200 con checkoutUrl", async () => {
    mockCheckoutService.createCheckoutSession.mockResolvedValue(
      ok({
        gateway: "wompi",
        invoiceId: "inv-101",
        reference: "ref-101",
        amountCents: 15000000,
        currency: "COP",
        publicKey: "pub_test",
        checkoutUrl: "https://checkout.wompi.co/p/?ref=101",
      }),
    );

    const res = await handler(
      createRequest({
        clientId: "11111111-1111-7111-8111-111111111111",
        planId: "22222222-2222-7222-8222-222222222222",
        planCode: "starter",
        amountCents: 15000000,
        currency: "COP",
        customerEmail: "pago@cliente.com",
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { gateway: string; checkoutUrl: string } };
    expect(json.ok).toBe(true);
    expect(json.data.gateway).toBe("wompi");
    expect(json.data.checkoutUrl).toContain("https://checkout.wompi.co");
  });
});

