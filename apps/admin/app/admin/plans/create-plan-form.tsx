"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";

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

      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formData.code,
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
      <Button
        type="button"
        variant="primary"
        onClick={() => setIsOpen(true)}
        className="min-h-[44px] text-sm"
      >
        <Plus className="h-4 w-4" />
        <span>Crear Plan Comercial / VIP</span>
      </Button>
    );
  }

  return (
    <Card className="p-5 shadow-lg transition-all animate-in fade-in duration-200">
      <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-[var(--dsn-accent)]" />
          <h2 className="text-base font-semibold text-[var(--dsn-text)]">
            Parametrización De Plan Comercial O VIP
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsOpen(false)}
          className="min-h-[44px] px-2 text-xs"
        >
          Cancelar
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-4">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Plan registrado exitosamente en el catálogo administrativo.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label
              htmlFor="plan-code"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Código Identificador Slug
            </Label>
            <Input
              id="plan-code"
              type="text"
              required
              placeholder="ej. custom-enterprise-vip"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="min-h-[44px] text-xs"
            />
          </div>

          <div>
            <Label
              htmlFor="plan-name-es"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Nombre Del Plan (Español)
            </Label>
            <Input
              id="plan-name-es"
              type="text"
              required
              placeholder="ej. Corporativo VIP"
              value={formData.nameEs}
              onChange={(e) => setFormData({ ...formData, nameEs: e.target.value })}
              className="min-h-[44px] text-xs"
            />
          </div>

          <div>
            <Label
              htmlFor="plan-name-en"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Nombre Del Plan (Inglés)
            </Label>
            <Input
              id="plan-name-en"
              type="text"
              placeholder="ej. Custom VIP Plan"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              className="min-h-[44px] text-xs"
            />
          </div>
        </div>

        <div>
          <Label
            htmlFor="plan-desc"
            className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
          >
            Descripción Comercial Del Plan
          </Label>
          <Textarea
            id="plan-desc"
            rows={2}
            placeholder="Describe las condiciones comerciales o el alcance del plan..."
            value={formData.descriptionEs}
            onChange={(e) => setFormData({ ...formData, descriptionEs: e.target.value })}
            className="text-xs"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <Label
              htmlFor="plan-currency"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Moneda Del Plan
            </Label>
            <Select
              id="plan-currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="min-h-[44px] text-xs"
            >
              <option value="COP">COP (Pesos Colombianos)</option>
              <option value="USD">USD (Dólares Americanos)</option>
            </Select>
          </div>

          <div>
            <Label
              htmlFor="plan-price"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Precio Mensual ({formData.currency})
            </Label>
            <Input
              id="plan-price"
              type="number"
              min="0"
              required
              value={formData.priceMonthlyCop}
              onChange={(e) => {
                const val = Number(e.target.value);
                setFormData({
                  ...formData,
                  priceMonthlyCop: val,
                  priceAnnualCop: val * 10, // Sugerencia automática 2 meses gratis
                });
              }}
              className="min-h-[44px] text-xs"
            />
          </div>

          <div>
            <Label
              htmlFor="plan-price-annual"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Precio Anual ({formData.currency})
            </Label>
            <Input
              id="plan-price-annual"
              type="number"
              min="0"
              required
              value={formData.priceAnnualCop}
              onChange={(e) => setFormData({ ...formData, priceAnnualCop: Number(e.target.value) })}
              className="min-h-[44px] text-xs"
            />
          </div>

          <div>
            <Label
              htmlFor="plan-trial"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Días De Prueba Gratuita
            </Label>
            <Input
              id="plan-trial"
              type="number"
              min="0"
              max="90"
              required
              value={formData.trialDays}
              onChange={(e) => setFormData({ ...formData, trialDays: Number(e.target.value) })}
              className="min-h-[44px] text-xs"
            />
          </div>
        </div>

        {/* Ciclos Habilitados y Estado */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3">
            <span className="block text-xs font-semibold text-[var(--dsn-text)] mb-2">
              Ciclos De Facturación Habilitados
            </span>
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                <Checkbox
                  checked={formData.cycleMonthly}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, cycleMonthly: checked === true })
                  }
                />
                <span>Ciclo Mensual</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                <Checkbox
                  checked={formData.cycleAnnual}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, cycleAnnual: checked === true })
                  }
                />
                <span>Ciclo Anual</span>
              </label>
            </div>
          </div>

          <div>
            <Label
              htmlFor="plan-status"
              className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
            >
              Estado Del Plan
            </Label>
            <Select
              id="plan-status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="min-h-[44px] text-xs"
            >
              <option value="active">Activo (Disponible Para Contratación)</option>
              <option value="draft">Borrador</option>
              <option value="retired">Retirado (Solo Renovación)</option>
            </Select>
          </div>
        </div>

        <div>
          <Label
            htmlFor="plan-features"
            className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
          >
            Características Incluidas (Separadas Por Coma)
          </Label>
          <Input
            id="plan-features"
            type="text"
            value={formData.featuresRaw}
            onChange={(e) => setFormData({ ...formData, featuresRaw: e.target.value })}
            className="min-h-[44px] text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)] min-h-[44px]">
            <Checkbox
              checked={formData.isPublic}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isPublic: checked === true })
              }
            />
            <span>Publicar En La Landing Page Pública</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)] min-h-[44px]">
            <Checkbox
              checked={formData.isPopular}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isPopular: checked === true })
              }
            />
            <span>Marcar Como Plan Más Popular</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsOpen(false)}
            className="min-h-[44px] text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            loading={loading}
            className="min-h-[44px] text-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Guardar Plan</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}

