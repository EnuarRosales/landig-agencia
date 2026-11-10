import React from "react";
import { fetchAdminPlatformReports } from "@mocter/domain";
import { BarChart3, TrendingUp, Users, HardDrive, Cpu } from "lucide-react";
import { ReportsView } from "./reports-view";

export const metadata = {
  title: "Informes y Analítica · mocter-admin",
  description: "Métricas analíticas globales, consumo de almacenamiento y agregados de inferencia AI.",
};

/**
 * Vista de informes ejecutivos y analítica consolidada de la SaaS (REP-001).
 *
 * Permite al Platform Owner supervisar el ingreso recurrente mensual (MRR),
 * ocupación de SeaweedFS, consumo de tokens AI y distribución de clientes por plan.
 */
export default async function AdminReportsPage() {
  const reports = await fetchAdminPlatformReports();

  const formattedMrr = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(reports.kpis.totalMrrCop);

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Encabezado HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Informes Ejecutivos y Analítica Global
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              Cero PII · Agregados
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Supervisión del ingreso recurrente (MRR), volumen de almacenamiento SeaweedFS y consumo de inferencia AI.
          </p>
        </div>
      </header>

      {/* Métricas rápidas de Analítica */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">MRR Recurrente</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {formattedMrr}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Ingresos mensuales de suscripciones
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Inquilinos Activos</span>
            <Users className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {reports.kpis.activeTenants}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Comercios operando en celdas
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Almacenamiento Total</span>
            <HardDrive className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-400 font-mono">
            {reports.kpis.totalStorageMb} MB
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            SeaweedFS + imgproxy
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Tokens Consumidos</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-cyan-400 font-mono">
            {reports.kpis.totalTokensConsumed.toLocaleString()}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Bots + Asistencia AI
          </p>
        </div>
      </section>

      {/* Vista interactiva de gráficos y detalles */}
      <ReportsView initialData={reports} />
    </div>
  );
}
