import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { BillingExportService, type BillingExportItem } from "./billing-export.service";

describe("BILL-001 T-08 / T-09 · BillingExportService", () => {
  const service = new BillingExportService();

  const mockItems: BillingExportItem[] = [
    {
      paymentId: "p-1",
      invoiceNumber: "INV-2026-0001",
      clientName: "Empresa Alfa SAS",
      gateway: "wompi",
      gatewayReference: "tx_123456",
      amountCents: 15000000,
      currency: "COP",
      status: "approved",
      createdAt: new Date("2026-10-31T10:00:00Z"),
    },
    {
      paymentId: "p-2",
      invoiceNumber: "INV-2026-0002",
      clientName: "Global Trade LLC",
      gateway: "stripe",
      gatewayReference: "pi_987654",
      amountCents: 4900,
      currency: "USD",
      status: "approved",
      createdAt: new Date("2026-10-31T11:30:00Z"),
    },
  ];

  it("genera un buffer de archivo Excel válido con hojas y datos formateados", async () => {
    const result = await service.exportToExcel(mockItems, {
      period: "monthly",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.byteLength).toBeGreaterThan(1000);

    // Leer el buffer generado con ExcelJS para verificar estructura
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.data as any);
    const sheet = wb.getWorksheet("Comprobantes de Pago");
    expect(sheet).toBeDefined();

    // Comprobar filas de datos
    expect(sheet!.rowCount).toBeGreaterThanOrEqual(6); // Título + filtros + espacio + encabezados + 2 datos + totales
    const firstDataRow = sheet!.getRow(5);
    expect(firstDataRow.getCell(2).value).toBe("INV-2026-0001");
    expect(firstDataRow.getCell(3).value).toBe("Empresa Alfa SAS");
    expect(firstDataRow.getCell(4).value).toBe("WOMPI");
    expect(firstDataRow.getCell(6).value).toBe(150000);
  });

  it("genera texto estructurado para comprobante de pago individual en PDF", () => {
    const summary = service.generatePdfSummary(mockItems[0]);
    expect(summary).toContain("MOCTER SAAS · COMPROBANTE OFICIAL DE PAGO");
    expect(summary).toContain("INV-2026-0001");
    expect(summary).toContain("150000.00 COP");
    expect(summary).toContain("WOMPI");
  });
});

