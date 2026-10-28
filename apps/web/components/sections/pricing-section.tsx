"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Plan } from "@mocter/domain";
import { IconCheck } from "../icons";

/**
 * Propiedades de entrada para el componente {@link PricingSection}.
 */
export interface PricingSectionProps {
  /**
   * Colección de planes comerciales canónicos activos provenientes del repositorio de datos.
   */
  plans?: Plan[];
}

/**
 * Sección de tarifas y planes comerciales para la página de inicio.
 *
 * Presenta un diseño HUD responsive con selector de ciclo mensual/anual,
 * resaltado del plan más popular, visualización de características y
 * enlace directo de conversión con transferencia del parámetro `plan_code`.
 *
 * Si no existen planes activos en la base de datos, el componente no renderiza nada (`null`).
 *
 * @param props - Propiedades del componente {@link PricingSectionProps}.
 * @returns Elemento JSX de la sección o `null` si no hay planes disponibles.
 */
export function PricingSection({ plans = [] }: PricingSectionProps) {
  const t = useTranslations("pricing");
  const locale = useLocale() as "es" | "en";
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

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
    <section id="planes" className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]">
      <div className="eyebrow">{t("pill")}</div>
      <h2 className="mx-auto mb-4 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight text-txt">
        {t("title")}
      </h2>
      <p className="copy mx-auto mb-10 max-w-[660px] text-center text-[17px] text-muted">
        {t("subtitle")}
      </p>

      {/* Switch Mensual / Anual */}
      <div className="mb-14 flex items-center justify-center">
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
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
              {t("discountBadge")}
            </span>
          </button>
        </div>
      </div>

      {/* Grid de Tarjetas de Planes */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const lang = locale === "en" ? "en" : "es";
          const planName = plan.name?.[lang] || plan.name?.es || plan.code;
          const planDesc = plan.description ? (plan.description[lang] || plan.description.es) : "";
          const features = plan.marketingFeatures ? (plan.marketingFeatures[lang] || plan.marketingFeatures.es) : [];

          const rawPrice =
            cycle === "annual" && plan.priceAnnualCents
              ? Math.round(plan.priceAnnualCents / 12)
              : plan.priceMonthlyCents;
          const displayPrice = formatPrice(rawPrice, plan.currency);

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-8 transition-all hover:scale-[1.01] ${
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

                <div className="mt-6 flex items-baseline gap-1.5 border-b border-stroke pb-6">
                  <span className="font-display text-4xl font-extrabold tracking-tight text-txt">
                    {displayPrice}
                  </span>
                  <span className="text-sm font-medium text-muted">
                    /{t("perMonth")}
                  </span>
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
    </section>
  );
}
