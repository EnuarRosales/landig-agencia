"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Lock,
  Sparkles,
} from "lucide-react";
import type { Plan } from "@mocter/domain";

interface PlanModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plan?: Plan | null;
  onSuccess?: () => void;
}

/**
 * Diálogo modal estandarizado para la creación y edición de planes comerciales y VIP (BILL-001, ADM-001).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8:
 * - Todos los labels y encabezados están en formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 * - Comportamiento modal accesible con overlay, backdrop-blur y gestión de foco.
 */
export function PlanModalDialog({
  isOpen,
  onClose,
  plan,
  onSuccess,
}: PlanModalDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(plan);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    nameEs: "",
    nameEn: "",
    descriptionEs: "",
    currency: "COP",
    priceMonthlyCop: 149000,
    priceAnnualCop: 1490000,
    cycleMonthly: true,
    cycleAnnual: true,
    trialDays: 14,
    isPublic: true,
    isPopular: false,
    status: "active",
    featuresRaw: "Atención con IA, Canal WhatsApp Cloud, Soporte estándar",
  });

  useEffect(() => {
    if (plan) {
      const pName = plan.name as { es?: string; en?: string } | null;
      const pDesc = plan.description as { es?: string; en?: string } | null;
      const pFeat = plan.marketingFeatures as { es?: string[]; en?: string[] } | null;
      const cycles = Array.isArray(plan.billingCycles) ? plan.billingCycles : ["monthly", "annual"];

      setFormData({
        code: plan.code,
        nameEs: pName?.es || "",
        nameEn: pName?.en || "",
        descriptionEs: pDesc?.es || "",
        currency: plan.currency || "COP",
        priceMonthlyCop: Math.round(Number(plan.priceMonthlyCents || 0) / 100),
        priceAnnualCop: Math.round(Number(plan.priceAnnualCents || 0) / 100),
        cycleMonthly: cycles.includes("monthly"),
        cycleAnnual: cycles.includes("annual"),
        trialDays: plan.trialDays ?? 14,
        isPublic: Boolean(plan.isPublic),
        isPopular: Boolean(plan.isPopular),
        status: plan.status || "active",
        featuresRaw: (pFeat?.es || []).join(", "),
      });
    } else {
      setFormData({
        code: "",
        nameEs: "",
        nameEn: "",
        descriptionEs: "",
        currency: "COP",
        priceMonthlyCop: 149000,
        priceAnnualCop: 1490000,
        cycleMonthly: true,
        cycleAnnual: true,
        trialDays: 14,
        isPublic: true,
        isPopular: false,
        status: "active",
        featuresRaw: "Atención con IA, Canal WhatsApp Cloud, Soporte estándar",
      });
    }
    setError(null);
    setSuccess(false);
  }, [plan, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const features = formData.featuresRaw
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      const billingCycles = [
        formData.cycleMonthly ? "monthly" : null,
        formData.cycleAnnual ? "annual" : null,
      ].filter(Boolean);

      if (billingCycles.length === 0) {
        throw new Error("Debes habilitar al menos un ciclo de facturación (mensual o anual)");
      }

      const method = isEdit ? "PUT" : "POST";
      const payload: Record<string, unknown> = {
        nameEs: formData.nameEs,
        nameEn: formData.nameEn || formData.nameEs,
        descriptionEs: formData.descriptionEs,
        currency: formData.currency,
        priceMonthlyCop: Number(formData.priceMonthlyCop),
        priceAnnualCop: Number(formData.priceAnnualCop),
        billingCycles,
        trialDays: Number(formData.trialDays),
        isPublic: formData.isPublic,
        isPopular: formData.isPopular,
        status: formData.status,
        marketingFeaturesEs: features,
      };

      if (isEdit && plan) {
        payload.id = plan.id;
      } else {
        payload.code = formData.code;
      }

      const res = await fetch("/api/admin/plans", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al procesar el plan comercial");
      }

      setSuccess(true);
      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1000);
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
      aria-labelledby="plan-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-[var(--dsn-accent)]" />
            <h2 id="plan-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
              {isEdit ? "Editar Plan Comercial O VIP" : "Parametrización De Plan Comercial O VIP"}
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
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {isEdit
                ? "Plan comercial actualizado exitosamente."
                : "Plan comercial registrado exitosamente en el catálogo."}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="plan-code"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                Código Identificador Slug
              </label>
              <div className="relative">
                <input
                  id="plan-code"
                  type="text"
                  required
                  disabled={isEdit}
                  placeholder="ej. custom-enterprise-vip"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className={`w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono ${
                    isEdit ? "opacity-60 cursor-not-allowed pr-8" : ""
                  }`}
                />
                {isEdit && (
                  <Lock className="absolute right-2.5 top-3.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />
                )}
              </div>
              {isEdit && (
                <p className="text-[10px] text-[var(--dsn-text-secondary)] mt-1">
                  El slug es inmutable para proteger los enlaces públicos de registro.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="plan-currency"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                Moneda De Facturación
              </label>
              <select
                id="plan-currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
              >
                <option value="COP">COP · Peso Colombiano (Wompi)</option>
                <option value="USD">USD · Dólar Estadounidense (Stripe)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="plan-name-es"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                Nombre Del Plan (Español)
              </label>
              <input
                id="plan-name-es"
                type="text"
                required
                placeholder="ej. Crecimiento"
                value={formData.nameEs}
                onChange={(e) => setFormData({ ...formData, nameEs: e.target.value })}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="plan-name-en"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                Nombre Del Plan (Inglés)
              </label>
              <input
                id="plan-name-en"
                type="text"
                placeholder="ej. Growth"
                value={formData.nameEn}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="plan-desc-es"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Descripción Comercial
            </label>
            <textarea
              id="plan-desc-es"
              rows={2}
              placeholder="Descripción para la landing page o propuesta VIP..."
              value={formData.descriptionEs}
              onChange={(e) => setFormData({ ...formData, descriptionEs: e.target.value })}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />
          </div>

          {/* Sección de precios y ciclos */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 space-y-4">
            <h3 className="text-xs font-semibold text-[var(--dsn-text)]">
              Precios Y Ciclos Habilitados
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="plan-price-monthly"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Precio Ciclo Mensual ({formData.currency})
                </label>
                <input
                  id="plan-price-monthly"
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={formData.priceMonthlyCop}
                  onChange={(e) =>
                    setFormData({ ...formData, priceMonthlyCop: Number(e.target.value) })
                  }
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor="plan-price-annual"
                  className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                >
                  Precio Ciclo Anual ({formData.currency})
                </label>
                <input
                  id="plan-price-annual"
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={formData.priceAnnualCop}
                  onChange={(e) =>
                    setFormData({ ...formData, priceAnnualCop: Number(e.target.value) })
                  }
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)]">
                <input
                  type="checkbox"
                  checked={formData.cycleMonthly}
                  onChange={(e) =>
                    setFormData({ ...formData, cycleMonthly: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                />
                <span>Habilitar Ciclo Mensual</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)]">
                <input
                  type="checkbox"
                  checked={formData.cycleAnnual}
                  onChange={(e) =>
                    setFormData({ ...formData, cycleAnnual: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                />
                <span>Habilitar Ciclo Anual</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="plan-trial"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                Días De Prueba Gratuita (Trial)
              </label>
              <input
                id="plan-trial"
                type="number"
                min="0"
                max="90"
                required
                value={formData.trialDays}
                onChange={(e) =>
                  setFormData({ ...formData, trialDays: Number(e.target.value) })
                }
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="plan-status"
                className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
              >
                Estado Del Plan
              </label>
              <select
                id="plan-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
              >
                <option value="active">Activo (Disponible Para Suscripción)</option>
                <option value="draft">Borrador (Oculto Y En Configuración)</option>
                <option value="retired">Retirado (Deprecado Y Fuera De Venta)</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="plan-features"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Características De Marketing (Separadas Por Comas)
            </label>
            <input
              id="plan-features"
              type="text"
              placeholder="Atención con IA, Canal WhatsApp Cloud, Soporte estándar"
              value={formData.featuresRaw}
              onChange={(e) => setFormData({ ...formData, featuresRaw: e.target.value })}
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-[var(--dsn-border)]">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)]">
              <input
                type="checkbox"
                checked={formData.isPublic}
                onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
              />
              <span>Público En Landing Page</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)]">
              <input
                type="checkbox"
                checked={formData.isPopular}
                onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
              />
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                Destacar Como Popular
              </span>
            </label>
          </div>

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
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[var(--dsn-accent-hover)] disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isEdit ? "Guardar Cambios Del Plan" : "Crear Plan Comercial"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
