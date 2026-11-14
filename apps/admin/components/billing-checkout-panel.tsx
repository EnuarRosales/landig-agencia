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

  const operationKind: "new_subscription" | "renewal" | "upgrade" = useMemo(() => {
    if (mode === "onboarding" || !subscription) return "new_subscription";
    if (selectedPlan && selectedPlan.id === currentPlanId) return "renewal";
    return "upgrade";
  }, [mode, subscription, selectedPlan, currentPlanId]);

  async function handleCreateCheckout() {
    if (!selectedPlan || !selectedChannel || selectedAmountCents <= 0 || !isOwner) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setCheckoutLoading(true);

    try {
      const payloadCurrency: "COP" | "USD" =
        selectedChannel.id === "bre_b" || selectedChannel.id === "wompi"
          ? "COP"
          : selectedPlan.currency === "USD" || currency === "USD"
            ? "USD"
            : "COP";

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
          gateway: selectedChannel.id,
          operationKind,
          customerEmail: customerEmail || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.detail || json.error || "No se pudo generar la orden de pago.");
      }
      setCheckoutSession(json.data as CheckoutSessionResponse);
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
          <button
            type="button"
            onClick={() => {
              setCycle("monthly");
              setCheckoutSession(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              cycle === "monthly"
                ? "bg-[var(--dsn-accent)] text-white shadow-xs"
                : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            {dict.billingCycleMonthly}
          </button>
          <button
            type="button"
            onClick={() => {
              setCycle("annual");
              setCheckoutSession(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              cycle === "annual"
                ? "bg-[var(--dsn-accent)] text-white shadow-xs"
                : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            {dict.billingCycleAnnual}
          </button>
        </div>
      </div>

      {/* Estado de Verificación Manual Bre-B en Curso */}
      {pendingReport && (
        <div
          data-testid="breb-pending-banner"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 flex items-start gap-3"
        >
          <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-amber-500">{dict.billingPendingBannerTitle}</p>
            <p className="text-[var(--dsn-text)]">{dict.billingPendingBannerDesc}</p>
            <p className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
              {formatPriceCents(pendingReport.reportedAmountCents, "COP", locale)}
              {pendingReport.paymentReference ? ` · Ref: ${pendingReport.paymentReference}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Alerta de Rechazo Previo */}
      {!pendingReport && latestRejectedBreBReport && (
        <div
          data-testid="breb-rejected-banner"
          className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 flex items-start gap-3"
        >
          <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-rose-500">{dict.billingRejectedBannerTitle}</p>
            {latestRejectedBreBReport.rejectionReason && (
              <p className="text-[var(--dsn-text)]">{latestRejectedBreBReport.rejectionReason}</p>
            )}
            <p className="text-[var(--dsn-text-secondary)]">{dict.billingRejectedBannerHint}</p>
          </div>
        </div>
      )}

      {!isOwner && (
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text-secondary)]">
          {dict.billingOwnerOnlyHint}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-400"
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400"
        >
          {successMsg}
        </div>
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
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                        {dict.billingCurrentPlanTag}
                      </span>
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

      {/* Selector De Canales Y Botón De Checkout */}
      {!pendingReport && selectedAmountCents > 0 && (
        <div className="space-y-4">
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

          {availableChannels.length > 0 && !checkoutSession && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!isOwner || checkoutLoading || !selectedChannel}
                onClick={handleCreateCheckout}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {checkoutLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {checkoutLoading ? dict.billingGeneratingOrder : dict.billingProceedPayment}
                </span>
              </button>
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
                <button
                  type="button"
                  onClick={() => handleCopyBreBKey(checkoutSession.keyValue)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedKey ? dict.billingBreBKeyCopied : dict.billingBreBCopyKey}</span>
                </button>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmitBreBReport}
            className="space-y-4 border-t border-[var(--dsn-border)] pt-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="breb-transfer-reference"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  {dict.billingBreBReferenceLabel}
                </label>
                <input
                  id="breb-transfer-reference"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Ej. 00192837"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="breb-voucher-file"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  {dict.billingBreBVoucherLabel}
                </label>
                <button
                  type="button"
                  onClick={() => voucherInputRef.current?.click()}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-accent)]"
                >
                  <span className="truncate">
                    {voucherFile ? voucherFile.name : "PNG, JPG, WEBP o PDF"}
                  </span>
                  <FileUp className="h-4 w-4 shrink-0 text-[var(--dsn-accent)]" />
                </button>
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
              <button
                type="submit"
                disabled={!voucherFile || reportLoading}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {reportLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>
                  {reportLoading ? dict.billingBreBSubmitting : dict.billingBreBSubmitCta}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
