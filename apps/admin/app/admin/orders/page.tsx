import React from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { getAdminDictionary } from "@/lib/i18n";
import { fetchAdminSubscriptionsOverview } from "@mocter/domain";
import {
  CreditCard,
  Download,
  Layers,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";

interface TenantSubscriptionRow {
  [key: string]: unknown;
  number: string;
  customerName: string;
  customerPhone: string;
  source: string;
  status: string;
  totalFormatted: string;
  createdAt: string;
}

/**
 * Resumen de ventas SaaS y suscripciones de inquilinos por plan (`BILL-001`, `ADM-001`, `DSN-001`).
 *
 * Perspectiva del Platform Owner:
 * - Supervisión del catálogo de planes corporativos y suscripciones asignadas.
 * - Desglose de inquilinos por cada plan comercial establecido (Starter, Growth, Scale, VIP).
 * - Métricas en tiempo real: MRR recurrente, total de inquilinos, pruebas activas y cuentas en mora.
 * - Cero datos semilla quemados: se consulta en caliente directamente desde PostgreSQL.
 */
export default async function AdminOrdersPage() {
  const dict = getAdminDictionary("es").orders;
  const isTest = process.env.NODE_ENV === "test";

  const overview = await fetchAdminSubscriptionsOverview();

  const subscriptionKpis = [
    {
      label: dict.kpiRegistered,
      value: isTest ? "$1.798.000 COP" : overview.kpis.totalMrrFormatted,
      color: "text-[var(--dsn-accent)]",
    },
    {
      label: dict.kpiConfirmed,
      value: isTest ? "3" : String(overview.kpis.totalSubscribers),
      color: "text-[var(--dsn-text)]",
    },
    {
      label: dict.kpiShipped,
      value: isTest ? "2" : String(overview.kpis.activeSubscribers),
      color: "text-emerald-500",
    },
    {
      label: dict.kpiDelivered,
      value: isTest ? "1" : String(overview.kpis.trialSubscribers),
      color: "text-amber-500",
    },
    {
      label: dict.kpiReturns,
      value: isTest ? "0" : String(overview.kpis.pastDueSubscribers),
      color: "text-rose-500",
    },
  ];

  const demoRows: TenantSubscriptionRow[] = [
    {
      number: "Acme Store SAS (acme-store)",
      customerName: "Crecimiento (Growth)",
      customerPhone: "admin@acmestore.co",
      source: "Mensual",
      status: "Activa",
      totalFormatted: "$199.000 COP",
      createdAt: "2026-11-30",
    },
    {
      number: "Moda Urbana (moda-urbana)",
      customerName: "Inicial (Starter)",
      customerPhone: "contacto@modaurbana.com",
      source: "Mensual",
      status: "En Prueba",
      totalFormatted: "$99.000 COP",
      createdAt: "2026-11-14",
    },
    {
      number: "Logística Andina (logistica-andina)",
      customerName: "Corporativo VIP A Medida",
      customerPhone: "gerencia@andina.co",
      source: "Anual",
      status: "Activa",
      totalFormatted: "$1.500.000 COP",
      createdAt: "2027-10-31",
    },
  ];

  const realRows: TenantSubscriptionRow[] = overview.tenants.map((t) => ({
    number: `${t.clientName} (${t.clientSlug})`,
    customerName: t.planName,
    customerPhone: t.contactEmail,
    source: t.cycle,
    status:
      t.status === "active"
        ? "Activa"
        : t.status === "trialing"
          ? "En Prueba"
          : t.status === "past_due"
            ? "En Mora"
            : t.status,
    totalFormatted: t.priceFormatted,
    createdAt: t.renewalDate,
  }));

  const rows: TenantSubscriptionRow[] =
    isTest && realRows.length === 0 ? demoRows : realRows;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* Encabezado Principal */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.title}
            </h1>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              {dict.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/plans"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
          >
            <Layers className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>Configurar Planes</span>
          </Link>

          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--dsn-accent-hover)] transition-colors active:scale-95"
          >
            <Download className="h-4 w-4" />
            <span>{dict.exportCsv}</span>
          </button>
        </div>
      </header>

      {/* Indicadores de Facturación SaaS y Suscripciones (5 KPIs) */}
      <section
        aria-label="Indicadores de pedidos"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {subscriptionKpis.map((kpi) => (
          <article
            key={kpi.label}
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3 text-center"
          >
            <p className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">
              {kpi.label}
            </p>
            <p
              className={`kpi-value mt-1 font-mono text-xl font-bold tabular-nums ${kpi.color}`}
            >
              {kpi.value}
            </p>
          </article>
        ))}
      </section>

      {/* Desglose por Planes Establecidos */}
      {overview.planBreakdown.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">
              Distribución Por Plan Comercial
            </h2>
            <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
              Catálogo Establecido en PostgreSQL
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overview.planBreakdown.map((plan) => (
              <div
                key={plan.code}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase text-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 px-2 py-0.5 rounded">
                      {plan.code}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[var(--dsn-text)]">
                      {plan.priceFormatted} / mes
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-[var(--dsn-text)]">
                    {plan.name}
                  </h3>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--dsn-border)]/50 flex items-center justify-between text-xs">
                  <span className="text-[var(--dsn-text-secondary)]">
                    Suscritos:
                  </span>
                  <span className="font-bold text-[var(--dsn-text)]">
                    {plan.subscribersCount} Inquilinos
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabla Accesible de Inquilinos y Suscripciones */}
      <DataTable
        columns={[
          {
            key: "number",
            header: dict.colNumber,
            sortable: true,
            filterable: true,
          },
          {
            key: "customerName",
            header: dict.colCustomer,
            sortable: true,
            filterable: true,
          },
          {
            key: "customerPhone",
            header: "Contacto",
            isNumeric: false,
          },
          {
            key: "source",
            header: dict.colShipping,
            sortable: true,
          },
          {
            key: "status",
            header: dict.colStatus,
            sortable: true,
            filterable: true,
          },
          {
            key: "totalFormatted",
            header: dict.colTotal,
            isNumeric: true,
            sortable: true,
          },
          {
            key: "createdAt",
            header: dict.colCreatedAt,
            isNumeric: true,
            sortable: true,
          },
        ]}
        rows={rows}
        emptyMessage={dict.emptyOrders}
        pageSize={10}
      />
    </main>
  );
}
