"use client";

import React, { useMemo, useRef } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Package,
  TrendingUp,
} from "lucide-react";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import { CatalogQuotaBanner, type CatalogQuotaLimits } from "@/components/catalog-quota-banner";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { calculateProductProfitability } from "@/lib/pricing-margin";

export interface StepProductProps {
  locale: AdminLocale;
  currency: string;
  planName?: string;
  catalogLimits?: CatalogQuotaLimits | null;
  productName: string;
  productDescription: string;
  costPriceInput: string;
  salePriceInput: string;
  productKind: "physical" | "digital" | "service";
  coverPreviewUrl: string | null;
  uploadingCover: boolean;
  loading: boolean;
  onProductNameChange: (val: string) => void;
  onProductDescriptionChange: (val: string) => void;
  onCostPriceInputChange: (val: string) => void;
  onSalePriceInputChange: (val: string) => void;
  onProductKindChange: (val: "physical" | "digital" | "service") => void;
  onCoverFileSelect: (file: File) => void;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

function formatMoney(cents: number, currency: string, locale: AdminLocale): string {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "COP",
      maximumFractionDigits: currency === "COP" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Paso 3 del onboarding: Primer producto, costo/venta con utilidad calculada en vivo,
 * mejora AI en descripción y portada opcional.
 */
export function StepProduct({
  locale,
  currency,
  planName,
  catalogLimits,
  productName,
  productDescription,
  costPriceInput,
  salePriceInput,
  productKind,
  coverPreviewUrl,
  uploadingCover,
  loading,
  onProductNameChange,
  onProductDescriptionChange,
  onCostPriceInputChange,
  onSalePriceInputChange,
  onProductKindChange,
  onCoverFileSelect,
  onBack,
  onSubmit,
}: StepProductProps) {
  const dict = getAdminDictionary(locale).onboarding;
  const coverInputRef = useRef<HTMLInputElement>(null);

  const profitability = useMemo(() => {
    const costNum = Number(costPriceInput || 0);
    const saleNum = Number(salePriceInput || 0);
    const costCents = Number.isFinite(costNum) && costNum > 0 ? Math.round(costNum * 100) : 0;
    const saleCents = Number.isFinite(saleNum) && saleNum > 0 ? Math.round(saleNum * 100) : 0;
    return calculateProductProfitability(costCents, saleCents);
  }, [costPriceInput, salePriceInput]);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--dsn-text)]">{dict.step3Title}</h2>
          <p className="mt-1 text-xs sm:text-sm text-[var(--dsn-text-secondary)]">
            {dict.step3Subtitle}
          </p>
        </div>
      </div>

      {catalogLimits && (
        <CatalogQuotaBanner
          planName={planName}
          limits={catalogLimits}
          productsUsed={0}
          storageBytesUsed={0}
          compact
          locale={locale}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="onb-product-name"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step3NameLabel}
          </label>
          <input
            id="onb-product-name"
            type="text"
            required
            minLength={2}
            value={productName}
            onChange={(e) => onProductNameChange(e.target.value)}
            placeholder="Ej. Café Especial 500g"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>

        <div>
          <label
            htmlFor="onb-product-kind"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step3KindLabel}
          </label>
          <select
            id="onb-product-kind"
            value={productKind}
            onChange={(e) =>
              onProductKindChange(e.target.value as "physical" | "digital" | "service")
            }
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          >
            <option value="physical" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              {dict.step3KindPhysical}
            </option>
            <option value="digital" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              {dict.step3KindDigital}
            </option>
            <option value="service" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              {dict.step3KindService}
            </option>
          </select>
        </div>

        <div>
          <label
            htmlFor="onb-product-cost"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step3CostPriceLabel} ({currency})
          </label>
          <input
            id="onb-product-cost"
            type="number"
            min="0"
            step="any"
            value={costPriceInput}
            onChange={(e) => onCostPriceInputChange(e.target.value)}
            placeholder="0"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 font-mono text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>

        <div>
          <label
            htmlFor="onb-product-sale"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step3SalePriceLabel} ({currency})
          </label>
          <input
            id="onb-product-sale"
            type="number"
            required
            min="1"
            step="any"
            value={salePriceInput}
            onChange={(e) => onSalePriceInputChange(e.target.value)}
            placeholder="85000"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 font-mono text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Tarjeta de Rentabilidad En Vivo */}
      <div
        data-testid="product-profitability-card"
        className={`rounded-xl border p-4 space-y-3 ${
          profitability.isNegative
            ? "border-rose-500/40 bg-rose-500/10"
            : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--dsn-text)]">
            <TrendingUp
              className={`h-4 w-4 ${
                profitability.isNegative ? "text-rose-500" : "text-emerald-500"
              }`}
            />
            <span>{dict.step3ProfitTitle}</span>
          </div>
          {profitability.isNegative && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{dict.step3ProfitNegativeWarning}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3">
            <span className="block text-[var(--dsn-text-secondary)]">
              {dict.step3ProfitAmountLabel}
            </span>
            <span
              className={`mt-1 block font-mono text-sm font-bold ${
                profitability.isNegative ? "text-rose-500" : "text-emerald-500"
              }`}
            >
              {formatMoney(profitability.profitCents, currency, locale)}
            </span>
          </div>
          <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3">
            <span className="block text-[var(--dsn-text-secondary)]">
              {dict.step3ProfitMarginLabel}
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-[var(--dsn-text)]">
              {profitability.marginPct}%
            </span>
          </div>
          <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3">
            <span className="block text-[var(--dsn-text-secondary)]">
              {dict.step3ProfitMarkupLabel}
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-[var(--dsn-text)]">
              {profitability.markupPct !== null ? `${profitability.markupPct}%` : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Descripción con Mejorar Con AI */}
      <AiEnhanceTextarea
        id="onb-product-description"
        fieldKey="product.description"
        label={dict.step3DescriptionLabel}
        value={productDescription}
        fallbackDraft={productName}
        onChange={onProductDescriptionChange}
        required
        rows={4}
        locale={locale}
        placeholder="Describe beneficios clave, presentación, garantía y detalles para tus clientes."
      />

      {/* Portada Opcional */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {coverPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverPreviewUrl}
              alt={productName || dict.step3CoverLabel}
              className="h-14 w-14 rounded-xl border border-[var(--dsn-border)] object-cover shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.step3CoverLabel}</p>
            <p className="text-xs text-[var(--dsn-text-secondary)]">PNG, JPG o WEBP · Máx. 5 MB</p>
          </div>
        </div>

        <div>
          <button
            type="button"
            disabled={uploadingCover || loading}
            onClick={() => coverInputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
          >
            {uploadingCover ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4 text-[var(--dsn-accent)]" />
            )}
            <span>{coverPreviewUrl ? dict.step3CoverChangeCta : dict.step3CoverSelectCta}</span>
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) onCoverFileSelect(selected);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-[var(--dsn-border)] pt-4 sm:flex-row sm:justify-between">
        <button
          type="button"
          disabled={loading}
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-5 py-2.5 text-sm font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{dict.backCta}</span>
        </button>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-sm font-bold text-[var(--dsn-accent-fg)] shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{dict.savingLabel}</span>
            </>
          ) : (
            <>
              <span>{dict.step3SubmitCta}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
