"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Zap,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Clock,
  ShieldCheck,
  Infinity as InfinityIcon,
  ArrowUpRight,
} from "lucide-react";
import type {
  WorkspaceBillingCapabilityItem,
  WorkspaceBillingDto,
  WorkspaceBillingQuotaItem,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatStorageBytes } from "@/components/catalog-quota-banner";
import { BillingCheckoutPanel } from "@/components/billing-checkout-panel";

interface BillingViewProps {
  initialBilling: WorkspaceBillingDto | null;
  locale?: AdminLocale;
  isOwner?: boolean;
}

function formatCurrencyCents(cents: number, currency: string): string {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString("es-CO")} ${currency || "COP"}`;
  }
}

function formatQuotaValue(quota: WorkspaceBillingQuotaItem, unlimitedLabel: string): {
  usedText: string;
  limitText: string;
} {
  if (quota.dimension === "storage_bytes") {
    return {
      usedText: formatStorageBytes(quota.used),
      limitText: quota.mode === "UNLIMITED" || quota.limit === null
        ? unlimitedLabel
        : formatStorageBytes(quota.limit),
    };
  }
  return {
    usedText: `${quota.used.toLocaleString("es-CO")}`,
    limitText: quota.mode === "UNLIMITED" || quota.limit === null
      ? unlimitedLabel
      : `${quota.limit.toLocaleString("es-CO")}`,
  };
}

/**
 * Tarjeta de progreso para cada cuota operativa del espacio (productos, contactos, equipo, almacenamiento y atención).
 */
export function PlanQuotaProgressCard({
  quota,
  locale = "es",
}: {
  quota: WorkspaceBillingQuotaItem;
  locale?: AdminLocale;
}) {
  const dict = getAdminDictionary(locale).workspace;
  const isUnlimited = quota.mode === "UNLIMITED" || quota.limit === null;
  const isExcluded = !isUnlimited && (quota.limit ?? 0) === 0;
  const { usedText, limitText } = formatQuotaValue(quota, dict.billingUnlimited);

  const percent =
    !isUnlimited && quota.limit && quota.limit > 0
      ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
      : 0;

  const barColor =
    percent >= 85
      ? "bg-rose-500"
      : percent >= 70
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <article className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-[var(--dsn-text)]">{quota.label}</h3>
          {quota.source === "override" && (
            <span className="mt-1 inline-flex items-center rounded-full bg-[var(--dsn-accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--dsn-accent)]">
              {dict.billingOverrideTag}
            </span>
          )}
        </div>

        {isUnlimited ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <InfinityIcon className="h-3 w-3" />
            <span>{dict.billingUnlimited}</span>
          </span>
        ) : isExcluded ? (
          <span className="inline-flex items-center rounded-full bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--dsn-text-secondary)]">
            {dict.billingNotIncluded}
          </span>
        ) : (
          <span className="text-[11px] font-mono font-semibold text-[var(--dsn-text-secondary)]">
            {percent}%
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="font-mono font-bold text-[var(--dsn-text)]">{usedText}</span>
        <span className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
          / {limitText} {quota.dimension === "storage_bytes" || isUnlimited || isExcluded ? "" : quota.unit}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--dsn-surface-secondary)]">
        <div
          className={`h-full rounded-full transition-all ${
            isUnlimited ? "w-full bg-emerald-500/40" : isExcluded ? "w-0" : barColor
          }`}
          style={isUnlimited || isExcluded ? undefined : { width: `${percent}%` }}
        />
      </div>
    </article>
  );
}

/**
 * Grilla dedicada de límites por producto (imágenes, videos, audios, PDFs) y retención de conversaciones.
 */
export function MediaLimitsGrid({
  mediaLimits,
  retentionDays,
  locale = "es",
}: {
  mediaLimits: WorkspaceBillingDto["mediaLimits"];
  retentionDays: WorkspaceBillingDto["retentionDays"];
  locale?: AdminLocale;
}) {
  const dict = getAdminDictionary(locale).workspace;

  const cards = [
    { item: mediaLimits.imagesPerProduct, icon: ImageIcon, unit: locale === "en" ? "per product" : "por producto" },
    { item: mediaLimits.videosPerProduct, icon: Video, unit: locale === "en" ? "per product" : "por producto" },
    { item: mediaLimits.audiosPerProduct, icon: Music, unit: locale === "en" ? "per product" : "por producto" },
    { item: mediaLimits.pdfsPerProduct, icon: FileText, unit: locale === "en" ? "per product" : "por producto" },
    { item: retentionDays, icon: Clock, unit: locale === "en" ? "days" : "días" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(({ item, icon: Icon, unit }) => {
        const isUnlimited = item.mode === "UNLIMITED" || item.value === null;
        const isExcluded = !isUnlimited && (item.value ?? 0) <= 0;

        return (
          <div
            key={item.dimension}
            className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs flex flex-col justify-between gap-2"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--dsn-text-secondary)]">
              <Icon className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
              <span>{item.label}</span>
            </div>

            {isUnlimited ? (
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {dict.billingUnlimited}
              </p>
            ) : isExcluded ? (
              <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                {dict.billingNotIncluded}
              </p>
            ) : (
              <p className="font-mono text-lg font-bold text-[var(--dsn-text)]">
                {item.value}{" "}
                <span className="text-[11px] font-sans font-normal text-[var(--dsn-text-secondary)]">
                  {unit}
                </span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Matriz categorizada de capacidades funcionales efectivas del espacio.
 */
export function PlanCapabilitiesMatrix({
  capabilityDetails,
  locale = "es",
}: {
  capabilityDetails: WorkspaceBillingCapabilityItem[];
  locale?: AdminLocale;
}) {
  const dict = getAdminDictionary(locale).workspace;

  const groupLabels: Record<WorkspaceBillingCapabilityItem["category"], string> = {
    channels: locale === "en" ? "Service Channels" : "Canales De Atención",
    automation: locale === "en" ? "Automation & Campaigns" : "Automatización Y Campañas",
    ai: locale === "en" ? "Artificial Intelligence" : "Inteligencia Artificial",
    team: locale === "en" ? "Team & Operations" : "Equipo Y Operación",
  };

  const groups = (["channels", "ai", "automation", "team"] as const)
    .map((cat) => ({
      category: cat,
      title: groupLabels[cat],
      items: capabilityDetails.filter((c) => c.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category} className="space-y-2.5">
          <h3 className="text-xs font-semibold text-[var(--dsn-text-secondary)]">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((cap) => (
              <div
                key={cap.code}
                className={`rounded-xl border p-3.5 transition-colors ${
                  cap.enabled
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-[var(--dsn-text)]">{cap.label}</p>
                    {cap.description && (
                      <p className="text-[11px] text-[var(--dsn-text-secondary)] line-clamp-2">
                        {cap.description}
                      </p>
                    )}
                  </div>
                  {cap.enabled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-[var(--dsn-text-secondary)]/60 shrink-0 mt-0.5" />
                  )}
                </div>
                <p
                  className={`mt-2 text-[11px] font-medium ${
                    cap.enabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-[var(--dsn-text-secondary)]"
                  }`}
                >
                  {cap.enabled ? dict.billingIncluded : dict.billingNotIncluded}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Vista rediseñada de Facturación, Cuotas y Capacidades Efectivas del Espacio (`/workspace/billing`).
 */
export function BillingView({ initialBilling, locale = "es", isOwner = true }: BillingViewProps) {
  const [billing, setBilling] = useState<WorkspaceBillingDto | null>(initialBilling);
  const dict = getAdminDictionary(locale).workspace;

  async function refreshBilling() {
    try {
      const res = await fetch("/api/tenant/billing", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.data) {
        setBilling(json.data as WorkspaceBillingDto);
      }
    } catch {
      // Silencio seguro si no hay red en pruebas
    }
  }

  if (!billing) {
    return (
      <div className="w-full p-4 md:px-8 md:py-6">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center shadow-xs">
          <CreditCard className="mb-3 h-10 w-10 text-[var(--dsn-text-secondary)]/40" />
          <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.billingNoInfoTitle}</p>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.billingNoInfoDesc}</p>
        </div>
      </div>
    );
  }

  const isExpired = Boolean(
    billing.subscription &&
      !billing.pendingBreBReport &&
      (billing.subscription.status === "expired" ||
        billing.subscription.status === "past_due" ||
        billing.subscription.status === "cancelled" ||
        billing.subscription.daysRemaining <= 0),
  );
  const isTrial =
    !isExpired &&
    (billing.subscription?.status === "trialing" ||
      billing.subscription?.status === "trial" ||
      billing.plan.lifecycleStatus === "alta");
  const hasCheckoutOptions = Boolean(
    (billing.availablePlans && billing.availablePlans.length > 0) ||
      (billing.availableChannels && billing.availableChannels.length > 0),
  );

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6 animate-in fade-in duration-300">
      <header className="flex flex-col gap-4 border-b border-[var(--dsn-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-500 dark:text-indigo-400">
            <CreditCard className="h-3.5 w-3.5" />
            {dict.billingBadge}
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
            {dict.billingTitle}
          </h1>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.billingSubtitle}</p>
        </div>

        {hasCheckoutOptions ? (
          <a
            href="#plan-checkout-section"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
          >
            <span>{dict.billingUpgradeCta}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : (
          <Link
            href="/workspace"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
          >
            <span>{dict.billingUpgradeCta}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      {/* Tarjeta Principal del Plan */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--dsn-accent)]/30 bg-gradient-to-br from-[var(--dsn-surface)] to-[var(--dsn-surface-secondary)]/50 p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)] text-white shadow-md">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--dsn-text)]">{billing.plan.name}</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isExpired
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : isTrial
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isExpired
                    ? dict.billingStatusExpired
                    : isTrial
                      ? dict.billingStatusTrial
                      : dict.billingStatusActive}
                </span>
              </div>
              {billing.plan.description && (
                <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">
                  {billing.plan.description}
                </p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="font-mono text-xl font-bold text-[var(--dsn-text)]">
              {billing.plan.priceMonthlyCents === 0
                ? locale === "en" ? "Free" : "Gratuito"
                : formatCurrencyCents(billing.plan.priceMonthlyCents, billing.plan.currency)}
            </p>
            {billing.plan.priceMonthlyCents > 0 && (
              <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                {locale === "en" ? "per month" : "por mes"}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Cuotas Operativas del Espacio */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--dsn-text)]">{dict.billingQuotasTitle}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {billing.quotas.map((quota) => (
            <PlanQuotaProgressCard key={quota.dimension} quota={quota} locale={locale} />
          ))}
        </div>
      </section>

      {/* Límites por Producto y Retención */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--dsn-text)]">{dict.billingMediaTitle}</h2>
        <MediaLimitsGrid
          mediaLimits={billing.mediaLimits}
          retentionDays={billing.retentionDays}
          locale={locale}
        />
      </section>

      {/* Capacidades Efectivas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
          {dict.billingCapabilitiesTitle}
        </h2>
        <PlanCapabilitiesMatrix capabilityDetails={billing.capabilityDetails} locale={locale} />
      </section>

      {/* Renovación, Cambio de Plan, Prueba y Pago Bre-B */}
      {hasCheckoutOptions && (
        <BillingCheckoutPanel
          clientId={billing.tenant?.id || ""}
          country={billing.tenant?.country}
          currency={billing.tenant?.currency || billing.plan.currency}
          customerEmail={billing.tenant?.email}
          currentPlanId={billing.plan.id}
          subscription={billing.subscription}
          pendingBreBReport={billing.pendingBreBReport}
          latestRejectedBreBReport={billing.latestRejectedBreBReport}
          availablePlans={billing.availablePlans || []}
          availableChannels={billing.availableChannels || []}
          locale={locale}
          mode="workspace"
          isOwner={isOwner}
          onSuccess={refreshBilling}
        />
      )}
    </div>
  );
}
