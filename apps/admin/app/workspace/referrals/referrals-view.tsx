"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Gift,
  Copy,
  Check,
  Download,
  Users,
  Clock,
  CheckCircle2,
  Coins,
  ArrowUpRight,
  AlertTriangle,
  QrCode,
  Receipt,
  Sparkles,
} from "lucide-react";
import type { TenantReferralsOverviewDto } from "@mocter/domain";
import {
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@/components/ui/workspace-data-table";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface TenantReferralsViewProps {
  initialData: TenantReferralsOverviewDto | null;
  locale?: AdminLocale;
}

type ReferralStatusFilter = "all" | "pending" | "qualified" | "rewarded" | "rejected";

interface InvitedTableRow extends Record<string, unknown> {
  id: string;
  business: string;
  date: string;
  status: string;
  credit: string;
}

function formatMoneyCents(cents: number, currency: string, locale: AdminLocale): string {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "COP",
      maximumFractionDigits: currency === "USD" ? 2 : 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

function formatShortDate(iso: string, locale: AdminLocale): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Vista interactiva del Programa de Referidos en el Backoffice del Inquilino (`/workspace/referrals`).
 *
 * Cumple Mobile First, layout perimetral (`AGENTS.md §4.19`), Title Case gramatical (`AGENTS.md §4.8`),
 * bilingüe `es`/`en` y privacidad estricta de comercios referidos (`RN-SPEC-16-04`).
 */
export function TenantReferralsView({
  initialData,
  locale = "es",
}: TenantReferralsViewProps) {
  const dict = getAdminDictionary(locale).workspace;
  const [data, setData] = useState<TenantReferralsOverviewDto | null>(initialData);
  const [statusFilter, setStatusFilter] = useState<ReferralStatusFilter>("all");
  const [pageSize, setPageSize] = useState<number>(initialData?.referrals.limit ?? 10);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const primaryCurrency = data?.metrics.currency || data?.program?.currency || "COP";

  async function fetchReferrals(
    nextStatus: ReferralStatusFilter,
    nextPage: number,
    nextLimit: number,
  ) {
    setStatusFilter(nextStatus);
    setErrorMsg(null);
    setLoadingFilter(true);
    try {
      const qs = new URLSearchParams({
        page: String(nextPage),
        limit: String(nextLimit),
      });
      if (nextStatus !== "all") {
        qs.set("status", nextStatus);
      }
      const res = await fetch(`/api/tenant/referrals?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.detail || json.error || dict.referralsLoadError);
      }
      setData(json.data as TenantReferralsOverviewDto);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : dict.referralsLoadError);
    } finally {
      setLoadingFilter(false);
    }
  }

  function handleFilterChange(nextStatus: ReferralStatusFilter) {
    void fetchReferrals(nextStatus, 1, pageSize);
  }

  async function handleCopyLink() {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard?.writeText(data.referralLink);
    } catch {
      // Fallback silencioso en entornos sin permiso clipboard
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  async function handleCopyCode() {
    if (!data?.code) return;
    try {
      await navigator.clipboard?.writeText(data.code);
    } catch {
      // Fallback silencioso en entornos sin permiso clipboard
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  }

  function handleDownloadQr() {
    if (!data?.qrSvgDataUrl || !data?.code) return;
    const anchor = document.createElement("a");
    anchor.href = data.qrSvgDataUrl;
    anchor.download = `referido-${data.code.toLowerCase()}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  const statusLabelMap: Record<string, string> = {
    pending: dict.referralsStatusPending,
    qualified: dict.referralsStatusQualified,
    rewarded: dict.referralsStatusRewarded,
    rejected: dict.referralsStatusRejected,
  };

  const rewardStatusLabelMap: Record<string, { label: string; className: string }> = {
    available: {
      label: dict.referralsRewardStatusAvailable,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    },
    partially_redeemed: {
      label: dict.referralsRewardStatusPartial,
      className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-500",
    },
    redeemed: {
      label: dict.referralsRewardStatusRedeemed,
      className: "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]",
    },
    expired: {
      label: dict.referralsRewardStatusExpired,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    },
    pending: {
      label: dict.referralsRewardStatusPending,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    },
    void: {
      label: dict.referralsRewardStatusVoid,
      className: "border-rose-500/30 bg-rose-500/10 text-rose-500",
    },
  };

  const invitedColumns: WorkspaceTableColumn<InvitedTableRow>[] = [
    {
      key: "business",
      header: dict.referralsColBusiness,
      sortable: true,
      sortValue: (row) => row.business,
      renderCell: (row) => <span className="font-semibold text-[var(--dsn-text)]">{row.business}</span>,
    },
    {
      key: "date",
      header: dict.referralsColDate,
      sortable: true,
      sortValue: (row) => row.date,
      renderCell: (row) => <span className="font-mono text-xs">{row.date}</span>,
    },
    {
      key: "status",
      header: dict.referralsColStatus,
      sortable: true,
      sortValue: (row) => row.status,
      renderCell: (row) => row.status,
    },
    {
      key: "credit",
      header: dict.referralsColCredit,
      isNumeric: true,
      align: "right",
      renderCell: (row) => row.credit,
    },
  ];

  const invitedRows: InvitedTableRow[] = (data?.referrals.items ?? [])
    .map((item) => ({
      id: item.id,
      business: item.referredBusinessMasked,
      date: formatShortDate(item.attributedAt, locale),
      status: statusLabelMap[item.status] || item.status,
      credit:
        item.rewardAmountCents && item.rewardAmountCents > 0
          ? formatMoneyCents(item.rewardAmountCents, item.rewardCurrency || primaryCurrency, locale)
          : "—",
    }))
    .filter((row) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      return (
        row.business.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
      );
    });

  if (!data) {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 text-sm text-[var(--dsn-text-secondary)]">
          {dict.referralsLoadError}
        </div>
      </div>
    );
  }

  const programStatus = data.program?.status ?? "unavailable";
  const isProgramActive = programStatus === "active";
  const rewardRuleFormatted = data.program
    ? data.program.rewardType === "percent"
      ? `${data.program.rewardValue}%`
      : formatMoneyCents(data.program.rewardValue, data.program.currency, locale)
    : "—";

  const filterButtons: Array<{ key: ReferralStatusFilter; label: string }> = [
    { key: "all", label: dict.referralsFilterAll },
    { key: "pending", label: dict.referralsStatusPending },
    { key: "rewarded", label: dict.referralsStatusRewarded },
    { key: "qualified", label: dict.referralsStatusQualified },
    { key: "rejected", label: dict.referralsStatusRejected },
  ];

  return (
    <div
      data-testid="tenant-referrals-view"
      className="w-full space-y-6 p-4 md:px-8 md:py-6"
    >
      {/* Cabecera */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--dsn-border)] pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.referralsPageTitle}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
              {dict.referralsPageSubtitle}
            </p>
          </div>
        </div>

        <Link
          href="/workspace/billing"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
        >
          <span>{dict.referralsApplyBillingCta}</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Banner de Estado Pausado / Finalizado */}
      {!isProgramActive && (
        <div
          data-testid="referrals-status-banner"
          className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-500">
              {programStatus === "paused"
                ? dict.referralsPausedTitle
                : programStatus === "ended"
                  ? dict.referralsEndedTitle
                  : dict.referralsUnavailableTitle}
            </p>
            <p className="text-[var(--dsn-text)]">
              {programStatus === "paused"
                ? dict.referralsPausedDesc
                : programStatus === "ended"
                  ? dict.referralsEndedDesc
                  : dict.referralsUnavailableDesc}
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {errorMsg}
        </div>
      )}

      {/* Tarjeta Hero: Tu Enlace de Referido + QR Compartible + 3 Pasos */}
      <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          <div className="space-y-4 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.referralsLinkCardTitle}
              </h2>
              {data.program && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/10 px-2.5 py-0.5 font-semibold text-[var(--dsn-accent)]">
                    <Sparkles className="h-3 w-3" />
                    <span>
                      {dict.referralsRewardRuleLabel}: {rewardRuleFormatted}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-0.5 font-medium text-[var(--dsn-text-secondary)]">
                    <Clock className="h-3 w-3" />
                    <span>
                      {dict.referralsValidityLabel}: {data.program.creditValidityDays}{" "}
                      {dict.referralsDaysSuffix}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {data.code && data.referralLink ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    id="tenant-referral-link-input"
                    type="text"
                    readOnly
                    aria-label={dict.referralsLinkCardTitle}
                    value={data.referralLink}
                    className="min-h-[44px] flex-1 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3.5 py-2 text-xs font-mono text-[var(--dsn-text)] select-all focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
                    >
                      {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      <span>{copiedLink ? dict.referralsLinkCopied : dict.referralsCopyLink}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      {copiedCode ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-[var(--dsn-accent)]" />
                      )}
                      <span>{copiedCode ? dict.referralsCodeCopied : dict.referralsCopyCode}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--dsn-text-secondary)]">
                  <span>{dict.referralsYourCodeLabel}:</span>
                  <span
                    data-testid="tenant-referral-code"
                    className="rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-0.5 font-mono font-bold text-[var(--dsn-text)]"
                  >
                    {data.code}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                {dict.referralsPausedDesc}
              </p>
            )}

            {/* Guía en 3 Pasos */}
            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 space-y-1">
                <p className="text-xs font-bold text-[var(--dsn-text)]">{dict.referralsStep1Title}</p>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">{dict.referralsStep1Desc}</p>
              </div>
              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 space-y-1">
                <p className="text-xs font-bold text-[var(--dsn-text)]">{dict.referralsStep2Title}</p>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">{dict.referralsStep2Desc}</p>
              </div>
              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 space-y-1">
                <p className="text-xs font-bold text-[var(--dsn-text)]">{dict.referralsStep3Title}</p>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">{dict.referralsStep3Desc}</p>
              </div>
            </div>
          </div>

          {/* Panel de Código QR Compartible */}
          {data.qrSvgDataUrl && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 text-center space-y-3 lg:col-span-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                <QrCode className="h-4 w-4 text-[var(--dsn-accent)]" />
                <span>{dict.referralsQrTitle}</span>
              </div>
              <div className="rounded-xl border border-[var(--dsn-border)] bg-white p-2.5 shadow-xs">
                <img
                  src={data.qrSvgDataUrl}
                  alt={dict.referralsQrTitle}
                  data-testid="tenant-referral-qr"
                  className="h-36 w-36 object-contain"
                />
              </div>
              <button
                type="button"
                onClick={handleDownloadQr}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface-secondary)]"
              >
                <Download className="h-4 w-4 text-[var(--dsn-accent)]" />
                <span>{dict.referralsDownloadQr}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 4 KPIs Mobile First */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span className="font-medium">{dict.referralsKpiTotal}</span>
            <Users className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {data.metrics.totalReferred}
          </p>
        </article>

        <article className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span className="font-medium">{dict.referralsKpiPending}</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="font-mono text-2xl font-bold text-amber-500">
            {data.metrics.pendingCount}
          </p>
        </article>

        <article className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span className="font-medium">{dict.referralsKpiRewarded}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="font-mono text-2xl font-bold text-emerald-500">
            {data.metrics.rewardedCount}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-500/35 bg-emerald-500/5 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span className="font-medium">{dict.referralsKpiAvailable}</span>
            <Coins className="h-4 w-4 text-emerald-500" />
          </div>
          <p
            data-testid="tenant-available-credit-kpi"
            className="font-mono text-2xl font-bold text-emerald-500"
          >
            {formatMoneyCents(data.metrics.availableCreditCents, primaryCurrency, locale)}
          </p>
        </article>
      </section>

      {/* Tabla Estándar de Comercios Invitados */}
      <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-[var(--dsn-text)]">
            {dict.referralsInvitedTableTitle}
          </h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={dict.referralsColStatus}>
            {filterButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                disabled={loadingFilter}
                onClick={() => handleFilterChange(btn.key)}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === btn.key
                    ? "bg-[var(--dsn-accent)] text-white"
                    : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <WorkspaceDataTable<InvitedTableRow>
          testId="referrals-invited-table"
          locale={locale}
          columns={invitedColumns}
          data={invitedRows}
          getRowKey={(row) => row.id}
          page={data.referrals.page}
          pageSize={pageSize}
          totalItems={searchTerm.trim() ? invitedRows.length : data.referrals.total}
          onPageChange={(nextPage) => void fetchReferrals(statusFilter, nextPage, pageSize)}
          onPageSizeChange={(nextLimit) => {
            setPageSize(nextLimit);
            void fetchReferrals(statusFilter, 1, nextLimit);
          }}
          searchQuery={searchTerm}
          onSearchChange={(q) => setSearchTerm(q)}
          activeFiltersCount={statusFilter !== "all" ? 1 : 0}
          onResetFilters={() => {
            setSearchTerm("");
            if (statusFilter !== "all") {
              void fetchReferrals("all", 1, pageSize);
            }
          }}
          loading={loadingFilter}
          emptyState={{
            icon: <Users className="h-8 w-8 text-[var(--dsn-text-secondary)] opacity-60" />,
            title: dict.referralsEmptyInvited,
          }}
        />
      </section>

      {/* Créditos y Redenciones */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-[var(--dsn-text)]">
          {dict.referralsCreditsSectionTitle}
        </h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Lotes de Crédito y Vencimientos */}
          <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--dsn-text)]">
              <Coins className="h-4 w-4 text-[var(--dsn-accent)]" />
              <h3>{dict.referralsRewardsBatchesTitle}</h3>
            </div>

            {data.rewards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--dsn-border)] p-5 text-center text-xs text-[var(--dsn-text-secondary)]">
                {dict.referralsEmptyRewards}
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.rewards.map((reward) => {
                  const badge = rewardStatusLabelMap[reward.status] || {
                    label: reward.status,
                    className: "border-[var(--dsn-border)] text-[var(--dsn-text-secondary)]",
                  };
                  return (
                    <div
                      key={reward.id}
                      className="flex flex-col gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[var(--dsn-text)]">
                            {formatMoneyCents(reward.remainingCents, reward.currency, locale)}
                          </span>
                          <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                            / {formatMoneyCents(reward.amountCents, reward.currency, locale)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {dict.referralsColExpiresAt}: {formatShortDate(reward.expiresAt, locale)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex self-start rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:self-center ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ledger de Redenciones en Facturas */}
          <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--dsn-text)]">
              <Receipt className="h-4 w-4 text-[var(--dsn-accent)]" />
              <h3>{dict.referralsRedemptionsLedgerTitle}</h3>
            </div>

            {data.redemptions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--dsn-border)] p-5 text-center text-xs text-[var(--dsn-text-secondary)]">
                {dict.referralsEmptyRedemptions}
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.redemptions.map((red) => (
                  <div
                    key={red.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-mono font-bold text-[var(--dsn-text)]">
                        {dict.referralsColInvoice}: {red.invoiceNumber}
                      </p>
                      <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {dict.referralsColRedeemedAt}: {formatShortDate(red.redeemedAt, locale)}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-emerald-500">
                      -{formatMoneyCents(red.amountCents, red.currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
