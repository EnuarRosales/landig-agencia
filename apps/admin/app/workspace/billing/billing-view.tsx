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
  WorkspaceBillingInvoiceItemDto,
  WorkspaceBillingQuotaItem,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatStorageBytes } from "@/components/catalog-quota-banner";
import { BillingCheckoutPanel } from "@/components/billing-checkout-panel";
import {
  Badge,
  Button,
  Card,
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@mocter/ui";

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
    <Card asChild>
      <article className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[var(--dsn-text)]">{quota.label}</h3>
            {quota.source === "override" && (
              <Badge variant="accent" className="mt-1 text-[10px]">
                {dict.billingOverrideTag}
              </Badge>
            )}
          </div>

          {isUnlimited ? (
            <Badge variant="success" className="gap-1 text-[11px]">
              <InfinityIcon className="h-3 w-3" />
              <span>{dict.billingUnlimited}</span>
            </Badge>
          ) : isExcluded ? (
            <Badge variant="outline" className="text-[11px]">
              {dict.billingNotIncluded}
            </Badge>
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
    </Card>
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
    channels: dict.billingCapabilitiesChannels,
    automation: dict.billingCapabilitiesAutomation,
    ai: dict.billingCapabilitiesAi,
    team: dict.billingCapabilitiesTeam,
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
        <Card className="flex flex-col items-center justify-center rounded-2xl p-12 text-center">
          <CreditCard className="mb-3 h-10 w-10 text-[var(--dsn-text-secondary)]/40" />
          <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.billingNoInfoTitle}</p>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.billingNoInfoDesc}</p>
        </Card>
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
          <Badge variant="accent" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            <span>{dict.billingBadge}</span>
          </Badge>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
            {dict.billingTitle}
          </h1>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.billingSubtitle}</p>
        </div>

        {hasCheckoutOptions ? (
          <Button asChild variant="secondary" className="min-h-[40px] text-xs">
            <a href="#plan-checkout-section">
              <span>{dict.billingUpgradeCta}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          <Button asChild variant="secondary" className="min-h-[40px] text-xs">
            <Link href="/workspace">
              <span>{dict.billingUpgradeCta}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </header>

      {/* Tarjeta Principal del Plan */}
      <Card asChild>
        <section className="relative overflow-hidden rounded-2xl border-[var(--dsn-accent)]/30 bg-gradient-to-br from-[var(--dsn-surface)] to-[var(--dsn-surface-secondary)]/50 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)] text-white shadow-md">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-[var(--dsn-text)]">{billing.plan.name}</h2>
                  <Badge
                    variant={isExpired ? "destructive" : isTrial ? "warning" : "success"}
                    className="gap-1"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>
                      {isExpired
                        ? dict.billingStatusExpired
                        : isTrial
                          ? dict.billingStatusTrial
                          : dict.billingStatusActive}
                    </span>
                  </Badge>
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
                  ? dict.billingFreeLabel
                  : formatCurrencyCents(billing.plan.priceMonthlyCents, billing.plan.currency)}
              </p>
              {billing.plan.priceMonthlyCents > 0 && (
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  {dict.billingPerMonthLabel}
                </p>
              )}
            </div>
          </div>
        </section>
      </Card>

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

      {/* Historial de Facturas */}
      <section className="space-y-3" data-testid="billing-invoices-section">
        <div>
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            {dict.billingInvoicesTitle}
          </h2>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
            {dict.billingInvoicesSubtitle}
          </p>
        </div>

        <WorkspaceDataTable<WorkspaceBillingInvoiceItemDto>
          testId="billing-invoices-table"
          locale={locale}
          data={billing.invoices ?? []}
          defaultPageSize={10}
          searchKeys={["invoiceNumber", "status"]}
          searchPlaceholder={dict.billingInvoicesSearchPlaceholder}
          getRowKey={(inv) => inv.id}
          emptyState={{
            icon: <FileText className="h-8 w-8 text-[var(--dsn-text-secondary)] opacity-60" />,
            title: dict.billingInvoicesEmpty,
          }}
          columns={
            [
              {
                key: "invoiceNumber",
                header: dict.billingInvoicesColNumber,
                sortable: true,
                sortValue: (inv) => inv.invoiceNumber,
                renderCell: (inv) => (
                  <span className="font-mono font-semibold text-[var(--dsn-text)]">
                    {inv.invoiceNumber}
                  </span>
                ),
              },
              {
                key: "issuedAt",
                header: dict.billingInvoicesColIssuedAt,
                sortable: true,
                sortValue: (inv) => inv.issuedAt,
                renderCell: (inv) => (
                  <span className="font-mono text-xs text-[var(--dsn-text-secondary)]">
                    {inv.issuedAt
                      ? new Date(inv.issuedAt).toLocaleDateString(locale === "en" ? "en-US" : "es-CO")
                      : "—"}
                  </span>
                ),
              },
              {
                key: "dueAt",
                header: dict.billingInvoicesColDueAt,
                sortable: true,
                sortValue: (inv) => inv.dueAt ?? "",
                renderCell: (inv) => (
                  <span className="font-mono text-xs text-[var(--dsn-text-secondary)]">
                    {inv.dueAt
                      ? new Date(inv.dueAt).toLocaleDateString(locale === "en" ? "en-US" : "es-CO")
                      : "—"}
                  </span>
                ),
              },
              {
                key: "subtotalCents",
                header: dict.billingInvoicesColSubtotal,
                sortable: true,
                isNumeric: true,
                align: "right",
                sortValue: (inv) => inv.subtotalCents,
                renderCell: (inv) => formatCurrencyCents(inv.subtotalCents, inv.currency),
              },
              {
                key: "creditCents",
                header: dict.billingInvoicesColCredits,
                isNumeric: true,
                align: "right",
                renderCell: (inv) =>
                  inv.creditCents > 0
                    ? `-${formatCurrencyCents(inv.creditCents, inv.currency)}`
                    : "—",
              },
              {
                key: "totalCents",
                header: dict.billingInvoicesColTotal,
                sortable: true,
                isNumeric: true,
                align: "right",
                sortValue: (inv) => inv.totalCents,
                renderCell: (inv) => (
                  <span className="font-semibold text-[var(--dsn-text)]">
                    {formatCurrencyCents(inv.totalCents, inv.currency)}
                  </span>
                ),
              },
              {
                key: "status",
                header: dict.billingInvoicesColStatus,
                sortable: true,
                sortValue: (inv) => inv.status,
                renderCell: (inv) => {
                  const statusMap: Record<
                    string,
                    { label: string; variant: "success" | "warning" | "outline" | "destructive" }
                  > = {
                    paid: {
                      label: dict.billingInvoicesStatusPaid,
                      variant: "success",
                    },
                    issued: {
                      label: dict.billingInvoicesStatusIssued,
                      variant: "warning",
                    },
                    draft: {
                      label: dict.billingInvoicesStatusDraft,
                      variant: "outline",
                    },
                    past_due: {
                      label: dict.billingInvoicesStatusPastDue,
                      variant: "destructive",
                    },
                    void: {
                      label: dict.billingInvoicesStatusVoid,
                      variant: "outline",
                    },
                  };
                  const st = statusMap[inv.status] ?? statusMap.draft;
                  return (
                    <Badge variant={st.variant} className="text-[11px]">
                      {st.label}
                    </Badge>
                  );
                },
              },
            ] satisfies WorkspaceTableColumn<WorkspaceBillingInvoiceItemDto>[]
          }
        />
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
          availableReferralCreditCents={billing.availableReferralCreditCents ?? 0}
          referralCreditCurrency={billing.referralCreditCurrency}
          locale={locale}
          mode="workspace"
          isOwner={isOwner}
          onSuccess={refreshBilling}
        />
      )}
    </div>
  );
}
