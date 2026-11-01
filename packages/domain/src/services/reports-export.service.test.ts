import { describe, expect, it } from "vitest";
import {
  ReportsExportService,
  type ReportsExportPayload,
} from "./reports-export.service";
import { PeriodResolver } from "./period-resolver";

describe("REP-001 T-06 / T-07 · ReportsExportService", () => {
  const service = new ReportsExportService();

  const mockPayload: ReportsExportPayload = {
    tenantName: "Inversiones San Lucas",
    metrics: {
      period: PeriodResolver.resolve("monthly", undefined, "America/Bogota"),
      orders: {
        totalOrders: { current: 120, previous: 95 },
        revenueCents: { current: 15000000, previous: 12000000 },
      },
      leads: {
        totalLeads: { current: 200, previous: 180 },
        qualifiedLeads: { current: 60, previous: 45 },
        conversionRatePercent: { current: 30, previous: 25 },
      },
      bot: {
        conversationsHandled: { current: 150, previous: 130 },
        humanHandoffs: { current: 15, previous: 20 },
        aiTokensConsumed: { current: 75000, previous: 60000 },
      },
    },
    transactions: [
      {
        date: "2026-10-15 14:30:00",
        type: "order",
        reference: "ORD-2026-001",
        description: "Venta de Producto A",
        amountCents: 5000000,
        status: "delivered",
      },
      {
        date: "2026-10-16 09:15:00",
        type: "lead",
        reference: "LEAD-991",
        description: "Captación WhatsApp bot",
        status: "qualified",
      },
    ],
  };

  it("T-06: genera un buffer de archivo Excel (.xlsx) con 2 hojas formateadas", async () => {
    const res = await service.exportToExcel(mockPayload);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const buffer = res.data;
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // Firma mágica de archivo ZIP / XLSX (PK..)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it("T-07: genera un buffer de archivo PDF (.pdf) canónico con membrete institucional", () => {
    const res = service.exportToPdf(mockPayload);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const buffer = res.data;
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(200);

    const pdfString = buffer.toString("utf-8");
    expect(pdfString.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfString).toContain("MOCTER PLATFORM · INFORME ANALÍTICO EJECUTIVO");
    expect(pdfString).toContain("Inversiones San Lucas");
    expect(pdfString).toContain("%%EOF");
  });
});

