import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createBillingExportRouteHandler } from "./route";
import { BillingExportService } from "@mocter/domain";

describe("BILL-001 T-08 / T-09 · Billing Export Route Handler (/api/billing/export)", () => {
  let exportService: BillingExportService;
  let mockFetcher: { getExportItems: ReturnType<typeof vi.fn> };
  let handler: (req: NextRequest) => Promise<Response>;

  const demoItems = [
    {
      paymentId: "p-1",
      invoiceNumber: "INV-2026-0001",
      clientName: "Empresa Uno",
      gateway: "wompi",
      gatewayReference: "tx_123",
      amountCents: 15000000,
      currency: "COP",
      status: "approved",
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    exportService = new BillingExportService();
    mockFetcher = {
      getExportItems: vi.fn().mockResolvedValue(demoItems),
    };
    handler = createBillingExportRouteHandler(exportService, mockFetcher);
  });

  it("exporta archivo Excel con cabeceras de Content-Disposition y MIME type correcto", async () => {
    const req = new NextRequest("http://localhost:3003/api/billing/export?format=xlsx&period=monthly");
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toContain(".xlsx");
  });

  it("exporta archivo PDF con cabeceras correctas", async () => {
    const req = new NextRequest("http://localhost:3003/api/billing/export?format=pdf&period=monthly");
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(".pdf");
    const text = await res.text();
    expect(text).toContain("MOCTER SAAS · COMPROBANTE OFICIAL DE PAGO");
  });
});

