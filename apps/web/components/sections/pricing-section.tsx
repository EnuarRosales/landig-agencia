"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PublicPlanDto } from "@mocter/domain";
import { IconCheck } from "../icons";
import { PlanComparisonTable } from "./plan-comparison-table";

/**
 * Propiedades de entrada para el componente {@link PricingSection}.
 */
export interface PricingSectionProps {
  /**
   * Colección de planes comerciales canónicos activos provenientes del repositorio de datos.
   */
  plans?: PublicPlanDto[];
}

function formatPlanLimit(
  item: { mode: "LIMITED" | "UNLIMITED"; value: number | null } | undefined,
  t: (key: string) => string,
): string {
  if (!item) return "—";
  if (item.mode === "UNLIMITED") return t("unlimited");
  return String(item.value ?? 0);
}

function formatPlanStorage(
  item: { mode: "LIMITED" | "UNLIMITED"; value: number | null } | undefined,
  t: (key: string) => string,
): string {
  if (!item) return "—";
  if (item.mode === "UNLIMITED") return t("unlimited");
  const bytes = item.value ?? 0;
  const mb = Math.round(bytes / (1024 * 1024));
  if (mb >= 1024) {
    return `${Math.round(mb / 1024)} ${t("gb")}`;
  }
  return `${mb} ${t("mb")}`;
}

function formatPlanRetention(
  item: { mode: "LIMITED" | "UNLIMITED"; value: number | null } | undefined,
  t: (key: string) => string,
): string {
  if (!item) return "—";
  if (item.mode === "UNLIMITED") return t("unlimited");
  return `${item.value ?? 30} ${t("days")}`;
}

/**
 * Sección de tarifas y planes comerciales para la página de inicio.
 *
 * Presenta un diseño HUD responsive con selector de ciclo mensual/anual,
 * métricas directas de capacidad en las tarjetas (productos, agentes, almacenamiento, retención),
 * tabla comparativa colapsable en página y enlace directo de conversión con `plan_code`.
 *
 * @param props - Propiedades del componente {@link PricingSectionProps}.
 * @returns Elemento JSX de la sección o `null` si no hay planes disponibles.
 */
export function PricingSection({ plans = [] }: PricingSectionProps) {
  const t = useTranslations("pricing");
  const locale = useLocale() as "es" | "en";
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [showComparison, setShowComparison] = useState(false);

  // Porcentaje de ahorro anual derivado de los planes activos parametrizados en el backoffice
  const dynamicDiscount = (() => {
    const popular = plans.find(
      (p) => p.isPopular && p.priceMonthlyCents > 0 && p.priceAnnualCents && p.priceAnnualCents > 0,
    );
    if (popular && popular.priceAnnualCents) {
      const full = popular.priceMonthlyCents * 12;
      const pct = Math.round(((full - popular.priceAnnualCents) / full) * 100);
      if (pct > 0 && pct < 100) return pct;
    }
    const discounts = plans
      .filter((p) => p.priceMonthlyCents > 0 && p.priceAnnualCents && p.priceAnnualCents > 0)
      .map((p) => {
        const full = p.priceMonthlyCents * 12;
        return Math.round(((full - (p.priceAnnualCents ?? full)) / full) * 100);
      })
      .filter((pct) => pct > 0 && pct < 100);

    if (discounts.length > 0) {
      return Math.max(...discounts);
    }
    return 20;
  })();

  if (!plans || plans.length === 0) {
    return null;
  }

  const formatPrice = (cents: number, currency: string) => {
    const amount = Math.round(cents / 100);
    if (currency === "USD") {
      return `$${amount}`;
    }
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <section id="planes" className="relative px-[clamp(18px,5vw,60px)] py-10 md:py-20 lg:py-24">
      <div className="eyebrow">{t("pill")}</div>
      <h2 className="mx-auto mb-4 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight text-txt">
        {t("title")}
      </h2>
      <p className="copy mx-auto mb-8 max-w-[660px] text-center text-[17px] text-muted md:mb-10">
        {t("subtitle")}
      </p>

      {/* Switch Mensual / Anual */}
      <div className="mb-8 flex items-center justify-center md:mb-12">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-stroke bg-surface/90 p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
              cycle === "monthly"
                ? "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] text-white shadow-md"
                : "text-muted hover:text-txt"
            }`}
          >
            {t("monthly")}
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
              cycle === "annual"
                ? "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] text-white shadow-md"
                : "text-muted hover:text-txt"
            }`}
          >
            <span>{t("annual")}</span>
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
              {t("discountBadge", { percent: dynamicDiscount })}
            </span>
          </button>
        </div>
      </div>

      {/* Grid de Tarjetas de Planes */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const lang = locale === "en" ? "en" : "es";
          const planName = plan.name?.[lang] || plan.name?.es || plan.code;
          const planDesc =
            (plan.description?.[lang] && plan.description[lang].trim()) || plan.description?.es || "";
          const features =
            (plan.marketingFeatures?.[lang]?.length
              ? plan.marketingFeatures[lang]
              : plan.marketingFeatures?.es) || [];

          const rawPrice =
            cycle === "annual" && plan.priceAnnualCents
              ? Math.round(plan.priceAnnualCents / 12)
              : plan.priceMonthlyCents;
          const displayPrice = formatPrice(rawPrice, plan.currency);

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-6 md:p-8 transition-all hover:scale-[1.01] ${
                plan.isPopular
                  ? "border-a1 bg-surface/90 shadow-[0_0_35px_rgba(47,107,255,0.25)] ring-1 ring-a1"
                  : "border-stroke bg-surface/60 hover:border-stroke/80"
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
                  {t("popularBadge")}
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold text-txt">{planName}</h3>
                <p className="mt-2 min-h-[40px] text-sm text-muted">{planDesc}</p>

                <div className="mt-5 flex items-baseline gap-1.5 border-b border-stroke pb-5">
                  <span className="font-display text-4xl font-extrabold tracking-tight text-txt">
                    {displayPrice}
                  </span>
                  <span className="text-sm font-medium text-muted">
                    /{t("perMonth")}
                  </span>
                </div>

                {/* Métricas clave de capacidad (HUD) */}
                <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-stroke/70 bg-surface2/50 p-3 text-xs">
                  <div>
                    <span className="block text-[11px] text-muted">{t("productsLabel")}</span>
                    <span className="font-mono font-semibold text-txt">
                      {formatPlanLimit(plan.limits?.products, t)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted">{t("agentsLabel")}</span>
                    <span className="font-mono font-semibold text-txt">
                      {formatPlanLimit(plan.limits?.chatwoot_agents, t)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted">{t("storageLabel")}</span>
                    <span className="font-mono font-semibold text-txt">
                      {formatPlanStorage(plan.limits?.storage_bytes, t)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted">{t("retentionLabel")}</span>
                    <span className="font-mono font-semibold text-txt">
                      {formatPlanRetention(plan.limits?.chat_retention_days, t)}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
                    {t("featuresTitle")}
                  </p>
                  <ul className="space-y-3">
                    {features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-txt">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-a1/20 text-a1">
                          <IconCheck className="h-3 w-3" />
                        </span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <a
                  href={`/${locale}/register?plan_code=${plan.code}&cycle=${cycle}`}
                  className={`flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold transition-all ${
                    plan.isPopular
                      ? "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] text-white shadow-lg shadow-a1/30 hover:opacity-90"
                      : "border border-stroke bg-surface hover:bg-stroke/40 text-txt"
                  }`}
                >
                  {t("cta")}
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón para abrir / cerrar la tabla comparativa completa */}
      <div className="mt-10 text-center md:mt-14">
        <button
          type="button"
          onClick={() => setShowComparison(!showComparison)}
          className="inline-flex items-center gap-2.5 rounded-full border border-stroke bg-surface/90 px-6 py-3 text-sm font-semibold text-txt shadow-sm transition-all hover:border-a1 hover:bg-surface hover:shadow-md"
        >
          <span>{showComparison ? t("hideCompareToggle") : t("compareToggle")}</span>
          <span
            className={`inline-block text-xs transition-transform duration-200 ${
              showComparison ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            ▼
          </span>
        </button>
      </div>

      {/* Tabla comparativa colapsable en página */}
      {showComparison && <PlanComparisonTable plans={plans} cycle={cycle} />}
    </section>
  );
}
