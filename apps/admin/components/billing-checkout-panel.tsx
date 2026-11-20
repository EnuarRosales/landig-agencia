"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileUp,
  Loader2,
  QrCode,
  ShieldAlert,
  Upload,
} from "lucide-react";
import type { CheckoutSessionResponse, WorkspaceBillingDto } from "@mocter/domain";
import { Alert, AlertDescription, Badge, Button, Checkbox, Input, Label } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export type BillingPlanOption = NonNullable<WorkspaceBillingDto["availablePlans"]>[number];
export type BillingChannelOption = NonNullable<WorkspaceBillingDto["availableChannels"]>[number];

export interface BillingCheckoutPanelProps {
  clientId: string;
  country?: string;
  currency: string;
  customerEmail?: string;
  currentPlanId: string;
  subscription?: WorkspaceBillingDto["subscription"];
  pendingBreBReport?: WorkspaceBillingDto["pendingBreBReport"];
  latestRejectedBreBReport?: WorkspaceBillingDto["latestRejectedBreBReport"];
  availablePlans: BillingPlanOption[];
  availableChannels: BillingChannelOption[];
  availableReferralCreditCents?: number;
  referralCreditCurrency?: "COP" | "USD";
  locale?: AdminLocale;
  mode: "workspace" | "onboarding";
  isOwner?: boolean;
  onSuccess?: () => void;
}

function formatPriceCents(cents: number, currency: string, locale: AdminLocale): string {
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
 * Panel reutilizable de activación de prueba, selección de plan y checkout SaaS
 * (incluyendo QR dinámico y reporte de comprobante Bre-B) para Onboarding y `/workspace/billing`.
 */
export function BillingCheckoutPanel({
  clientId,
  country,
  currency,
  customerEmail,
  currentPlanId,
  subscription,
  pendingBreBReport,
  latestRejectedBreBReport,
  availablePlans,
  availableChannels,
  availableReferralCreditCents = 0,
  referralCreditCurrency,
  locale = "es",
  mode,
  isOwner = true,
  onSuccess,
}: BillingCheckoutPanelProps) {
  const dict = getAdminDictionary(locale).workspace;

  const initialCycle: "monthly" | "annual" =
    subscription?.cycle === "annual" ? "annual" : "monthly";
  const initialPlanId =
    availablePlans.find((p) => p.id === currentPlanId)?.id || availablePlans[0]?.id || currentPlanId;
  const initialChannelId = availableChannels[0]?.id || "";

  const [cycle, setCycle] = useState<"monthly" | "annual">(initialCycle);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(initialPlanId);
  const [selectedGateway, setSelectedGateway] = useState<string>(initialChannelId);
  const [applyReferralCredits, setApplyReferralCredits] = useState<boolean>(true);
  const [pendingReport, setPendingReport] = useState<WorkspaceBillingDto["pendingBreBReport"]>(
    pendingBreBReport ?? null,
  );
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSessionResponse | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const voucherInputRef = React.useRef<HTMLInputElement>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => availablePlans.find((p) => p.id === selectedPlanId) || availablePlans[0] || null,
    [availablePlans, selectedPlanId],
  );

  const selectedChannel = useMemo(
    () => availableChannels.find((c) => c.id === selectedGateway) || availableChannels[0] || null,
    [availableChannels, selectedGateway],
  );

  const selectedAmountCents = useMemo(() => {
    if (!selectedPlan) return 0;
    return cycle === "annual" && selectedPlan.priceAnnualCents > 0
      ? selectedPlan.priceAnnualCents
      : selectedPlan.priceMonthlyCents;
  }, [selectedPlan, cycle]);

  const effectiveCurrency: "COP" | "USD" =
    selectedPlan?.currency === "USD" || currency === "USD" ? "USD" : "COP";

  const applicableReferralCreditCents = useMemo(() => {
    if (!applyReferralCredits || availableReferralCreditCents <= 0 || selectedAmountCents <= 0) {
      return 0;
    }
    const creditCurr = referralCreditCurrency || effectiveCurrency;
    if (creditCurr !== effectiveCurrency) {
      return 0;
    }
    return Math.min(availableReferralCreditCents, selectedAmountCents);
  }, [
    applyReferralCredits,
    availableReferralCreditCents,
    selectedAmountCents,
    referralCreditCurrency,
    effectiveCurrency,
  ]);

  const netPayableCents = Math.max(0, selectedAmountCents - applicableReferralCreditCents);
  const isCoveredFullyByCredits =
    selectedAmountCents > 0 && applicableReferralCreditCents > 0 && netPayableCents === 0;

  const operationKind: "new_subscription" | "renewal" | "upgrade" = useMemo(() => {
    if (mode === "onboarding" || !subscription) return "new_subscription";
    if (selectedPlan && selectedPlan.id === currentPlanId) return "renewal";
    return "upgrade";
  }, [mode, subscription, selectedPlan, currentPlanId]);

  async function handleCreateCheckout() {
    if (!selectedPlan || selectedAmountCents <= 0 || !isOwner) return;
    if (!isCoveredFullyByCredits && !selectedChannel) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setCheckoutLoading(true);

    try {
      const payloadCurrency: "COP" | "USD" =
        selectedChannel && (selectedChannel.id === "bre_b" || selectedChannel.id === "wompi")
          ? "COP"
          : effectiveCurrency;

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId || undefined,
          planId: selectedPlan.id,
          planCode: selectedPlan.code,
          amountCents: selectedAmountCents,
          currency: payloadCurrency,
          cycle,
          gateway: selectedChannel?.id,
          operationKind,
          applyReferralCredits,
          customerEmail: customerEmail || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.detail || json.error || "No se pudo generar la orden de pago.");
      }
      const sessionData = json.data as CheckoutSessionResponse;
      setCheckoutSession(sessionData);
      if (sessionData.gateway === "referral_credit") {
        setSuccessMsg(
          `${dict.billingPaidWithCreditsSuccessTitle} (${sessionData.receiptNumber}). ${dict.billingPaidWithCreditsSuccessDesc}`,
        );
        onSuccess?.();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleCopyBreBKey(keyValue: string) {
    try {
      await navigator.clipboard?.writeText(keyValue);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      setCopiedKey(false);
    }
  }

  async function handleSubmitBreBReport(e: React.FormEvent) {
    e.preventDefault();
    if (!checkoutSession || checkoutSession.gateway !== "bre_b" || !selectedPlan || !voucherFile) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setReportLoading(true);

    try {
      const formData = new FormData();
      formData.append("invoiceId", checkoutSession.invoiceId);
      formData.append("targetPlanId", selectedPlan.id);
      formData.append("targetCycle", cycle);
      formData.append("operationKind", operationKind);
      formData.append("reportedAmountCents", String(checkoutSession.amountCents));
      if (paymentReference.trim()) {
        formData.append("paymentReference", paymentReference.trim());
      }
      formData.append("voucher", voucherFile);

      const res = await fetch("/api/tenant/billing/bre-b/report", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo registrar el comprobante.");
      }

      setPendingReport({
        id: json.data?.id || checkoutSession.invoiceId,
        invoiceId: checkoutSession.invoiceId,
        targetPlanId: selectedPlan.id,
        targetCycle: cycle,
        operationKind,
        reportedAmountCents: checkoutSession.amountCents,
        expectedAmountCents: checkoutSession.amountCents,
        paymentReference: paymentReference.trim() || null,
        status: "pending_review",
        createdAt: new Date().toISOString(),
      });
      setCheckoutSession(null);
      setVoucherFile(null);
      setPaymentReference("");
      setSuccessMsg(dict.billingBreBSubmittedSuccess);
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <section
      id="plan-checkout-section"
      data-testid="billing-checkout-panel"
      className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--dsn-border)] pb-4">
        <div>
          <h2 className="text-base font-bold text-[var(--dsn-text)]">
            {mode === "onboarding" ? dict.billingCheckoutOnboardingTitle : dict.billingSelectPlanTitle}
          </h2>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">
            {mode === "onboarding"
              ? dict.billingCheckoutOnboardingSubtitle
              : dict.billingSelectPlanSubtitle}
          </p>
        </div>

        {/* Selector De Ciclo */}
        <div
          role="group"
          aria-label={dict.billingCycleLabel}
          className="inline-flex rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1 self-start sm:self-auto"
        >
          <Button
            type="button"
            size="sm"
            variant={cycle === "monthly" ? "primary" : "ghost"}
            onClick={() => {
              setCycle("monthly");
              setCheckoutSession(null);
            }}
          >
            {dict.billingCycleMonthly}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={cycle === "annual" ? "primary" : "ghost"}
            onClick={() => {
              setCycle("annual");
              setCheckoutSession(null);
            }}
          >
            {dict.billingCycleAnnual}
          </Button>
        </div>
      </div>

      {/* Estado de Verificación Manual Bre-B en Curso */}
      {pendingReport && (
        <Alert variant="warning" data-testid="breb-pending-banner" className="p-4">
          <Clock className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-amber-500">{dict.billingPendingBannerTitle}</p>
            <p className="text-[var(--dsn-text)]">{dict.billingPendingBannerDesc}</p>
            <p className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
              {formatPriceCents(pendingReport.reportedAmountCents, "COP", locale)}
              {pendingReport.paymentReference ? ` · Ref: ${pendingReport.paymentReference}` : ""}
            </p>
          </div>
        </Alert>
      )}

      {/* Alerta de Rechazo Previo */}
      {!pendingReport && latestRejectedBreBReport && (
        <Alert variant="error" data-testid="breb-rejected-banner" className="p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-rose-500">{dict.billingRejectedBannerTitle}</p>
            {latestRejectedBreBReport.rejectionReason && (
              <p className="text-[var(--dsn-text)]">{latestRejectedBreBReport.rejectionReason}</p>
            )}
            <p className="text-[var(--dsn-text-secondary)]">{dict.billingRejectedBannerHint}</p>
          </div>
        </Alert>
      )}

      {!isOwner && (
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text-secondary)]">
          {dict.billingOwnerOnlyHint}
        </div>
      )}

      {errorMsg && (
        <Alert variant="error" role="alert">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" role="status">
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      {/* Planes Disponibles */}
      {availablePlans.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {availablePlans.map((plan) => {
            const isSelected = selectedPlan?.id === plan.id;
            const isCurrent = plan.id === currentPlanId;
            const priceCents =
              cycle === "annual" && plan.priceAnnualCents > 0
                ? plan.priceAnnualCents
                : plan.priceMonthlyCents;

            return (
              <button
                key={plan.id}
                type="button"
                disabled={!isOwner || Boolean(pendingReport)}
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setCheckoutSession(null);
                  setErrorMsg(null);
                }}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all disabled:opacity-60 ${
                  isSelected
                    ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 ring-1 ring-[var(--dsn-accent)]"
                    : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 hover:border-[var(--dsn-accent)]/50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[var(--dsn-text)]">{plan.name}</span>
                    {isCurrent && (
                      <Badge variant="success" className="text-[10px]">
                        {dict.billingCurrentPlanTag}
                      </Badge>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-1.5 text-xs text-[var(--dsn-text-secondary)] line-clamp-2">
                      {plan.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-baseline justify-between border-t border-[var(--dsn-border)]/60 pt-3">
                  <span className="font-mono text-base font-bold text-[var(--dsn-text)]">
                    {priceCents === 0
                      ? locale === "en"
                        ? "Free"
                        : "Gratuito"
                      : formatPriceCents(priceCents, plan.currency, locale)}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--dsn-accent)]">
                    {isCurrent ? dict.billingRenewAction : dict.billingSwitchPlanAction}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Toggle de Créditos de Referidos FEFO y Desglose Neto (SPEC-16 D-02) */}
      {!pendingReport && selectedAmountCents > 0 && availableReferralCreditCents > 0 && (
        <div
          data-testid="referral-credit-checkout-box"
          className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-4 space-y-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor="apply-referral-credits-toggle"
              className="flex items-start gap-2.5 cursor-pointer text-xs"
            >
              <Checkbox
                id="apply-referral-credits-toggle"
                checked={applyReferralCredits}
                disabled={!isOwner}
                onCheckedChange={(checked) => {
                  setApplyReferralCredits(checked === true);
                  setCheckoutSession(null);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="block font-bold text-[var(--dsn-text)]">
                  {dict.billingApplyReferralCreditsLabel}
                </span>
                <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                  {dict.billingApplyReferralCreditsDesc}
                </span>
              </span>
            </label>
            <span className="font-mono text-xs font-bold text-emerald-500 shrink-0">
              {formatPriceCents(
                availableReferralCreditCents,
                referralCreditCurrency || effectiveCurrency,
                locale,
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 border-t border-emerald-500/20 pt-3 text-xs sm:grid-cols-3">
            <div className="flex items-center justify-between sm:block">
              <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                {dict.billingSubtotalLabel}
              </span>
              <p className="font-mono font-semibold text-[var(--dsn-text)]">
                {formatPriceCents(selectedAmountCents, effectiveCurrency, locale)}
              </p>
            </div>
            <div className="flex items-center justify-between sm:block">
              <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                {dict.billingReferralCreditDiscountLabel}
              </span>
              <p className="font-mono font-semibold text-emerald-500">
                -{formatPriceCents(applicableReferralCreditCents, effectiveCurrency, locale)}
              </p>
            </div>
            <div className="flex items-center justify-between sm:block">
              <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                {dict.billingNetPayableLabel}
              </span>
              <p
                data-testid="billing-net-payable-amount"
                className="font-mono font-bold text-[var(--dsn-text)]"
              >
                {formatPriceCents(netPayableCents, effectiveCurrency, locale)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selector De Canales Y Botón De Checkout */}
      {!pendingReport && selectedAmountCents > 0 && (
        <div className="space-y-4">
          {!isCoveredFullyByCredits && (
            <div>
              <p className="text-xs font-semibold text-[var(--dsn-text)] mb-2">
                {dict.billingChannelsTitle}
                {country ? ` (${country})` : ""}
              </p>

              {availableChannels.length === 0 ? (
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-4 text-xs">
                  <p className="font-semibold text-[var(--dsn-text)]">{dict.billingNoChannelsTitle}</p>
                  <p className="mt-1 text-[var(--dsn-text-secondary)]">{dict.billingNoChannelsDesc}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {availableChannels.map((channel) => {
                    const active = selectedChannel?.id === channel.id;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        disabled={!isOwner}
                        onClick={() => {
                          setSelectedGateway(channel.id);
                          setCheckoutSession(null);
                          setErrorMsg(null);
                        }}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10"
                            : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 hover:border-[var(--dsn-accent)]/40"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {channel.id === "bre_b" ? (
                            <QrCode className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
                          ) : (
                            <CreditCard className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
                          )}
                          <div>
                            <p className="text-xs font-semibold text-[var(--dsn-text)]">
                              {channel.displayName}
                            </p>
                            <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                              {channel.currency}
                            </p>
                          </div>
                        </div>
                        {active && <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(isCoveredFullyByCredits || availableChannels.length > 0) && !checkoutSession && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="lg"
                disabled={!isOwner || (!isCoveredFullyByCredits && !selectedChannel)}
                loading={checkoutLoading}
                loadingText={dict.billingGeneratingOrder}
                onClick={handleCreateCheckout}
                className="rounded-xl font-bold"
              >
                {isCoveredFullyByCredits
                  ? dict.billingPayWithCreditsCta
                  : dict.billingProceedPayment}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Resultado De Orden Generada: Wompi */}
      {checkoutSession?.gateway === "wompi" && (
        <div className="rounded-xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-surface-secondary)] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs space-y-1">
            <p className="font-bold text-[var(--dsn-text)]">{checkoutSession.invoiceNumber}</p>
            <p className="font-mono text-[var(--dsn-text-secondary)]">
              {formatPriceCents(checkoutSession.amountCents, "COP", locale)}
            </p>
          </div>
          <a
            href={checkoutSession.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <span>{dict.billingOpenGatewayCta}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {/* Resultado De Orden Generada: Stripe */}
      {checkoutSession?.gateway === "stripe" && (
        <div className="rounded-xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-surface-secondary)] p-4 text-xs space-y-1">
          <p className="font-bold text-[var(--dsn-text)]">{checkoutSession.invoiceNumber}</p>
          <p className="font-mono text-[var(--dsn-text-secondary)]">
            Ref: {checkoutSession.reference} · {formatPriceCents(checkoutSession.amountCents, "USD", locale)}
          </p>
        </div>
      )}

      {/* Resultado De Orden Generada: QR Dinámico Bre-B + Carga De Comprobante */}
      {checkoutSession?.gateway === "bre_b" && (
        <div
          data-testid="breb-qr-checkout-card"
          className="rounded-2xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-surface-secondary)]/60 p-5 space-y-5"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex shrink-0 flex-col items-center rounded-xl bg-white p-3 shadow-xs border border-slate-200 self-center md:self-start">
              <img
                src={checkoutSession.qrSvgDataUrl}
                alt={dict.billingBreBTitle}
                className="h-44 w-44 object-contain"
              />
              <span className="mt-2 font-mono text-xs font-bold text-slate-900">
                {checkoutSession.amountFormattedCop}
              </span>
            </div>

            <div className="flex-1 space-y-3 text-xs">
              <div>
                <h3 className="text-sm font-bold text-[var(--dsn-text)]">{dict.billingBreBTitle}</h3>
                <p className="mt-1 text-[var(--dsn-text-secondary)] leading-relaxed">
                  {dict.billingBreBInstructions}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5">
                  <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.billingBreBRecipient}
                  </span>
                  <span className="mt-0.5 block font-semibold text-[var(--dsn-text)]">
                    {checkoutSession.recipientName}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5">
                  <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.billingBreBAmountLabel}
                  </span>
                  <span className="mt-0.5 block font-mono font-bold text-[var(--dsn-text)]">
                    {checkoutSession.amountFormattedCop}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3">
                <div>
                  <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.billingBreBKeyLabel} ({checkoutSession.keyType})
                  </span>
                  <span className="font-mono text-sm font-bold text-[var(--dsn-text)]">
                    {checkoutSession.keyValue}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyBreBKey(checkoutSession.keyValue)}
                  className="min-h-[38px] bg-[var(--dsn-surface-secondary)]"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{copiedKey ? dict.billingBreBKeyCopied : dict.billingBreBCopyKey}</span>
                </Button>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmitBreBReport}
            className="space-y-4 border-t border-[var(--dsn-border)] pt-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="breb-transfer-reference" className="mb-1.5 font-semibold">
                  {dict.billingBreBReferenceLabel}
                </Label>
                <Input
                  id="breb-transfer-reference"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Ej. 00192837"
                  className="bg-[var(--dsn-surface)] text-xs"
                />
              </div>

              <div>
                <Label htmlFor="breb-voucher-file" className="mb-1.5 font-semibold">
                  {dict.billingBreBVoucherLabel}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => voucherInputRef.current?.click()}
                  className="w-full justify-between border-dashed bg-[var(--dsn-surface)] font-normal text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-accent)]"
                >
                  <span className="truncate">
                    {voucherFile ? voucherFile.name : "PNG, JPG, WEBP o PDF"}
                  </span>
                  <FileUp className="h-4 w-4 shrink-0 text-[var(--dsn-accent)]" aria-hidden="true" />
                </Button>
                <input
                  ref={voucherInputRef}
                  id="breb-voucher-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(e) => setVoucherFile(e.target.files?.[0] || null)}
                  className="sr-only"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!voucherFile}
                loading={reportLoading}
                loadingText={dict.billingBreBSubmitting}
                className="min-h-[42px] rounded-xl bg-emerald-600 px-5 font-bold hover:bg-emerald-500"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>{dict.billingBreBSubmitCta}</span>
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
