import { NextRequest, NextResponse } from "next/server";
import { appLogger } from "@mocter/domain";
import type { BillingExportService, BillingReportPeriod } from "@mocter/domain";

export interface MockBillingDataFetcher {
  getExportItems(period: BillingReportPeriod, clientId?: string): Promise<any[]>;
}

/**
 * Route Handler para exportación financiera y de comprobantes de pago en Excel y PDF (BILL-001 T-08, T-09).
 */
export function createBillingExportRouteHandler(
  exportService: BillingExportService,
  dataFetcher: MockBillingDataFetcher,
) {
  return async function GET(req: NextRequest) {
    try {
      const url = new URL(req.url);
      const format = url.searchParams.get("format") ?? "xlsx";
      const period = (url.searchParams.get("period") ?? "monthly") as BillingReportPeriod;
      const clientId = url.searchParams.get("clientId") ?? undefined;

      const items = await dataFetcher.getExportItems(period, clientId);

      if (format === "xlsx") {
        const res = await exportService.exportToExcel(items, { period, clientId });
        if (!res.ok) {
          return NextResponse.json({ error: res.error }, { status: 500 });
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        return new NextResponse(res.data as any, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="mocter-billing-${period}-${dateStr}.xlsx"`,
          },
        });
      }

      if (format === "pdf") {
        // En v1 devuelve el reporte consolidado en texto plano/formateado descargable
        const summaries = items.map((i) => exportService.generatePdfSummary(i)).join("\n\n");
        return new NextResponse(summaries, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="mocter-billing-${period}.pdf"`,
          },
        });
      }

      return NextResponse.json({ error: "Formato no soportado (use xlsx o pdf)" }, { status: 400 });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ApiBillingExport] Error al exportar comprobantes: ${msg}`, error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

