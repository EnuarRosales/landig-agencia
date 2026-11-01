import ExcelJS from "exceljs";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { Payment } from "../db/schemas/admin/billing";

export type BillingReportPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "custom";

export interface BillingExportFilter {
  period: BillingReportPeriod;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  clientId?: string;
  currency?: "COP" | "USD";
}

export interface BillingExportItem {
  paymentId: string;
  invoiceNumber: string;
  clientName: string;
  gateway: string;
  gatewayReference: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}

/**
 * Servicio de exportación contable y financiera en Excel y PDF (BILL-001 §5, T-08, T-09).
 */
export class BillingExportService {
  /**
   * Genera un libro de Excel (.xlsx) estilizado y vectorizado con los registros contables.
   */
  async exportToExcel(
    items: BillingExportItem[],
    filter: BillingExportFilter,
  ): Promise<Result<Buffer>> {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Mocter SaaS Billing Engine";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Comprobantes de Pago", {
        views: [{ showGridLines: true }],
      });

      // 1. Título y Filtros
      sheet.mergeCells("A1:H1");
      const titleCell = sheet.getCell("A1");
      titleCell.value = "MOCTER SAAS · REPORTE FINANCIERO Y COMPROBANTES DE PAGO";
      titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1E293B" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 30;

      sheet.mergeCells("A2:H2");
      const filterCell = sheet.getCell("A2");
      filterCell.value = `Período: ${filter.period.toUpperCase()} | Moneda: ${filter.currency ?? "TODAS"} | Fecha de Emisión: ${new Date().toISOString()}`;
      filterCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
      filterCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(2).height = 20;

      // Espaciador
      sheet.addRow([]);

      // 2. Encabezados de Tabla
      const headers = [
        "Fecha",
        "No. Factura",
        "Inquilino / Cliente",
        "Pasarela",
        "Referencia Transacción",
        "Monto Total",
        "Moneda",
        "Estado",
      ];
      const headerRow = sheet.addRow(headers);
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF312E81" }, // Indigo 900
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // 3. Filas de datos
      let totalAmountCents = 0;
      items.forEach((item, index) => {
        totalAmountCents += item.amountCents;
        const row = sheet.addRow([
          item.createdAt.toISOString().slice(0, 19).replace("T", " "),
          item.invoiceNumber,
          item.clientName,
          item.gateway.toUpperCase(),
          item.gatewayReference,
          item.amountCents / 100, // Presentación en unidades monetarias
          item.currency,
          item.status.toUpperCase(),
        ]);

        row.height = 20;
        // Alternancia de color en filas
        const isEven = index % 2 === 0;
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
          // Formateo de números para la columna monto
          if (colNumber === 6) {
            cell.numFmt = '"$"#,##0.00';
            cell.alignment = { horizontal: "right" };
          } else if (colNumber === 1 || colNumber === 4 || colNumber === 7 || colNumber === 8) {
            cell.alignment = { horizontal: "center" };
          }
        });
      });

      // 4. Fila de Totales
      const totalRow = sheet.addRow([
        "TOTAL ACUMULADO",
        "",
        "",
        "",
        "",
        totalAmountCents / 100,
        filter.currency ?? "MIXTA",
        `${items.length} PAGOS`,
      ]);
      totalRow.height = 24;
      totalRow.eachCell((cell, colNumber) => {
        cell.font = { name: "Arial", size: 10, bold: true };
        cell.border = {
          top: { style: "double" },
          bottom: { style: "double" },
        };
        if (colNumber === 6) {
          cell.numFmt = '"$"#,##0.00';
          cell.alignment = { horizontal: "right" };
        }
      });

      // Auto-dimensionar columnas
      sheet.columns = [
        { width: 22 }, // Fecha
        { width: 18 }, // Factura
        { width: 26 }, // Inquilino
        { width: 14 }, // Pasarela
        { width: 30 }, // Referencia
        { width: 18 }, // Monto
        { width: 10 }, // Moneda
        { width: 16 }, // Estado
      ];

      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

      appLogger.info("[BillingExportService] Exportación Excel generada con éxito", {
        itemsCount: items.length,
        period: filter.period,
        sizeBytes: buffer.byteLength,
      });

      return ok(Buffer.from(buffer));
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[BillingExportService] Error al generar Excel: ${msg}`, error);
      return err(msg, "EXCEL_EXPORT_ERROR");
    }
  }

  /**
   * Genera el contenido estructurado base para comprobante de pago en PDF (BILL-001 T-09).
   */
  generatePdfSummary(item: BillingExportItem): string {
    return [
      `============================================================`,
      `MOCTER SAAS · COMPROBANTE OFICIAL DE PAGO`,
      `============================================================`,
      `No. Comprobante:     ${item.invoiceNumber}`,
      `ID Transacción:      ${item.paymentId}`,
      `Fecha y Hora:        ${item.createdAt.toISOString()}`,
      `Inquilino / Titular: ${item.clientName}`,
      `Pasarela:            ${item.gateway.toUpperCase()}`,
      `Referencia Externa:  ${item.gatewayReference}`,
      `Monto Liquidado:     ${(item.amountCents / 100).toFixed(2)} ${item.currency}`,
      `Estado:              ${item.status.toUpperCase()}`,
      `============================================================`,
      `Gracias por su suscripción a Mocter.`,
      `Documento interno válido para control contable y administrativo.`,
      `============================================================`,
    ].join("\n");
  }
}

