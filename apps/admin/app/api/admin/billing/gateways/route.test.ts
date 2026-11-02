import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "./route";

const mockListConfig = vi.fn().mockResolvedValue({
  ok: true,
  data: [
    {
      id: "wompi",
      displayName: "Wompi (Colombia / COP)",
      isEnabled: true,
      environment: "sandbox",
      publicKey: "pub_test_123",
      hasSecretKey: true,
      hasWebhookSecret: true,
      webhookUrl: "/api/webhooks/wompi",
      updatedAt: new Date(),
    },
  ],
});

const mockUpsertConfig = vi.fn().mockImplementation((input) =>
  Promise.resolve({
    ok: true,
    data: {
      ...input,
      hasSecretKey: Boolean(input.secretKey),
      hasWebhookSecret: Boolean(input.webhookSecret),
      updatedAt: new Date(),
    },
  }),
);

vi.mock("@mocter/domain", () => ({
  getBillingService: vi.fn().mockReturnValue({
    listPaymentGatewaysPublicConfig: () => mockListConfig(),
    upsertPaymentGatewayConfig: (input: any) => mockUpsertConfig(input),
  }),
}));

describe("BILL-001 · Pasarelas de Pago (/api/admin/billing/gateways)", () => {
  it("GET responde 200 con el listado público de pasarelas", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.length).toBe(1);
    expect(json.data[0].id).toBe("wompi");
  });

  it("PUT valida el ID de pasarela y responde 400 si es inválido", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/gateways", {
      method: "PUT",
      body: JSON.stringify({ id: "paypal" }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("PUT actualiza la configuración de la pasarela y responde 200", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/gateways", {
      method: "PUT",
      body: JSON.stringify({
        id: "wompi",
        isEnabled: true,
        environment: "production",
        publicKey: "pub_prod_123",
        secretKey: "prv_prod_secret",
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.environment).toBe("production");
  });
});
