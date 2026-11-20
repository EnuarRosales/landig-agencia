"use client";

import React, { useState } from "react";
import {
  FileText,
  Calendar,
  FileSpreadsheet,
} from "lucide-react";
import type { Invoice, PaymentReceipt } from "@mocter/domain";
import { Badge, Button, Card, EmptyState, Select } from "@mocter/ui";

interface ReceiptsTableProps {
  invoices: Invoice[];
  receipts: PaymentReceipt[];
}

export function ReceiptsTable({ invoices, receipts }: ReceiptsTableProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("monthly");

  function handleExport(format: "xlsx" | "pdf") {
    const url = `/api/billing/export?format=${format}&period=${selectedPeriod}`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Centro de Exportación Contable */}
      <Card className="rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[var(--dsn-text)]">
            Exportación Contable De Comprobantes Y Facturas
          </h3>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
            Descarga el consolidado de pagos y facturación interna en formatos vectorizados o para conciliación.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-[var(--dsn-surface-secondary)] px-3 py-1 rounded-xl border border-[var(--dsn-border)]">
            <Calendar className="h-4 w-4 text-[var(--dsn-text-secondary)] shrink-0" />
            <Select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="border-0 bg-transparent min-h-[30px] h-auto px-1 py-0 text-xs font-medium focus-visible:ring-0"
            >
              <option value="daily">Día En Curso</option>
              <option value="weekly">Semana En Curso</option>
              <option value="monthly">Mes Calendario Activo</option>
              <option value="quarterly">Trimestre Activo</option>
              <option value="annual">Año En Curso</option>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleExport("xlsx")}
            className="rounded-xl bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/30 font-bold text-xs"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Descargar Excel (.xlsx)</span>
          </Button>

          <Button
            type="button"
            variant="ai"
            onClick={() => handleExport("pdf")}
            className="rounded-xl font-bold text-xs"
          >
            <FileText className="h-4 w-4" />
            <span>Descargar PDF (.pdf)</span>
          </Button>
        </div>
      </Card>

      {/* Tabla de Facturas Recientes */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
            Historial Reciente De Facturas Emitidas
          </h3>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {invoices.length} {invoices.length === 1 ? "factura" : "facturas"}
          </span>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10 text-[var(--dsn-text-secondary)]/50" />}
            title="No hay facturas emitidas aún"
            description="Las facturas se generarán automáticamente al renovar o activar cada ciclo de suscripción."
            className="border-0 rounded-none py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Número Factura</th>
                  <th className="py-3 px-4 font-semibold">Subtotal</th>
                  <th className="py-3 px-4 font-semibold">Créditos / Descuentos</th>
                  <th className="py-3 px-4 font-semibold">Total Facturado</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Fecha De Emisión</th>
                  <th className="py-3 px-4 font-semibold">Fecha De Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {invoices.map((inv) => {
                  const subtotal = (inv.subtotalCents / 100).toLocaleString("es-CO", {
                    style: "currency",
                    currency: inv.currency || "COP",
                    maximumFractionDigits: 0,
                  });
                  const credits = (inv.creditCents / 100).toLocaleString("es-CO", {
                    style: "currency",
                    currency: inv.currency || "COP",
                    maximumFractionDigits: 0,
                  });
                  const total = (inv.totalCents / 100).toLocaleString("es-CO", {
                    style: "currency",
                    currency: inv.currency || "COP",
                    maximumFractionDigits: 0,
                  });

                  return (
                    <tr key={inv.id} className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-[var(--dsn-accent)]">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)]">
                        {subtotal}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-400">
                        {inv.creditCents > 0 ? `-${credits}` : "0"}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[var(--dsn-text)]">
                        {total}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            inv.status === "paid"
                              ? "success"
                              : inv.status === "issued"
                                ? "accent"
                                : inv.status === "past_due"
                                  ? "warning"
                                  : "outline"
                          }
                          className="font-mono text-[10px]"
                        >
                          {inv.status === "paid"
                            ? "Pagada"
                            : inv.status === "issued"
                            ? "Emitida"
                            : inv.status === "past_due"
                            ? "Vencida"
                            : inv.status === "void"
                            ? "Anulada"
                            : inv.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                        <span suppressHydrationWarning>
                          {new Date(inv.createdAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                        <span suppressHydrationWarning>
                          {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

