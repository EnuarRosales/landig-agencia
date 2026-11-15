"use client";

import React from "react";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { TenantOnboardingStateDto, WorkspaceBillingDto } from "@mocter/domain";
import { BillingCheckoutPanel } from "@/components/billing-checkout-panel";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export type OnboardingPlanSummary = TenantOnboardingStateDto["availablePlans"][number];

export interface StepBillingProps {
  locale: AdminLocale;
  clientId: string;
  currency: string;
  selectedPlan: OnboardingPlanSummary | null;
  cycle: "monthly" | "annual";
  billingDetails: WorkspaceBillingDto | null;
  loading: boolean;
  onBack: () => void;
  onCompleteOnboarding: (mode: "trial" | "free" | "pending_payment_review" | "paid") => void;
}

/**
 * Paso 5 del onboarding: Activación del periodo de prueba, plan gratuito o pago inmediato vía checkout.
 */
export function StepBilling({
  locale,
  clientId,
  currency,
  selectedPlan,
  cycle,
  billingDetails,
  loading,
  onBack,
  onCompleteOnboarding,
}: StepBillingProps) {
  const dict = getAdminDictionary(locale).onboarding;
  const trialDays = Number(selectedPlan?.trialDays ?? 0);
  const priceCents = selectedPlan
    ? cycle === "annual" && selectedPlan.priceAnnualCents > 0
      ? selectedPlan.priceAnnualCents
      : selectedPlan.priceMonthlyCents
    : 0;
  const isFreePlan = priceCents <= 0 && trialDays <= 0;
  const hasTrial = trialDays > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--dsn-text)]">{dict.step5Title}</h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--dsn-text-secondary)]">
              {dict.step5Subtitle}
            </p>
          </div>
        </div>

        {/* Resumen del Plan + CTA de Prueba Gratis o Activación Directa */}
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
              {dict.step5SelectedPlanLabel}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-[var(--dsn-text)]">
                {selectedPlan?.names?.[locale] || selectedPlan?.name || "Plan"}
              </span>
              {hasTrial && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                  <Sparkles className="h-3 w-3" />
                  <span>
                    {trialDays} {dict.step2TrialBadge}
                  </span>
                </span>
              )}
            </div>
            {hasTrial && (
              <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.step5TrialNote}</p>
            )}
          </div>

          {(hasTrial || isFreePlan) && (
            <button
              type="button"
              disabled={loading}
              data-testid="step5-activate-trial-or-free-cta"
              onClick={() => onCompleteOnboarding(hasTrial ? "trial" : "free")}
              className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-sm font-bold text-[var(--dsn-accent-fg)] shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{dict.step5ActivatingLabel}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{hasTrial ? dict.step5StartTrialCta : dict.step5ActivateFreeCta}</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex justify-start">
          <button
            type="button"
            disabled={loading}
            onClick={onBack}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{dict.backCta}</span>
          </button>
        </div>
      </div>

      {/* Checkout Inmediato para Planes Pagos */}
      {priceCents > 0 && billingDetails && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold text-[var(--dsn-text-secondary)]">
            {dict.step5ImmediatePayHeading}
          </p>
          <BillingCheckoutPanel
            clientId={clientId}
            country={billingDetails.tenant?.country}
            currency={currency || billingDetails.tenant?.currency || billingDetails.plan.currency}
            customerEmail={billingDetails.tenant?.email}
            currentPlanId={selectedPlan?.id || billingDetails.plan.id}
            subscription={billingDetails.subscription}
            pendingBreBReport={billingDetails.pendingBreBReport}
            latestRejectedBreBReport={billingDetails.latestRejectedBreBReport}
            availablePlans={billingDetails.availablePlans || []}
            availableChannels={billingDetails.availableChannels || []}
            locale={locale}
            mode="onboarding"
            isOwner
            onSuccess={() => onCompleteOnboarding("pending_payment_review")}
          />
        </div>
      )}
    </div>
  );
}
