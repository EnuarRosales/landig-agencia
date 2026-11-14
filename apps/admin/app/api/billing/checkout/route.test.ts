import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { err, ok, type CheckoutService } from "@mocter/domain";
import { createCheckoutRouteHandler } from "./route";

const mockResolvePortalContext = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: (...args: unknown[]) =>
      mockResolvePortalContext(...args),
  };
});

describe("BILL-001 & SPEC-04 · Checkout Route Handler (/api/billing/checkout)", () => {
  let mockCheckoutService: {
    createCheckoutSession: ReturnType<typeof vi.fn>;
  };
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckoutService = {
      createCheckoutSession: vi.fn(),
    };
    mockResolvePortalContext.mockResolvedValue({
      user: { id: "user-owner-1", email: "owner@cliente.co", displayName: "Owner", status: "active", emailVerifiedAt: new Date() },
      session: { id: "sid-1" },
      scope: "tenant",
      role: "tenant_owner",
      effectiveRoles: ["tenant_owner"],
      activeClientId: "11111111-1111-7111-8111-111111111111",
      activeClient: null,
      activeCellId: null,
      activeCellCode: null,
      planName: "Starter",
      capabilities: {},
      lifecycleStatus: "activo",
    });
    handler = createCheckoutRouteHandler(mockCheckoutService as unknown as CheckoutService);
  });

  function createRequest(body: unknown, withCookie = true): NextRequest {
    const req = new NextRequest("http://localhost:3003/api/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(withCookie ? { cookie: "mocter_sid=sid-valid-123" } : {}),
      },
      body: JSON.stringify(body),
    });
    return req;
  }

  it("responde 401 si no existe cookie de sesión", async () => {
    const res = await handler(
      createRequest(
        {
          clientId: "11111111-1111-7111-8111-111111111111",
          planId: "22222222-2222-7222-8222-222222222222",
          planCode: "starter",
          amountCents: 15000000,
          currency: "COP",
        },
        false,
      ),
    );
    expect(res.status).toBe(401);
  });

  it("responde 403 Forbidden si el actor es tenant_agent", async () => {
    mockResolvePortalContext.mockResolvedValueOnce({
      user: { id: "user-agent-1", email: "agent@cliente.co" },
      session: { id: "sid-2" },
      scope: "tenant",
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
      activeClientId: "11111111-1111-7111-8111-111111111111",
    });

    const res = await handler(
      createRequest({
        clientId: "11111111-1111-7111-8111-111111111111",
        planId: "22222222-2222-7222-8222-222222222222",
        planCode: "starter",
        amountCents: 15000000,
        currency: "COP",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("responde 400 Bad Request si la carga útil es inválida", async () => {
    const res = await handler(createRequest({ clientId: "invalido" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it("responde 422 Problem Details con código BRE_B_COLOMBIA_ONLY o GATEWAY_DISABLED", async () => {
    mockCheckoutService.createCheckoutSession.mockResolvedValueOnce(
      err("Bre-B exclusivo CO/COP", "BRE_B_COLOMBIA_ONLY"),
    );

    const res = await handler(
      createRequest({
        clientId: "11111111-1111-7111-8111-111111111111",
        planId: "22222222-2222-7222-8222-222222222222",
        planCode: "starter",
        amountCents: 4900,
        currency: "USD",
        gateway: "bre_b",
      }),
    );

    expect(res.status).toBe(422);
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("BRE_B_COLOMBIA_ONLY");
  });

  it("inicia checkout Bre-B para Colombia y responde 200 con QR dinámico", async () => {
    mockCheckoutService.createCheckoutSession.mockResolvedValueOnce(
      ok({
        gateway: "bre_b",
        invoiceId: "inv-breb-1",
        invoiceNumber: "INV-2026-100001",
        reference: "ref-breb-1",
        amountCents: 15000000,
        currency: "COP",
        recipientName: "MOCTER SAS",
        keyType: "email",
        keyValue: "pagos@mocter.co",
        qrPayload: "000201...",
        qrSvgDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
        amountFormattedCop: "$ 150.000",
      }),
    );

    const res = await handler(
      createRequest({
        clientId: "11111111-1111-7111-8111-111111111111",
        planId: "22222222-2222-7222-8222-222222222222",
        planCode: "starter",
        amountCents: 15000000,
        currency: "COP",
        gateway: "bre_b",
        customerEmail: "pago@cliente.com",
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { gateway: string; qrSvgDataUrl: string } };
    expect(json.ok).toBe(true);
    expect(json.data.gateway).toBe("bre_b");
    expect(json.data.qrSvgDataUrl).toContain("data:image/svg+xml;base64,");
  });
});
