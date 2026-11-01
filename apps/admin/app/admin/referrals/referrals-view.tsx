"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gift,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Coins,
  Clock,
  PlayCircle,
  PauseCircle,
  Sliders,
} from "lucide-react";
import type { AdminReferralProgramOverviewDto } from "@mocter/domain";

interface ReferralsViewProps {
  initialData: AdminReferralProgramOverviewDto;
}

/**
 * Consola administrativa para la gobernanza del programa de referidos (REF-001).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8:
 * Todos los labels utilizan formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 */
export function ReferralsView({ initialData }: ReferralsViewProps) {
  const router = useRouter();
  const [program, setProgram] = useState(initialData.program);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [form, setForm] = useState({
    rewardType: program.rewardType,
    rewardValue: Math.round(program.rewardValue / 100), // En pesos COP o porcentaje
    attributionDays: program.attributionDays,
    creditValidityDays: program.creditValidityDays,
  });

  async function handleToggleStatus() {
    setLoading(true);
    setFeedback(null);
    const nextStatus = program.status === "active" ? "paused" : "active";

    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          status: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al cambiar estado del programa");
      }

      setProgram({ ...program, status: nextStatus });
      setFeedback({
        type: "success",
        message: `Programa de referidos ${nextStatus === "active" ? "activado" : "pausado"} con éxito.`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const rewardValueCents =
        form.rewardType === "fixed" ? Number(form.rewardValue) * 100 : Number(form.rewardValue);

      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          rewardType: form.rewardType,
          rewardValue: rewardValueCents,
          attributionDays: Number(form.attributionDays),
          creditValidityDays: Number(form.creditValidityDays),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al actualizar parámetros");
      }

      setFeedback({ type: "success", message: "Parámetros comerciales de referidos guardados." });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  const formattedIssued = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(initialData.metrics.totalRewardsIssuedCents / 100);

  const formattedRedeemed = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(initialData.metrics.totalCreditsRedeemedCents / 100);

  return (
    <div className="space-y-6">
      {/* HUD de Estado y Control del Programa */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2.5 text-[var(--dsn-accent)]">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--dsn-text)]">{program.name}</h2>
              {program.status === "active" ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                  Activo
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                  Pausado
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Modelo A (Créditos Unilaterales aplicados a la próxima factura de suscripción).
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={handleToggleStatus}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-opacity disabled:opacity-50 ${
            program.status === "active"
              ? "bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              : "bg-emerald-500 text-black hover:opacity-90"
          }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : program.status === "active" ? (
            <PauseCircle className="h-4 w-4" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          <span>{program.status === "active" ? "Pausar Programa" : "Activar Programa"}</span>
        </button>
      </section>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Métricas del programa */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Total Invitaciones</span>
            <Users className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {initialData.metrics.totalReferrals}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Registros con código de afiliado
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Referidos Calificados</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {initialData.metrics.qualifiedCount}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Comercios con primera factura paga
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Créditos Emitidos</span>
            <Coins className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-cyan-400 font-mono">
            {formattedIssued}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Recompensas acumuladas por comercios
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Créditos Redimidos</span>
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-purple-400 font-mono">
            {formattedRedeemed}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Descontados en renovaciones SaaS
          </p>
        </div>
      </section>

      {/* Formulario de Configuración Comercial */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs max-w-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3 mb-5">
          <Sliders className="h-4 w-4 text-[var(--dsn-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
            Parámetros Comerciales Del Programa
          </h3>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Tipo De Recompensa
              </label>
              <select
                value={form.rewardType}
                onChange={(e) => setForm({ ...form, rewardType: e.target.value })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
              >
                <option value="fixed">Monto Fijo En Créditos (COP)</option>
                <option value="percent">Porcentaje Del Pago Inicial (%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Valor De La Recompensa {form.rewardType === "fixed" ? "(COP)" : "(%)"}
              </label>
              <input
                type="number"
                min="1"
                required
                value={form.rewardValue}
                onChange={(e) => setForm({ ...form, rewardValue: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Ventana De Atribución (Días)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                required
                value={form.attributionDays}
                onChange={(e) => setForm({ ...form, attributionDays: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                Plazo máximo desde el registro hasta el primer pago (60 días default).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Vigencia Del Crédito (Días)
              </label>
              <input
                type="number"
                min="30"
                max="730"
                required
                value={form.creditValidityDays}
                onChange={(e) => setForm({ ...form, creditValidityDays: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                Vigencia para redimir el saldo en facturación (365 días default).
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--dsn-border)]">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Guardar Parámetros Comerciales</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
