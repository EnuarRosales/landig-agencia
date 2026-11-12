import React from "react";
import Link from "next/link";
import { fetchAdminChatwootOverview } from "@mocter/domain";
import {
  ShieldCheck,
  ExternalLink,
  Layers,
  Building2,
  CheckCircle2,
  AlertCircle,
  Radio,
  SlidersHorizontal,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface AdminConversationsPageProps {
  searchParams?: Promise<{ view?: string; accountId?: string }> | { view?: string; accountId?: string };
}

/**
 * Consola administrativa del plano de control SaaS para Chatwoot (CHW-002 T-08, D-06).
 * Exclusiva para platform_owner y platform_admin sobre la consola Super Admin de Chatwoot.
 */
export default async function AdminConversationsPage({
  searchParams,
}: AdminConversationsPageProps = {}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const currentView = resolvedParams?.view || "super_admin";
  const accountId = resolvedParams?.accountId?.trim();

  // 1. Resumen de indicadores del plano de control SaaS
  const { kpis } = await fetchAdminChatwootOverview();

  // 2. Determinación del targetPath en la consola Super Admin
  let targetPath = "/super_admin";
  let activeTab: "super_admin" | "accounts" | "account_detail" = "super_admin";

  if (accountId) {
    targetPath = `/super_admin/accounts/${accountId}`;
    activeTab = "account_detail";
  } else if (currentView === "accounts") {
    targetPath = "/super_admin/accounts";
    activeTab = "accounts";
  }

  const iframeSrc = `/api/auth/chatwoot/embed?scope=admin&targetPath=${encodeURIComponent(targetPath)}`;

  return (
    <main className="flex h-[calc(100dvh-65px)] flex-col space-y-4 p-4 md:p-6">
      {/* Encabezado del plano de gobierno SaaS */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400 border border-amber-500/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
                Consola De Infraestructura Y Super Admin
              </h1>
              <span className="rounded-md bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[10px] font-semibold border border-amber-500/20">
                Plano De Control SaaS
              </span>
            </div>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Supervisión de cuentas corporativas, cuotas de agentes, límites de buzones y gobernanza del cluster de Chatwoot.
            </p>
          </div>
        </div>

        {/* Selector de destino de infraestructura */}
        <div className="flex flex-wrap items-center gap-2.5">
          <nav
            aria-label="Vistas de gobierno Super Admin"
            className="inline-flex rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1"
          >
            <Link
              href="/admin/conversations?view=super_admin"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                activeTab === "super_admin"
                  ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                  : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Consola Global Super Admin</span>
            </Link>

            <Link
              href="/admin/conversations?view=accounts"
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                activeTab === "accounts"
                  ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                  : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Cuentas De Plataforma</span>
            </Link>

            {accountId && (
              <Link
                href={`/admin/conversations?accountId=${accountId}`}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === "account_detail"
                    ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                    : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Ficha De Cuenta {accountId}</span>
              </Link>
            )}
          </nav>

          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
          >
            <span>Abrir En Ventana Externa</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Tarjetas de telemetría y gobernanza SaaS */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Cuentas Activas</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-1 text-xl font-bold text-[var(--dsn-text)]">{kpis.activeAccounts}</p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)]">Sincronizadas y operativas</span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Pendientes O Con Fallo</span>
            <AlertCircle className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-1 text-xl font-bold text-[var(--dsn-text)]">{kpis.failedOrPendingAccounts}</p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)]">Requieren atención o reintento</span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Capacidades De Catálogo</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-1 text-xl font-bold text-[var(--dsn-text)]">{kpis.catalogCapabilitiesCount}</p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)]">Funciones gobernadas por plan</span>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">Webhooks De Plataforma</span>
            <Radio className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-1 text-xl font-bold text-[var(--dsn-text)]">Activo</p>
          <span className="text-[10px] text-[var(--dsn-text-secondary)]">Enlace bidireccional de eventos</span>
        </div>
      </section>

      {/* Contenedor del Iframe Super Admin conectado vía SSO */}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-inner">
        <iframe
          title="Consola Super Admin Chatwoot"
          src={iframeSrc}
          className="h-full w-full border-0"
          allow="camera; microphone; clipboard-read; clipboard-write; autoplay; keyboard-map"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </main>
  );
}
