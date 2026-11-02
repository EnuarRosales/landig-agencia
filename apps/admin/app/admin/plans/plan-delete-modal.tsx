"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Trash2,
  Archive,
  Loader2,
  X,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import type { Plan } from "@mocter/domain";

interface PlanDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: (Plan & { activeTenantsCount?: number }) | null;
  onSuccess?: () => void;
}

/**
 * Diálogo modal para la confirmación contextual de eliminación o retiro de planes comerciales (BILL-001).
 *
 * Implementa la política híbrida de integridad referencial acordada en arquitectura:
 * - Si activeTenantsCount > 0: Aplica SOFT DELETE pasando a estado 'retired' para no quebrar suscripciones ni históricos.
 * - Si activeTenantsCount === 0: Aplica HARD DELETE físico definitivo en PostgreSQL.
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8 (Title Case) y §4.15 (sin siglas de spec visibles).
 */
export function PlanDeleteModal({
  isOpen,
  onClose,
  plan,
  onSuccess,
}: PlanDeleteModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !plan) return null;

  const planName = (plan.name as { es?: string })?.es || plan.code;
  const tenantsCount = plan.activeTenantsCount ?? 0;
  const willRetire = tenantsCount > 0;

  async function handleConfirmDelete() {
    if (!plan) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/admin/plans?id=${plan.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al procesar la eliminación del plan");
      }

      setSuccess(true);
      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-plan-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
          <div className="flex items-center gap-2">
            {willRetire ? (
              <Archive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <Trash2 className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            )}
            <h2 id="delete-plan-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
              {willRetire ? "Retiro De Plan Comercial" : "Eliminación De Plan Comercial"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] p-2 rounded-lg hover:bg-[var(--dsn-surface-secondary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3 text-xs text-rose-800 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {willRetire
                ? "Plan retirado y archivado exitosamente. Suscripciones existentes preservadas."
                : "Plan eliminado definitivamente de la base de datos."}
            </span>
          </div>
        )}

        <div className="space-y-4 text-xs text-[var(--dsn-text)]">
          <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[var(--dsn-text-secondary)]">Plan Seleccionado:</span>
              <span className="font-semibold text-[var(--dsn-text)]">{planName}</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[var(--dsn-text-secondary)]">Código Slug:</span>
              <span className="text-[var(--dsn-accent)]">{plan.code}</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[var(--dsn-text-secondary)]">Inquilinos Vinculados:</span>
              <span className="font-bold text-[var(--dsn-text)]">{tenantsCount}</span>
            </div>
          </div>

          {willRetire ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 p-3.5 text-amber-900 dark:text-amber-300">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Salvaguarda De Integridad Comercial
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200/90">
                  Este plan cuenta con <strong className="font-bold text-amber-950 dark:text-amber-100">{tenantsCount} inquilino(s)</strong> activo(s).
                  Para no invalidar suscripciones ni el histórico contable, el plan <strong className="font-bold text-amber-950 dark:text-amber-100">no se borrará físicamente</strong>,
                  sino que pasará a estado <strong className="font-bold text-amber-950 dark:text-amber-100">Retirado (retired)</strong>, ocultándose de la landing page y nuevos registros.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 p-3.5 text-rose-900 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1">
                <p className="font-semibold text-rose-900 dark:text-rose-200">
                  Eliminación Física Definitiva
                </p>
                <p className="text-[11px] leading-relaxed text-rose-800 dark:text-rose-200/90">
                  Este plan <strong className="font-bold text-rose-950 dark:text-rose-100">no tiene ningún inquilino vinculado</strong>. Se eliminará físicamente
                  de la base de datos de manera irreversible.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--dsn-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-[var(--dsn-border)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] min-h-[44px] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={loading}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50 ${
                willRetire
                  ? "bg-amber-600 hover:bg-amber-500"
                  : "bg-rose-600 hover:bg-rose-500"
              }`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {willRetire ? (
                <>
                  <Archive className="h-4 w-4" />
                  <span>Confirmar Y Retirar Plan</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Eliminar Plan Definitivamente</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

