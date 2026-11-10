"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Filter,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  PauseCircle,
  PlayCircle,
  Building2,
  Mail,
  CreditCard,
} from "lucide-react";
import type { SubscriptionDetail, BillingOverviewMetrics } from "@mocter/domain";

interface SubscriptionsTableProps {
  initialSubscriptions: SubscriptionDetail[];
  metrics: BillingOverviewMetrics;
}

export function SubscriptionsTable({ initialSubscriptions, metrics }: SubscriptionsTableProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeModal, setActiveModal] = useState<{
    type: "extend_trial" | "matias_profile";
    sub: SubscriptionDetail;
  } | null>(null);
  const [trialDaysInput, setTrialDaysInput] = useState(14);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const filteredSubs = initialSubscriptions.filter((sub) => {
    const matchesSearch =
      sub.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.clientSlug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.planCode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formattedMrr = (metrics.mrrCents / 100).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  async function handleAction(subscriptionId: string, action: "extend_trial" | "suspend" | "activate", days?: number) {
    setLoadingActionId(subscriptionId);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/billing/subscriptions/${subscriptionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days, actor: "platform_owner" }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Fallo al ejecutar la acción sobre la suscripción");
      }

      setFeedback({
        type: "success",
        message:
          action === "extend_trial"
            ? `Período de prueba extendido ${days || 14} días con éxito.`
            : action === "suspend"
            ? "Suscripción suspendida administrativamente."
            : "Suscripción reactivada con éxito.",
      });

      setActiveModal(null);
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error inesperado",
      });
    } finally {
      setLoadingActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tarjetas de Métricas SaaS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-xs text-[var(--dsn-text-secondary)]">MRR Estimado (Mensual)</span>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">{formattedMrr}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Ingresos recurrentes activos</p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-xs text-[var(--dsn-text-secondary)]">Suscripciones Activas</span>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">{metrics.activeCount}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Inquilinos en producción</p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-xs text-[var(--dsn-text-secondary)]">En Período De Prueba</span>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-accent)] font-mono">{metrics.trialingCount}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">En ventana de 14 días</p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <span className="text-xs text-[var(--dsn-text-secondary)]">Cobro Pendiente (Dunning)</span>
          <p className="mt-2 text-2xl font-bold text-amber-400 font-mono">{metrics.pastDueCount}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Reintentos automáticos</p>
        </div>
      </section>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--dsn-text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar por inquilino, slug o plan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[42px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] pl-9 pr-3 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)] focus:border-[var(--dsn-accent)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-[var(--dsn-text-secondary)] shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[42px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
          >
            <option value="all">Todos Los Estados</option>
            <option value="active">Activa</option>
            <option value="trialing">En Prueba (Trial)</option>
            <option value="past_due">Pago Pendiente</option>
            <option value="suspended">Suspendida</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Tabla de Suscripciones */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        {filteredSubs.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">No se encontraron suscripciones</h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
              Ajusta los filtros de búsqueda o registra nuevos inquilinos en el onboarding.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Inquilino</th>
                  <th className="py-3 px-4 font-semibold">Plan Y Ciclo</th>
                  <th className="py-3 px-4 font-semibold">Tarifa Recurrente</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Vencimiento / Trial</th>
                  <th className="py-3 px-4 font-semibold">Datos Fiscales</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {filteredSubs.map((sub) => {
                  const price =
                    sub.cycle === "annual"
                      ? sub.planPriceAnnualCents / 100
                      : sub.planPriceMonthlyCents / 100;
                  const formattedPrice = price.toLocaleString("es-CO", {
                    style: "currency",
                    currency: sub.currency || "COP",
                    maximumFractionDigits: 0,
                  });
                  const isLoading = loadingActionId === sub.id;

                  return (
                    <tr key={sub.id} className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[var(--dsn-text)]">{sub.clientName}</div>
                        <span className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">{sub.clientSlug}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[var(--dsn-text)]">
                          {sub.planName?.es || sub.planCode}
                        </div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] mt-0.5">
                          {sub.cycle === "annual" ? "Ciclo Anual" : "Ciclo Mensual"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-[var(--dsn-text)]">
                        {formattedPrice}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                            sub.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : sub.status === "trialing"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                              : sub.status === "past_due"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {sub.status === "trialing"
                            ? "En Prueba"
                            : sub.status === "active"
                            ? "Activa"
                            : sub.status === "past_due"
                            ? "Pago Pendiente"
                            : sub.status === "suspended"
                            ? "Suspendida"
                            : sub.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                        {sub.status === "trialing" && sub.trialEndsAt ? (
                          <div className="flex items-center gap-1 text-cyan-400">
                            <Clock className="h-3 w-3" />
                            <span>Fin trial: {new Date(sub.trialEndsAt).toLocaleDateString("es-CO")}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {sub.billingProfile ? (
                          <button
                            type="button"
                            onClick={() => setActiveModal({ type: "matias_profile", sub })}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--dsn-accent)] hover:underline"
                          >
                            <Building2 className="h-3 w-3" />
                            <span>{sub.billingProfile.companyName}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--dsn-text-secondary)] italic">
                            Sin datos fiscales
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => setActiveModal({ type: "extend_trial", sub })}
                            className="inline-flex items-center gap-1 rounded bg-[var(--dsn-surface-secondary)] hover:bg-[var(--dsn-accent)]/20 px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)] transition-colors border border-[var(--dsn-border)]"
                          >
                            <Clock className="h-3 w-3 text-cyan-400" />
                            <span>Extender Trial</span>
                          </button>

                          {sub.status === "suspended" ? (
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleAction(sub.id, "activate")}
                              className="inline-flex items-center gap-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold transition-colors"
                            >
                              <PlayCircle className="h-3 w-3" />
                              <span>Reactivar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleAction(sub.id, "suspend")}
                              className="inline-flex items-center gap-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 text-[11px] font-semibold transition-colors"
                            >
                              <PauseCircle className="h-3 w-3" />
                              <span>Suspender</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Extender Trial */}
      {activeModal && activeModal.type === "extend_trial" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
            <h3 className="text-base font-bold text-[var(--dsn-text)]">
              Extender Período De Prueba Gratuito
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
              Inquilino: <strong className="text-[var(--dsn-text)]">{activeModal.sub.clientName}</strong>
            </p>

            <div className="my-5">
              <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                Días De Extensión Adicionales
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={trialDaysInput}
                onChange={(e) => setTrialDaysInput(Number(e.target.value))}
                className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleAction(activeModal.sub.id, "extend_trial", trialDaysInput)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95"
              >
                <span>Aplicar Extensión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Datos Fiscales Matías API */}
      {activeModal && activeModal.type === "matias_profile" && activeModal.sub.billingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
              <h3 className="text-base font-bold text-[var(--dsn-text)]">
                Datos Fiscales (Estándar Matías API)
              </h3>
              <span className="text-[11px] font-mono text-[var(--dsn-accent)]">BILL-001 RF-04</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[var(--dsn-text-secondary)] block">Razón Social o Nombre Legal:</span>
                <span className="font-semibold text-[var(--dsn-text)] text-sm">{activeModal.sub.billingProfile.companyName}</span>
              </div>

              <div>
                <span className="text-[var(--dsn-text-secondary)] block">Número De Identificación Tributaria (DNI / NIT):</span>
                <span className="font-mono font-semibold text-[var(--dsn-text)]">{activeModal.sub.billingProfile.dni}</span>
              </div>

              <div>
                <span className="text-[var(--dsn-text-secondary)] block">Correo De Notificaciones Fiscales:</span>
                <span className="font-mono text-[var(--dsn-text)]">{activeModal.sub.billingProfile.email}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-lg bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

