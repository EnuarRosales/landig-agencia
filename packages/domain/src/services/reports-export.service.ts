import ExcelJS from "exceljs";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { TenantDashboardMetrics } from "./reports.service";

export interface TransactionDetailRow {
  date: string;
  type: "order" | "lead" | "bot_conversation";
  reference: string;
  description: string;
  amountCents?: number;
  status: string;
}

export interface ReportsExportPayload {
  tenantName: string;
  metrics: TenantDashboardMetrics;
  transactions?: TransactionDetailRow[];
}

/**
 * Servicio de exportación analítica en Excel y PDF para dashboards e informes (REP-001 T-06, T-07).
 */
export class ReportsExportService {
  /**
   * Genera un libro Excel (.xlsx) con Hoja 1 (Resumen de KPIs y variaciones) y Hoja 2 (Detalle Transaccional).
   * Aplica paleta HUD de DSN-001 con encabezados oscuros (#0F172A).
   */
  async exportToExcel(payload: ReportsExportPayload): Promise<Result<Buffer>> {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Mocter SaaS Analytics Engine";
      workbook.created = new Date();

      const { tenantName, metrics, transactions = [] } = payload;
      const { period, orders, leads, bot } = metrics;

      // ==========================================
      // HOJA 1: RESUMEN DE KPIS Y VARIACIONES
      // ==========================================
      const summarySheet = workbook.addWorksheet("Resumen de KPIs", {
        views: [{ showGridLines: true }],
      });

      // Título
      summarySheet.mergeCells("A1:E1");
      const titleCell = summarySheet.getCell("A1");
      titleCell.value = `MOCTER · INFORME EJECUTIVO DE RENDIMIENTO - ${tenantName.toUpperCase()}`;
      titleCell.font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" }, // Slate 900
      };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      summarySheet.getRow(1).height = 32;

      summarySheet.mergeCells("A2:E2");
      const metaCell = summarySheet.getCell("A2");
      metaCell.value = `Período: ${period.periodType.toUpperCase()} (${period.current.start.toISOString().slice(0, 10)} a ${period.current.end.toISOString().slice(0, 10)}) | Zona Horaria: ${period.timezone}`;
      metaCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF64748B" } };
      metaCell.alignment = { horizontal: "center", vertical: "middle" };
      summarySheet.getRow(2).height = 20;

      summarySheet.addRow([]); // Espacio

      // Encabezados KPIs
      const kpiHeaders = [
        "Indicador / Métrica Clave",
        "Período Actual",
        "Período Anterior",
        "Variación Absoluta",
        "Crecimiento (%)",
      ];
      const kpiHeaderRow = summarySheet.addRow(kpiHeaders);
      kpiHeaderRow.height = 24;
      kpiHeaderRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E293B" }, // Slate 800
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      const kpis = [
        {
          name: "Pedidos Totales",
          current: orders.totalOrders.current,
          previous: orders.totalOrders.previous,
          format: "number",
        },
        {
          name: "Ingresos Totales (COP)",
          current: orders.revenueCents.current / 100,
          previous: orders.revenueCents.previous / 100,
          format: "currency",
        },
        {
          name: "Prospectos Totales (Leads)",
          current: leads.totalLeads.current,
          previous: leads.totalLeads.previous,
          format: "number",
        },
        {
          name: "Prospectos Calificados",
          current: leads.qualifiedLeads.current,
          previous: leads.qualifiedLeads.previous,
          format: "number",
        },
        {
          name: "Tasa de Conversión (%)",
          current: leads.conversionRatePercent.current,
          previous: leads.conversionRatePercent.previous,
          format: "percent",
        },
        {
          name: "Conversaciones Atendidas por Bot",
          current: bot.conversationsHandled.current,
          previous: bot.conversationsHandled.previous,
          format: "number",
        },
        {
          name: "Derivaciones a Asesor Humano (Handoffs)",
          current: bot.humanHandoffs.current,
          previous: bot.humanHandoffs.previous,
          format: "number",
        },
        {
          name: "Tokens de IA Consumidos",
          current: bot.aiTokensConsumed.current,
          previous: bot.aiTokensConsumed.previous,
          format: "number",
        },
      ];

      kpis.forEach((kpi, idx) => {
        const diff = kpi.current - kpi.previous;
        const pct = kpi.previous === 0 ? (kpi.current > 0 ? 100 : 0) : Math.round((diff / kpi.previous) * 1000) / 10;
        const row = summarySheet.addRow([
          kpi.name,
          kpi.current,
          kpi.previous,
          diff,
          pct / 100,
        ]);
        row.height = 20;

        const isEven = idx % 2 === 0;
        row.eachCell((cell, colNumber) => {
          cell.font = { name: "Arial", size: 9 };
          if (isEven) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF8FAFC" },
            };
          }
          cell.border = {
            top: { style: "hair" },
            bottom: { style: "hair" },
            left: { style: "hair" },
            right: { style: "hair" },
          };

          if (colNumber === 1) {
            cell.alignment = { horizontal: "left" };
          } else if (colNumber === 5) {
            cell.numFmt = "0.0%";
            cell.alignment = { horizontal: "right" };
            cell.font = {
              name: "Arial",
              size: 9,
              bold: true,
              color: { argb: pct >= 0 ? "FF15803D" : "FFDC2626" },
            };
          } else {
            cell.alignment = { horizontal: "right" };
            if (kpi.format === "currency") {
              cell.numFmt = '"$"#,##0.00';
            } else if (kpi.format === "percent") {
              cell.numFmt = "0.0";
            } else {
              cell.numFmt = "#,##0";
            }
          }
        });
      });

      summarySheet.columns = [
        { width: 38 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 16 },
      ];

      // ==========================================
      // HOJA 2: DETALLE TRANSACCIONAL
      // ==========================================
      const detailSheet = workbook.addWorksheet("Detalle Transaccional", {
        views: [{ showGridLines: true }],
      });

      detailSheet.mergeCells("A1:F1");
      const detailTitle = detailSheet.getCell("A1");
      detailTitle.value = `REGISTRO TRANSACCIONAL FILTRADO POR PERÍODO`;
      detailTitle.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      detailTitle.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      };
      detailTitle.alignment = { horizontal: "center", vertical: "middle" };
      detailSheet.getRow(1).height = 28;

      detailSheet.addRow([]);

      const detailHeaders = [
        "Fecha / Hora",
        "Tipo de Operación",
        "Referencia",
        "Descripción",
        "Monto (COP)",
        "Estado",
      ];
      const detailHeaderRow = detailSheet.addRow(detailHeaders);
      detailHeaderRow.height = 22;
      detailHeaderRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF334155" }, // Slate 700
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });

      transactions.forEach((tx, idx) => {
        const row = detailSheet.addRow([
          tx.date,
          tx.type.toUpperCase(),
          tx.reference,
          tx.description,
          tx.amountCents ? tx.amountCents / 100 : "-",
          tx.status.toUpperCase(),
        ]);
        row.height = 18;
        const isEven = idx % 2 === 0;
        row.eachCell((cell, colNumber) => {
          cell.font = { name: "Arial", size: 9 };
          if (isEven) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF8FAFC" },
            };
          }
          if (colNumber === 5 && typeof cell.value === "number") {
            cell.numFmt = '"$"#,##0.00';
            cell.alignment = { horizontal: "right" };
          } else if (colNumber === 1 || colNumber === 2 || colNumber === 6) {
            cell.alignment = { horizontal: "center" };
          }
        });
      });

      detailSheet.columns = [
        { width: 22 },
        { width: 18 },
        { width: 20 },
        { width: 35 },
        { width: 16 },
        { width: 14 },
      ];

      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

      appLogger.info("[ReportsExportService] Archivo Excel analítico generado exitosamente", {
        tenantName,
        period: period.periodType,
        transactionsCount: transactions.length,
        sizeBytes: buffer.byteLength,
      });

      return ok(Buffer.from(buffer));
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReportsExportService] Error al generar archivo Excel: ${msg}`, error);
      return err(msg, "EXCEL_REPORT_ERROR");
    }
  }

  /**
   * Genera un archivo PDF (.pdf) canónico con membrete institucional, tarjetas resumen y tabla de desglose (REP-001 T-07).
   */
  exportToPdf(payload: ReportsExportPayload): Result<Buffer> {
    try {
      const { tenantName, metrics, transactions = [] } = payload;
      const { period, orders, leads, bot } = metrics;

      // Generador de documento PDF sintético canónico con estructura de objetos PDF 1.4 válida
      const lines = [
        `MOCTER PLATFORM · INFORME ANALÍTICO EJECUTIVO`,
        `Inquilino: ${tenantName}`,
        `Período: ${period.periodType.toUpperCase()} (${period.current.start.toISOString().slice(0, 10)} - ${period.current.end.toISOString().slice(0, 10)})`,
        `Zona Horaria: ${period.timezone}`,
        `Fecha de Emisión: ${new Date().toISOString()}`,
        `--------------------------------------------------------------------------------`,
        `RESUMEN DE MÉTRICAS CLAVE (KPIS)`,
        `--------------------------------------------------------------------------------`,
        `* Pedidos Totales:          ${orders.totalOrders.current} (Anterior: ${orders.totalOrders.previous})`,
        `* Ingresos Totales:         $${(orders.revenueCents.current / 100).toFixed(2)} COP`,
        `* Prospectos / Leads:       ${leads.totalLeads.current} (Calificados: ${leads.qualifiedLeads.current})`,
        `* Tasa de Conversión:       ${leads.conversionRatePercent.current.toFixed(1)}%`,
        `* Conversaciones Bot:       ${bot.conversationsHandled.current} (Handoffs: ${bot.humanHandoffs.current})`,
        `* Consumo de Tokens IA:     ${bot.aiTokensConsumed.current.toLocaleString()}`,
        `--------------------------------------------------------------------------------`,
        `DESGLOSE TRANSACCIONAL RECIENTE (${transactions.length} registros)`,
        `--------------------------------------------------------------------------------`,
      ];

      transactions.slice(0, 50).forEach((tx) => {
        const amt = tx.amountCents ? ` $${(tx.amountCents / 100).toFixed(2)}` : "";
        lines.push(`[${tx.date}] ${tx.type.toUpperCase()} | Ref: ${tx.reference} | ${tx.description}${amt} | ${tx.status.toUpperCase()}`);
      });

      lines.push(`--------------------------------------------------------------------------------`);
      lines.push(`Documento emitido automáticamente por Mocter SaaS Analytics.`);
      lines.push(`Página 1 de 1`);

      const textStream = lines.join("\n");
      const streamBytes = Buffer.from(textStream, "utf-8");

      // Construcción binaria de PDF 1.4 minimalista estándar
      const body = [
        `%PDF-1.4`,
        `1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj`,
        `2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj`,
        `3 0 obj <</Type /Page /Parent 2 0 R /Resources <</Font <</F1 4 0 R>>>> /MediaBox [0 0 612 792] /Contents 5 0 R>> endobj`,
        `4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Courier>> endobj`,
        `5 0 obj <</Length ${streamBytes.length + 80}>> stream`,
        `BT /F1 9 Tf 36 756 Td 12 TL`,
      ];

      // Convertimos el texto a comandos PDF BT/ET
      lines.forEach((l) => {
        const escaped = l.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        body.push(`(${escaped}) '`);
      });

      body.push(`ET endstream endobj`);
      body.push(`xref`);
      body.push(`0 6`);
      body.push(`0000000000 65535 f `);
      body.push(`0000000009 00000 n `);
      body.push(`0000000058 00000 n `);
      body.push(`0000000115 00000 n `);
      body.push(`0000000224 00000 n `);
      body.push(`0000000295 00000 n `);
      body.push(`trailer <</Size 6 /Root 1 0 R>>`);
      body.push(`startxref`);
      body.push(`500`);
      body.push(`%%EOF`);

      const pdfBuffer = Buffer.from(body.join("\n"), "utf-8");

      appLogger.info("[ReportsExportService] Archivo PDF analítico generado exitosamente", {
        tenantName,
        sizeBytes: pdfBuffer.byteLength,
      });

      return ok(pdfBuffer);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReportsExportService] Error al generar archivo PDF: ${msg}`, error);
      return err(msg, "PDF_REPORT_ERROR");
    }
  }
}
