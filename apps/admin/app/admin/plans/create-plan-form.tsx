"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface CreatePlanFormProps {
  onSuccess?: () => void;
}

/**
 * Formulario interactivo para registrar y parametrizar planes comerciales y VIP (ADM-001, DAT-001).
 *
 * Cumple con la directiva AGENTS.md §4.8:
 * Todos los labels utilizan formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 */
export function CreatePlanForm({ onSuccess }: CreatePlanFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    nameEs: "",
    nameEn: "",
    descriptionEs: "",
    priceMonthlyCop: 149000,
    trialDays: 14,
    isPublic: true,
    isPopular: false,
    status: "active",
    featuresRaw: "Atención con IA, Canal WhatsApp Cloud, Soporte estándar",
  });

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

      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formData.code,
          nameEs: formData.nameEs,
          nameEn: formData.nameEn || formData.nameEs,
          descriptionEs: formData.descriptionEs,
          priceMonthlyCop: Number(formData.priceMonthlyCop),
          trialDays: Number(formData.trialDays),
          isPublic: formData.isPublic,
          isPopular: formData.isPopular,
          status: formData.status,
          marketingFeaturesEs: features,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al registrar el plan comercial");
      }

      setSuccess(true);
      setFormData({
        code: "",
        nameEs: "",
        nameEn: "",
        descriptionEs: "",
        priceMonthlyCop: 149000,
        trialDays: 14,
        isPublic: true,
        isPopular: false,
        status: "active",
        featuresRaw: "Atención con IA, Canal WhatsApp Cloud, Soporte estándar",
      });
      router.refresh();
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95"
      >
        <Plus className="h-4 w-4" />
        <span>Crear Plan Comercial / VIP</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-lg transition-all animate-in fade-in duration-200">
      <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-[var(--dsn-accent)]" />
          <h2 className="text-base font-semibold text-[var(--dsn-text)]">
            Parametrización De Plan Comercial O VIP
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] min-h-[44px] px-2 flex items-center"
        >
          Cancelar
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
          <span>Plan registrado exitosamente en el catálogo administrativo.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="plan-code"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Código Identificador Slug
            </label>
            <input
              id="plan-code"
              type="text"
              required
              placeholder="ej. custom-enterprise-vip"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />
          </div>

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
              placeholder="ej. Corporativo VIP"
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
              placeholder="ej. Custom VIP Plan"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="plan-desc"
            className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
          >
            Descripción Comercial Del Plan
          </label>
          <textarea
            id="plan-desc"
            rows={2}
            placeholder="Describe las condiciones comerciales o el alcance del plan..."
            value={formData.descriptionEs}
            onChange={(e) => setFormData({ ...formData, descriptionEs: e.target.value })}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="plan-price"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Precio Mensual (COP)
            </label>
            <input
              id="plan-price"
              type="number"
              min="0"
              required
              value={formData.priceMonthlyCop}
              onChange={(e) => setFormData({ ...formData, priceMonthlyCop: Number(e.target.value) })}
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="plan-trial"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Días De Prueba Gratuita
            </label>
            <input
              id="plan-trial"
              type="number"
              min="0"
              max="90"
              required
              value={formData.trialDays}
              onChange={(e) => setFormData({ ...formData, trialDays: Number(e.target.value) })}
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
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
              <option value="active">Activo (Disponible Para Contratación)</option>
              <option value="draft">Borrador</option>
              <option value="retired">Retirado (Solo Renovación)</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="plan-features"
            className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
          >
            Características Incluidas (Separadas Por Coma)
          </label>
          <input
            id="plan-features"
            type="text"
            value={formData.featuresRaw}
            onChange={(e) => setFormData({ ...formData, featuresRaw: e.target.value })}
            className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)] min-h-[44px]">
            <input
              type="checkbox"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)]"
            />
            <span>Publicar En La Landing Page Pública</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)] min-h-[44px]">
            <input
              type="checkbox"
              checked={formData.isPopular}
              onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)]"
            />
            <span>Marcar Como Plan Más Popular</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--dsn-border)] text-xs text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--dsn-accent-hover)] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Guardar Plan</span>
          </button>
        </div>
      </form>
    </div>
  );
}

