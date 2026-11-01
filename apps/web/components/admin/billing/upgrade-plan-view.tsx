"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Plan } from "@mocter/domain";

export interface UpgradePlanViewProps {
  locale: string;
  currentPlanCode: string;
  availablePlans: Plan[];
  t: {
    title: string;
    subtitle: string;
    currentPlan: string;
    upgradePlan: string;
    changePlan: string;
    currentStatus: string;
    active: string;
    prorationNotice: string;
    availablePlans: string;
    selectPlan: string;
    confirmUpgrade: string;
    checkoutButton: string;
    backToSettings: string;
    monthly: string;
    annual: string;
    saveBadge: string;
  };
}

/**
 * Componente interactivo para gestión de suscripción y upgrade de plan en mocter-admin (LND-001 T-08, CA-LND-05).
 * Diseñado Mobile First bajo la estética HUD de DSN-001 con alto contraste.
 */
export function UpgradePlanView({
  locale,
  currentPlanCode,
  availablePlans,
  t,
}: UpgradePlanViewProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const currentPlan = availablePlans.find((p) => p.code === currentPlanCode) ?? availablePlans[0];
  const selectedPlan = availablePlans.find((p) => p.code === selectedPlanCode);

  const handleInitiateUpgrade = async (targetPlan: Plan) => {
    setSelectedPlanCode(targetPlan.code);
    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: targetPlan.code,
          billingCycle,
        }),
      });

      if (!response.ok) {
        throw new Error("No fue posible inicializar el cambio de plan.");
      }

      const data = await response.json();
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setFeedbackMessage("Upgrade registrado con éxito. El prorrateo ha sido aplicado.");
      }
    } catch (err: any) {
      setFeedbackMessage(err.message || "Ocurrió un error al procesar el cambio de plan.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Cabecera HUD */}
      <header className="border-b border-stroke pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-txt">
              {t.title}
            </h1>
            <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
          </div>
          <Link
            href={`/${locale}/admin/settings`}
            className="inline-flex items-center text-xs text-primary hover:underline font-medium"
          >
            ← {t.backToSettings}
          </Link>
        </div>
      </header>

      {/* Tarjeta de Plan Actual */}
      <section className="rounded-2xl border border-stroke bg-surface/90 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-muted">
              {t.currentPlan}
            </span>
            <h2 className="text-xl font-bold text-txt mt-1">
              {currentPlan?.name[locale as "es" | "en"] ?? currentPlanCode}
            </h2>
            <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t.active}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-muted block">{t.currentStatus}</span>
            <span className="text-sm font-semibold text-txt">
              {billingCycle === "monthly"
                ? `$${((currentPlan?.priceMonthlyCents ?? 0) / 100).toLocaleString()} COP / ${t.monthly}`
                : `$${((currentPlan?.priceAnnualCents ?? 0) / 100).toLocaleString()} COP / ${t.annual}`}
            </span>
          </div>
        </div>

        {/* Aviso de Prorrateo */}
        <div className="mt-4 p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-xs text-primary flex items-start gap-2">
          <span className="text-base leading-none">ℹ️</span>
          <span>{t.prorationNotice}</span>
        </div>
      </section>

      {/* Conmutador de Ciclo (Mensual / Anual) */}
      <div className="flex justify-center items-center gap-3">
        <button
          type="button"
          onClick={() => setBillingCycle("monthly")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            billingCycle === "monthly"
              ? "bg-primary text-primary-fg shadow-sm"
              : "bg-surface border border-stroke text-muted hover:text-txt"
          }`}
        >
          {t.monthly}
        </button>
        <button
          type="button"
          onClick={() => setBillingCycle("annual")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            billingCycle === "annual"
              ? "bg-primary text-primary-fg shadow-sm"
              : "bg-surface border border-stroke text-muted hover:text-txt"
          }`}
        >
          <span>{t.annual}</span>
          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded text-[10px]">
            {t.saveBadge}
          </span>
        </button>
      </div>

      {/* Grid de Planes para Upgrade */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-txt">{t.availablePlans}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availablePlans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode;
            const priceCents =
              billingCycle === "monthly" ? plan.priceMonthlyCents : plan.priceAnnualCents;
            const priceFormatted = `$${((priceCents ?? 0) / 100).toLocaleString()}`;
            const features = plan.marketingFeatures[locale as "es" | "en"] ?? [];

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col justify-between transition-all backdrop-blur-md ${
                  isCurrent
                    ? "border-stroke/60 bg-surface/50 opacity-80"
                    : plan.isPopular
                    ? "border-primary bg-surface/90 shadow-lg ring-1 ring-primary/40"
                    : "border-stroke bg-surface/80 hover:border-stroke/80"
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-fg uppercase tracking-wide">
                    Recomendado
                  </div>
                )}

                <div>
                  <h4 className="text-lg font-bold text-txt">
                    {plan.name[locale as "es" | "en"]}
                  </h4>
                  <p className="text-xs text-muted mt-1 min-h-[32px]">
                    {plan.description?.[locale as "es" | "en"] ?? ""}
                  </p>

                  <div className="mt-4 mb-6">
                    <span className="text-3xl font-extrabold text-txt tracking-tight">
                      {priceFormatted}
                    </span>
                    <span className="text-xs text-muted ml-1">
                      COP / {billingCycle === "monthly" ? t.monthly : t.annual}
                    </span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-muted mb-6 border-t border-stroke/50 pt-4">
                    {features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold leading-none">✓</span>
                        <span className="text-txt/90">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-surface border border-stroke text-muted cursor-not-allowed"
                    >
                      {t.currentPlan}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleInitiateUpgrade(plan)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-fg hover:opacity-90 active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
                    >
                      {isProcessing && selectedPlanCode === plan.code
                        ? "Procesando..."
                        : t.upgradePlan}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mensaje de retroalimentación */}
      {feedbackMessage && (
        <div className="p-4 rounded-xl border border-primary/30 bg-surface/90 text-sm text-txt text-center shadow-md">
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}
