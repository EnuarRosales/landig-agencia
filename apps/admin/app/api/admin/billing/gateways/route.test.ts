import { describe, expect, it, vi, beforeEach } from "vitest";
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
      supportedCountries: ["CO"],
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
      breBKeyType: "email",
      breBKeyValue: "pagos@mocter.co",
      breBRecipientName: "MOCTER SAS",
      breBQrPayloadTemplate: null,
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

const mockResolvePortalContext = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: (...args: unknown[]) =>
      mockResolvePortalContext(...args),
    getBillingService: vi.fn().mockReturnValue({
      listPaymentGatewaysPublicConfig: () => mockListConfig(),
      upsertPaymentGatewayConfig: (input: unknown) => mockUpsertConfig(input),
    }),
  };
});

describe("BILL-001 & SPEC-04 · Pasarelas de Pago (/api/admin/billing/gateways)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePortalContext.mockResolvedValue({
      user: { id: "admin-1", email: "owner@mocter.co" },
      session: { id: "sid-admin" },
      scope: "platform",
      role: "platform_owner",
      effectiveRoles: ["platform_owner"],
    });
  });

  it("GET responde 200 con listado público incluyendo bre_b para platform_owner", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/gateways", {
      headers: { cookie: "mocter_sid=sid-admin" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
    expect(json.ok).toBe(true);
    expect(json.data.map((g) => g.id)).toEqual(["wompi", "bre_b"]);
  });

  it("GET responde 403 si el usuario es de un inquilino", async () => {
    mockResolvePortalContext.mockResolvedValueOnce({
      user: { id: "tenant-1", email: "owner@tienda.co" },
      session: { id: "sid-tenant" },
      scope: "tenant",
      role: "tenant_owner",
      effectiveRoles: ["tenant_owner"],
    });
    const req = new NextRequest("http://localhost:3003/api/admin/billing/gateways", {
      headers: { cookie: "mocter_sid=sid-tenant" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("PUT valida el ID de pasarela y responde 400 si es inválido", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/gateways", {
      method: "PUT",
      headers: { cookie: "mocter_sid=sid-admin" },
      body: JSON.stringify({ id: "paypal" }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("PUT permite configurar canal bre_b y responde 200", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/gateways", {
      method: "PUT",
      headers: { cookie: "mocter_sid=sid-admin" },
      body: JSON.stringify({
        id: "bre_b",
        isEnabled: true,
        environment: "production",
        supportedCountries: ["CO"],
        breBKeyType: "phone",
        breBKeyValue: "3001234567",
        breBRecipientName: "MOCTER SAS",
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { id: string; breBKeyValue: string } };
    expect(json.ok).toBe(true);
    expect(json.data.id).toBe("bre_b");
    expect(json.data.breBKeyValue).toBe("3001234567");
  });
});
