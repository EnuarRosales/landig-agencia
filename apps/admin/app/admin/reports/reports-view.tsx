"use client";

import React, { useState } from "react";
import {
  BarChart3,
  HardDrive,
  Cpu,
  Layers,
  ArrowUpRight,
  Download,
  CheckCircle2,
} from "lucide-react";
import type { AdminPlatformReportsOverviewDto } from "@mocter/domain";

interface ReportsViewProps {
  initialData: AdminPlatformReportsOverviewDto;
}

/**
 * Vista de analítica ejecutiva y reportes globales de la SaaS (REP-001).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8:
 * Todos los labels utilizan formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 */
export function ReportsView({ initialData }: ReportsViewProps) {
  const [downloading, setDownloading] = useState(false);

  const formattedMrr = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(initialData.kpis.totalMrrCop);

  function handleExportCsv() {
    setDownloading(true);
    const rows = [
      ["Plan", "Inquilinos", "MRR (COP)"],
      ...initialData.tenantsByPlan.map((p) => [p.planName, p.count.toString(), p.mrrCop.toString()]),
      [],
      ["Almacenamiento", "Bytes"],
      ["Originales SeaweedFS", initialData.storage.originalBytes.toString()],
      ["Variantes imgproxy", initialData.storage.variantsBytes.toString()],
      ["Total Almacenado", initialData.storage.totalBytes.toString()],
      [],
      ["Inferencia AI", "Tokens"],
      ["Bots De Atención", initialData.aiUsage.botTokens.toString()],
      ["Asistente AI Assist", initialData.aiUsage.assistTokens.toString()],
      ["Total Tokens", initialData.aiUsage.totalTokens.toString()],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mocter_reporte_ejecutivo_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloading(false);
  }

  return (
    <div className="space-y-6">
      {/* Botón de exportación */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
        >
          <Download className="h-4 w-4 text-[var(--dsn-accent)]" />
          <span>Exportar Informe CSV</span>
        </button>
      </div>

      {/* Grilla 1: Distribución por Plan */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3 mb-4">
          <Layers className="h-4 w-4 text-[var(--dsn-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
            Distribución De Inquilinos y MRR Por Plan
          </h3>
        </div>

        {initialData.tenantsByPlan.length === 0 ? (
          <p className="text-xs text-[var(--dsn-text-secondary)]">No hay datos de planes registrados.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {initialData.tenantsByPlan.map((p) => {
              const mrrFormatted = new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(p.mrrCop);

              return (
                <div
                  key={p.planCode}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--dsn-text)]">{p.planName}</span>
                    <span className="font-mono text-xs text-[var(--dsn-accent)]">{p.count} clientes</span>
                  </div>
                  <p className="text-lg font-bold text-emerald-400 font-mono">{mrrFormatted}</p>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)]">MRR recurrente mensual</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Grilla 2: Infraestructura SeaweedFS e Inferencia LLM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Almacenamiento */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3 mb-4">
            <HardDrive className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              Almacenamiento SeaweedFS y Multimedia
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--dsn-border)]/50">
              <span className="text-[var(--dsn-text-secondary)]">Archivos Registrados</span>
              <span className="font-mono font-medium text-[var(--dsn-text)]">
                {initialData.storage.filesCount.toLocaleString()} archivos
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--dsn-border)]/50">
              <span className="text-[var(--dsn-text-secondary)]">Originales En SeaweedFS</span>
              <span className="font-mono font-medium text-[var(--dsn-text)]">
                {(initialData.storage.originalBytes / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--dsn-border)]/50">
              <span className="text-[var(--dsn-text-secondary)]">Variantes imgproxy Optimizadas</span>
              <span className="font-mono font-medium text-[var(--dsn-text)]">
                {(initialData.storage.variantsBytes / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-2 bg-[var(--dsn-background)] px-3 rounded-lg">
              <span className="font-semibold text-[var(--dsn-text)]">Total Almacenamiento Utilizado</span>
              <span className="font-mono font-bold text-purple-400">
                {(initialData.storage.totalBytes / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
          </div>
        </section>

        {/* Inferencia LLM */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3 mb-4">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              Consumo De Inferencia y Tokens AI
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--dsn-border)]/50">
              <span className="text-[var(--dsn-text-secondary)]">Tokens En Bots De Atención</span>
              <span className="font-mono font-medium text-[var(--dsn-text)]">
                {initialData.aiUsage.botTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--dsn-border)]/50">
              <span className="text-[var(--dsn-text-secondary)]">Tokens En «Mejorar Con AI»</span>
              <span className="font-mono font-medium text-[var(--dsn-text)]">
                {initialData.aiUsage.assistTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--dsn-border)]/50">
              <span className="text-[var(--dsn-text-secondary)]">Total Consumo Agregado</span>
              <span className="font-mono font-medium text-[var(--dsn-text)]">
                {initialData.aiUsage.totalTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-2 bg-[var(--dsn-background)] px-3 rounded-lg">
              <span className="font-semibold text-[var(--dsn-text)]">Costo Inferencia USD</span>
              <span className="font-mono font-bold text-cyan-400">
                ${(initialData.aiUsage.totalCostUsdCents / 100).toFixed(2)} USD
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
