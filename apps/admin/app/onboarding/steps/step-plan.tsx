"use client";

import React from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Layers, Loader2, Sparkles } from "lucide-react";
import type { TenantOnboardingStateDto } from "@mocter/domain";
import { formatStorageBytes } from "@/components/catalog-quota-banner";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export type OnboardingPlanItem = TenantOnboardingStateDto["availablePlans"][number];

export interface StepPlanProps {
  locale: AdminLocale;
  currency: string;
  plans: OnboardingPlanItem[];
  selectedPlanCode: string;
  cycle: "monthly" | "annual";
  loading: boolean;
  onSelectPlanCode: (code: string) => void;
  onChangeCycle: (cycle: "monthly" | "annual") => void;
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
    return `${currency} ${amount.toFixed(0)}`;
  }
}

/**
 * Paso 2 del onboarding: Selector comparativo de plan comercial, límites y frecuencia de cobro.
 */
export function StepPlan({
  locale,
  currency,
  plans,
  selectedPlanCode,
  cycle,
  loading,
  onSelectPlanCode,
  onChangeCycle,
  onBack,
  onSubmit,
}: StepPlanProps) {
  const dict = getAdminDictionary(locale).onboarding;
  const displayCurrency = currency === "USD" ? "USD" : "COP";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--dsn-text)]">{dict.step2Title}</h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--dsn-text-secondary)]">
              {dict.step2Subtitle}
            </p>
          </div>
        </div>

        {/* Selector de ciclo */}
        <div
          role="group"
          className="inline-flex self-start rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1"
        >
          <button
            type="button"
            onClick={() => onChangeCycle("monthly")}
            className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              cycle === "monthly"
                ? "bg-[var(--dsn-accent)] text-[var(--dsn-accent-fg)] shadow-xs"
                : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            {dict.step2CycleMonthly}
          </button>
          <button
            type="button"
            onClick={() => onChangeCycle("annual")}
            className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              cycle === "annual"
                ? "bg-[var(--dsn-accent)] text-[var(--dsn-accent-fg)] shadow-xs"
                : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            {dict.step2CycleAnnual}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = plan.code === selectedPlanCode;
          const localizedName =
            plan.names?.[locale] || plan.name || plan.code;
          const localizedDesc =
            plan.descriptions?.[locale] || plan.description || "";

          const rawCents =
            displayCurrency === "USD"
              ? cycle === "annual" && plan.priceAnnualUsdCents > 0
                ? plan.priceAnnualUsdCents
                : plan.priceMonthlyUsdCents > 0
                  ? plan.priceMonthlyUsdCents
                  : cycle === "annual"
                    ? plan.priceAnnualCents
                    : plan.priceMonthlyCents
              : cycle === "annual" && plan.priceAnnualCents > 0
                ? plan.priceAnnualCents
                : plan.priceMonthlyCents;

          const limits = plan.catalogLimits;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelectPlanCode(plan.code)}
              data-testid={`plan-card-${plan.code}`}
              className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                isSelected
                  ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 ring-1 ring-[var(--dsn-accent)]"
                  : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 hover:border-[var(--dsn-accent)]/50"
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-bold text-[var(--dsn-text)]">
                    {localizedName}
                  </span>
                  {isSelected && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--dsn-accent)]" />
                  )}
                </div>

                {plan.isPopular && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--dsn-accent)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--dsn-accent)]">
                    <Sparkles className="h-3 w-3" />
                    <span>{dict.step2PopularTag}</span>
                  </span>
                )}

                {localizedDesc && (
                  <p className="text-xs text-[var(--dsn-text-secondary)] leading-relaxed">
                    {localizedDesc}
                  </p>
                )}

                <div className="pt-1">
                  <span className="font-mono text-xl font-bold text-[var(--dsn-text)]">
                    {rawCents <= 0
                      ? dict.step2FreeLabel
                      : formatMoney(rawCents, displayCurrency, locale)}
                  </span>
                  {rawCents > 0 && (
                    <span className="ml-1 text-xs text-[var(--dsn-text-secondary)]">
                      / {cycle === "annual" ? dict.step2CycleAnnual.toLowerCase() : dict.step2CycleMonthly.toLowerCase()}
                    </span>
                  )}
                </div>

                {plan.trialDays > 0 && (
                  <p className="text-xs font-semibold text-emerald-500">
                    {plan.trialDays} {dict.step2TrialBadge}
                  </p>
                )}
              </div>

              {limits && (
                <dl className="mt-4 space-y-1.5 border-t border-[var(--dsn-border)]/70 pt-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--dsn-text-secondary)]">{dict.step2ProductsLabel}</dt>
                    <dd className="font-mono font-semibold text-[var(--dsn-text)]">
                      {limits.products.mode === "UNLIMITED"
                        ? dict.step2Unlimited
                        : limits.products.value ?? 0}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--dsn-text-secondary)]">{dict.step2ImagesLabel}</dt>
                    <dd className="font-mono font-semibold text-[var(--dsn-text)]">
                      {limits.imagesPerProduct.mode === "UNLIMITED"
                        ? dict.step2Unlimited
                        : limits.imagesPerProduct.value ?? 0}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[var(--dsn-text-secondary)]">{dict.step2StorageLabel}</dt>
                    <dd className="font-mono font-semibold text-[var(--dsn-text)]">
                      {limits.storageBytes.mode === "UNLIMITED"
                        ? dict.step2Unlimited
                        : formatStorageBytes(limits.storageBytes.value)}
                    </dd>
                  </div>
                </dl>
              )}
            </button>
          );
        })}
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
          disabled={loading || !selectedPlanCode}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-sm font-bold text-[var(--dsn-accent-fg)] shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{dict.savingLabel}</span>
            </>
          ) : (
            <>
              <span>{dict.step2SubmitCta}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
