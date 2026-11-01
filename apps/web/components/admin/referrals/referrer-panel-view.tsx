"use client";

import React, { useState } from "react";

export interface ReferralItem {
  id: string;
  code: string;
  status: "pending" | "qualified" | "rewarded" | "rejected";
  attributedAt: string | Date;
  rejectedReason?: string | null;
}

export interface ReferrerMetricsData {
  totalReferred: number;
  pendingCount: number;
  rewardedCount: number;
  totalEarnedCents: number;
  availableCreditCents: number;
}

export interface ReferrerPanelViewProps {
  referralCode: string;
  referralLink: string;
  currency?: string;
  metrics: ReferrerMetricsData;
  referrals: ReferralItem[];
  t?: Partial<Record<string, string>>;
}

const defaultTranslations: Record<string, string> = {
  title: "Programa De Referidos",
  subtitle: "Comparte tu enlace exclusivo, refiere nuevos negocios y acumula créditos para tu suscripción",
  copyLink: "Copiar Enlace De Invitación",
  linkCopied: "Enlace Copiado Al Portapapeles",
  yourCode: "Tu Código De Referido",
  metricsTitle: "Rendimiento De Referidos",
  totalReferred: "Total De Negocios Referidos",
  pending: "Pendientes De Activación",
  rewarded: "Convertidos Y Premiados",
  earnedCredits: "Créditos Totales Ganados",
  availableCredits: "Crédito Disponible Para Facturas",
  historyTitle: "Historial De Referidos",
  tableCode: "Código",
  tableDate: "Fecha De Registro",
  tableStatus: "Estado",
  tableReason: "Detalle",
  statusPending: "Pendiente De Pago",
  statusQualified: "Calificado",
  statusRewarded: "Premiado",
  statusRejected: "No Elegible",
  noReferrals: "Aún no has registrado ningún referido. Comparte tu enlace para empezar a generar créditos.",
};

/**
 * Panel del referente para el inquilino / líder de comunidad (REF-001 T-07, RF-05.1).
 */
export function ReferrerPanelView({
  referralCode,
  referralLink,
  currency = "COP",
  metrics,
  referrals,
  t: customT,
}: ReferrerPanelViewProps) {
  const t = (key: string) => customT?.[key] ?? defaultTranslations[key] ?? key;
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "COP",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getStatusBadge = (status: ReferralItem["status"]) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {t("statusPending")}
          </span>
        );
      case "qualified":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            {t("statusQualified")}
          </span>
        );
      case "rewarded":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {t("statusRewarded")}
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            {t("statusRejected")}
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 p-4 md:p-6 text-foreground">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* Share / Invitation Link Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("yourCode")}</p>
            <p className="text-2xl font-mono font-bold tracking-wider text-primary mt-0.5">
              {referralCode}
            </p>
          </div>

          <div className="flex-1 max-w-lg">
            <label htmlFor="invitationLinkInput" className="sr-only">
              {t("copyLink")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="invitationLinkInput"
                type="text"
                readOnly
                value={referralLink}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono select-all focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {copied ? t("linkCopied") : t("copyLink")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t("metricsTitle")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("totalReferred")}</p>
            <p className="text-2xl font-bold mt-1">{metrics.totalReferred}</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("pending")}</p>
            <p className="text-2xl font-bold mt-1 text-amber-500">{metrics.pendingCount}</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("earnedCredits")}</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(metrics.totalEarnedCents)}</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("availableCredits")}</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              {formatCurrency(metrics.availableCreditCents)}
            </p>
          </div>
        </div>
      </div>

      {/* Referrals History Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>

        {referrals.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card/50 text-sm text-muted-foreground">
            {t("noReferrals")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {t("tableCode")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("tableDate")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("tableStatus")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("tableReason")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">{ref.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(ref.attributedAt).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(ref.status)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {ref.rejectedReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
