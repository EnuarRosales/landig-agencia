import React from "react";
import Link from "next/link";
import { getAdminDictionary } from "../lib/i18n";

/**
 * Dashboard principal y asistente rápido de `mocter-admin` (`DSN-001 T-06, T-07, T-08`, `ADM-001 T-07, T-29`).
 *
 * - Mobile First: 1 columna en móvil (390px) y grilla responsive en escritorio; drawer/menú hamburguesa que pasa a sidebar en escritorio.
 * - KPIs en fuente monoespaciada con `tabular-nums`.
 * - Formulario de producto con botón «Mejorar con AI» (`DSN-001 T-08`, `AI-001`).
 */
export default function AdminHomePage() {
  const dict = getAdminDictionary("es");

  const kpis = [
    { label: dict.dashboard.kpiRevenue, value: "$12.450.000 COP" },
    { label: dict.dashboard.kpiConversations, value: "148" },
    { label: dict.dashboard.kpiProducts, value: "24" },
    { label: dict.dashboard.kpiWebchatStatus, value: dict.dashboard.webchatActive },
  ];

  return (
    <div className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] md:flex">
      {/* Sidebar en escritorio / Drawer Mobile First */}
      <aside className="w-full border-b border-[var(--dsn-border)] bg-[var(--dsn-sidebar)] p-4 md:w-[260px] md:border-r md:border-b-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold tracking-tight">{dict.shell.brand}</span>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2 md:flex-col">
          <Link
            href="/admin/leads"
            className="min-h-[44px] flex items-center rounded px-3 py-2 text-sm hover:bg-[var(--dsn-surface-secondary)]"
          >
            {dict.shell.navLeads}
          </Link>
          <Link
            href="/admin/settings/notifications"
            className="min-h-[44px] flex items-center rounded px-3 py-2 text-sm hover:bg-[var(--dsn-surface-secondary)]"
          >
            {dict.shell.navNotifications}
          </Link>
          <Link
            href="/design-system"
            className="min-h-[44px] flex items-center rounded px-3 py-2 text-sm hover:bg-[var(--dsn-surface-secondary)]"
          >
            {dict.shell.navDesignSystem}
          </Link>
        </nav>
      </aside>

      <main className="flex-1 space-y-8 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
          <h1 className="text-xl font-semibold">{dict.dashboard.title}</h1>
          <button
            type="button"
            className="min-h-[44px] rounded-md bg-[var(--dsn-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dsn-accent-hover)]"
          >
            {dict.dashboard.primaryAction}
          </button>
        </header>

        {/* Grilla KPI Mobile First (1 columna en móvil, 4 en escritorio, cifras en mono tabular-nums) */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <article
              key={kpi.label}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4"
            >
              <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">{kpi.label}</p>
              <p className="kpi-value mt-2 font-mono text-2xl font-semibold tabular-nums">
                {kpi.value}
              </p>
            </article>
          ))}
        </section>

        {/* Creación rápida de producto con «Mejorar con AI» (DSN-001 T-08) */}
        <section className="max-w-[720px] space-y-4 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 md:p-6">
          <h2 className="text-base font-semibold">{dict.onboarding.title}</h2>
          <p className="text-sm text-[var(--dsn-text-secondary)]">{dict.onboarding.subtitle}</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text-secondary)]">
                {dict.onboarding.productNameLabel}
              </label>
              <input
                type="text"
                className="mt-1 min-h-[44px] w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-[var(--dsn-text-secondary)]">
                  {dict.onboarding.productDescLabel}
                </label>
                <button
                  type="button"
                  className="min-h-[44px] rounded px-2.5 py-1 text-xs font-medium text-[var(--dsn-accent)] hover:underline"
                >
                  ✨ {dict.onboarding.aiEnhanceButton}
                </button>
              </div>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3 text-sm"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
