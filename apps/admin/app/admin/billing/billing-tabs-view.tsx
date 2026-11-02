"use client";

import React, { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Layers,
  Users,
  CreditCard,
  FileText,
  Eye,
  Lock,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
} from "lucide-react";
import type {
  Plan,
  SubscriptionDetail,
  BillingOverviewMetrics,
  Invoice,
  PaymentReceipt,
  PaymentGatewayPublicView,
} from "@mocter/domain";
import { PlanModalDialog } from "../plans/plan-modal-dialog";
import { PlanDeleteModal } from "../plans/plan-delete-modal";
import { SubscriptionsTable } from "./subscriptions-table";
import { ReceiptsTable } from "./receipts-table";
import { GatewaysConfigForm } from "./gateways-config-form";

interface BillingTabsViewProps {
  initialTab?: string;
  plansList: (Plan & { activeTenantsCount?: number })[];
  overview: {
    metrics: BillingOverviewMetrics;
    subscriptions: SubscriptionDetail[];
    recentInvoices: Invoice[];
    recentReceipts: PaymentReceipt[];
  };
  gateways: PaymentGatewayPublicView[];
}

export function BillingTabsView({
  initialTab = "subscriptions",
  plansList,
  overview,
  gateways,
}: BillingTabsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>(tabParam || initialTab);

  // Estados de modales para CRUD completo de planes
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<(Plan & { activeTenantsCount?: number }) | null>(null);

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    router.replace(`/admin/billing?tab=${tab}`, { scroll: false });
  }

  const publicCount = plansList.filter((p) => p.isPublic).length;
  const privateCount = plansList.filter((p) => !p.isPublic).length;

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Encabezado Principal */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Facturación Y Planes SaaS
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              Platform Owner
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Gobernanza comercial integral, gestión de suscripciones, comprobantes contables y pasarelas duales (Wompi y Stripe).
          </p>
        </div>

        {activeTab === "plans" && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Crear Plan Comercial / VIP</span>
          </button>
        )}
      </header>

      {/* Selector de Pestañas HUD */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--dsn-border)] pb-2">
        <button
          type="button"
          onClick={() => handleTabChange("subscriptions")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "subscriptions"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Suscripciones De Inquilinos</span>
          <span
            className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
              activeTab === "subscriptions"
                ? "bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-bold"
                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            {overview.subscriptions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("plans")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "plans"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Catálogo De Planes</span>
          <span
            className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
              activeTab === "plans"
                ? "bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-bold"
                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            {plansList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("receipts")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "receipts"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Comprobantes E Invoices</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("gateways")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "gateways"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Pasarelas Wompi / Stripe</span>
        </button>
      </div>

      {/* Contenido de cada Pestaña */}
      {activeTab === "subscriptions" && (
        <SubscriptionsTable
          initialSubscriptions={overview.subscriptions}
          metrics={overview.metrics}
        />
      )}

      {activeTab === "plans" && (
        <div className="space-y-6">
          {/* Métricas rápidas de planes */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dsn-text-secondary)]">Planes Públicos En Landing</span>
                <Eye className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">{publicCount}</p>
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Visibles en la landing page</p>
            </div>

            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dsn-text-secondary)]">Planes Privados / VIP</span>
                <Lock className="h-4 w-4 text-purple-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-purple-400 font-mono">{privateCount}</p>
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Asignables por slug en onboarding</p>
            </div>

            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dsn-text-secondary)]">Pasarelas Vinculadas</span>
                <CreditCard className="h-4 w-4 text-[var(--dsn-accent)]" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--dsn-accent)] font-mono">Wompi + Stripe</p>
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Facturación dual en COP y USD</p>
            </div>
          </section>

          {/* Tabla de Catálogo de Planes */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--dsn-text)]">Inventario De Planes Comerciales</h2>
              <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
                {plansList.length} {plansList.length === 1 ? "plan" : "planes"}
              </span>
            </div>

            {plansList.length === 0 ? (
              <div className="p-12 text-center">
                <Layers className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-[var(--dsn-text)]">No hay planes configurados</h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
                  Registra los planes iniciales para permitir a los inquilinos suscribirse durante el onboarding o la landing page.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Código Slug</th>
                      <th className="py-3 px-4 font-semibold">Nombre Del Plan</th>
                      <th className="py-3 px-4 font-semibold">Precio Mensual</th>
                      <th className="py-3 px-4 font-semibold">Precio Anual</th>
                      <th className="py-3 px-4 font-semibold">Días De Prueba</th>
                      <th className="py-3 px-4 font-semibold">Visibilidad</th>
                      <th className="py-3 px-4 font-semibold">Inquilinos</th>
                      <th className="py-3 px-4 font-semibold">Estado</th>
                      <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--dsn-border)]">
                    {plansList.map((p) => {
                      const currency = p.currency || "COP";
                      const priceMonthly = (p.priceMonthlyCents / 100).toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 0,
                      });
                      const priceAnnual = (p.priceAnnualCents / 100).toLocaleString("es-CO", {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 0,
                      });

                      return (
                        <tr key={p.id} className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-medium text-[var(--dsn-accent)]">
                            {p.code}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[var(--dsn-text)]">{p.name.es}</span>
                              {p.isPopular && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-400 px-1.5 py-0.2 text-[10px] font-semibold border border-amber-500/20">
                                  <Sparkles className="h-3 w-3" /> Popular
                                </span>
                              )}
                            </div>
                            {p.name.en && (
                              <span className="text-[11px] text-[var(--dsn-text-secondary)] block">
                                {p.name.en}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)] font-semibold">
                            {priceMonthly}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)] font-semibold">
                            {priceAnnual}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)]">
                            {p.trialDays} días
                          </td>
                          <td className="py-3.5 px-4">
                            {p.isPublic ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-500/20">
                                <Eye className="h-3 w-3" /> Público (Landing)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-purple-400 border border-purple-500/20">
                                <Lock className="h-3 w-3" /> Privado / VIP
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs">
                            <span className="inline-flex items-center justify-center rounded-full bg-[var(--dsn-surface-secondary)] px-2.5 py-0.5 font-semibold text-[var(--dsn-text)] border border-[var(--dsn-border)]">
                              {p.activeTenantsCount ?? 0}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                p.status === "active"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : p.status === "retired"
                                  ? "bg-rose-500/10 text-rose-400"
                                  : "bg-zinc-500/10 text-zinc-400"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingPlan(p)}
                                className="inline-flex items-center gap-1 rounded border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors min-h-[32px]"
                                title="Editar plan comercial"
                              >
                                <Edit2 className="h-3 w-3 text-[var(--dsn-accent)]" />
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingPlan(p)}
                                className="inline-flex items-center gap-1 rounded border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/15 transition-colors min-h-[32px]"
                                title="Eliminar o retirar plan"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Eliminar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "receipts" && (
        <ReceiptsTable
          invoices={overview.recentInvoices}
          receipts={overview.recentReceipts}
        />
      )}

      {activeTab === "gateways" && (
        <GatewaysConfigForm initialGateways={gateways} />
      )}

      {/* Modales estandarizados para operaciones CRUD de Planes */}
      <PlanModalDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <PlanModalDialog
        isOpen={Boolean(editingPlan)}
        onClose={() => setEditingPlan(null)}
        plan={editingPlan}
      />

      <PlanDeleteModal
        isOpen={Boolean(deletingPlan)}
        onClose={() => setDeletingPlan(null)}
        plan={deletingPlan}
      />
    </div>
  );
}

