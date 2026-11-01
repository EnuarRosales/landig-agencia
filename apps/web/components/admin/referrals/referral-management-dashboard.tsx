"use client";

import React, { useState } from "react";

export interface ProgramConfig {
  id: string;
  name: string;
  status: "active" | "paused" | "draft" | "ended";
  rewardType: "fixed" | "percent";
  rewardValue: number;
  currency: string;
  attributionDays: number;
  capReferralsPerReferrer: number | null;
  creditValidityDays: number;
}

export interface ProgramMetrics {
  totalReferrals: number;
  pendingCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  rejectedCount: number;
  totalRewardsIssuedCents: number;
  totalCreditsRedeemedCents: number;
  totalCreditsAvailableCents: number;
}

export interface ReferralManagementDashboardProps {
  initialConfig: ProgramConfig;
  initialMetrics: ProgramMetrics;
  userRole?: string;
  t?: Partial<Record<string, string>>;
  onSave?: (config: ProgramConfig) => Promise<boolean>;
}

const defaultTranslations: Record<string, string> = {
  title: "Gestión Del Programa De Referidos",
  subtitle: "Gobernanza comercial, activación del programa y parámetros de incentivos",
  statusActive: "Programa Activo",
  statusPaused: "Programa Pausado",
  toggleStatus: "Alternar Estado Del Programa",
  pauseWarning: "Al pausar el programa se detienen nuevas atribuciones y acreditaciones. Los créditos ya emitidos se conservan hasta su vencimiento.",
  rewardTypeLabel: "Tipo De Recompensa",
  rewardTypeFixed: "Monto Fijo",
  rewardTypePercent: "Porcentaje De Primera Factura",
  rewardValueLabel: "Valor De La Recompensa",
  currencyLabel: "Moneda Del Programa",
  attributionDaysLabel: "Ventana De Atribución (Días)",
  capReferralsLabel: "Tope De Referidos Por Referente (Opcional)",
  noCap: "Sin Límite De Referidos",
  creditValidityDaysLabel: "Vigencia De Crédito (Días)",
  saveButton: "Guardar Configuración Comercial",
  salesReadOnlyBadge: "Modo Solo Lectura (Platform Sales)",
  metricsTitle: "Métricas Globales Del Programa",
  totalProgramReferrals: "Referidos Totales",
  totalIssued: "Recompensas Emitidas",
  totalRedeemed: "Créditos Redimidos",
  totalAvailable: "Créditos Activos En Cartera",
  successUpdate: "Configuración del programa actualizada exitosamente.",
};

/**
 * Área de gobernanza y gestión comercial del programa de referidos (REF-001 T-06, RF-06.1).
 * Accesible para platform_owner y platform_admin con edición completa; platform_sales en solo lectura.
 */
export function ReferralManagementDashboard({
  initialConfig,
  initialMetrics,
  userRole = "platform_admin",
  t: customT,
  onSave,
}: ReferralManagementDashboardProps) {
  const t = (key: string) => customT?.[key] ?? defaultTranslations[key] ?? key;

  const isReadOnly = userRole === "platform_sales";

  const [config, setConfig] = useState<ProgramConfig>(initialConfig);
  const [hasNoCap, setHasNoCap] = useState<boolean>(initialConfig.capReferralsPerReferrer === null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleToggleStatus = async () => {
    if (isReadOnly) return;
    const nextStatus = config.status === "active" ? "paused" : "active";
    const next = { ...config, status: nextStatus as "active" | "paused" };
    setConfig(next);
    if (onSave) {
      setIsSaving(true);
      await onSave(next);
      setIsSaving(false);
      setFeedback(t("successUpdate"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setIsSaving(true);
    const payload: ProgramConfig = {
      ...config,
      capReferralsPerReferrer: hasNoCap ? null : config.capReferralsPerReferrer,
    };
    if (onSave) {
      await onSave(payload);
    }
    setIsSaving(false);
    setFeedback(t("successUpdate"));
  };

  const formatCurrency = (cents: number, cur: string) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: cur === "USD" ? "USD" : "COP",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 p-4 md:p-6 text-foreground">
      {/* Header & Status Toggle */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            {isReadOnly && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                {t("salesReadOnlyBadge")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card">
            <span
              className={`w-3 h-3 rounded-full ${
                config.status === "active" ? "bg-emerald-500" : "bg-amber-500"
              }`}
              aria-hidden="true"
            />
            <span className="text-sm font-medium">
              {config.status === "active" ? t("statusActive") : t("statusPaused")}
            </span>
          </div>

          {!isReadOnly && (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={isSaving}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                config.status === "active"
                  ? "bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-500"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white focus-visible:ring-emerald-500"
              }`}
            >
              {t("toggleStatus")}
            </button>
          )}
        </div>
      </div>

      {config.status === "paused" && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm">
          {t("pauseWarning")}
        </div>
      )}

      {/* Program Global Metrics Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t("metricsTitle")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("totalProgramReferrals")}</p>
            <p className="text-2xl font-bold mt-1">{initialMetrics.totalReferrals}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              {initialMetrics.rewardedCount} premiados · {initialMetrics.pendingCount} pendientes
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("totalIssued")}</p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(initialMetrics.totalRewardsIssuedCents, config.currency)}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("totalRedeemed")}</p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(initialMetrics.totalCreditsRedeemedCents, config.currency)}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground">{t("totalAvailable")}</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              {formatCurrency(initialMetrics.totalCreditsAvailableCents, config.currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Commercial Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold border-b border-border pb-3">
          Configuración Comercial Y Parámetros
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Reward Type */}
          <div>
            <label htmlFor="rewardType" className="block text-sm font-medium mb-1.5">
              {t("rewardTypeLabel")}
            </label>
            <select
              id="rewardType"
              value={config.rewardType}
              disabled={isReadOnly}
              onChange={(e) =>
                setConfig({ ...config, rewardType: e.target.value as "fixed" | "percent" })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            >
              <option value="fixed">{t("rewardTypeFixed")}</option>
              <option value="percent">{t("rewardTypePercent")}</option>
            </select>
          </div>

          {/* Reward Value */}
          <div>
            <label htmlFor="rewardValue" className="block text-sm font-medium mb-1.5">
              {t("rewardValueLabel")} (
              {config.rewardType === "fixed" ? config.currency : "%"}
              )
            </label>
            <input
              id="rewardValue"
              type="number"
              disabled={isReadOnly}
              min="1"
              value={
                config.rewardType === "fixed"
                  ? config.rewardValue / 100
                  : config.rewardValue
              }
              onChange={(e) => {
                const val = Number(e.target.value);
                setConfig({
                  ...config,
                  rewardValue: config.rewardType === "fixed" ? val * 100 : val,
                });
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="currency" className="block text-sm font-medium mb-1.5">
              {t("currencyLabel")}
            </label>
            <select
              id="currency"
              value={config.currency}
              disabled={isReadOnly}
              onChange={(e) => setConfig({ ...config, currency: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            >
              <option value="COP">COP (Pesos Colombianos)</option>
              <option value="USD">USD (Dólares Estadounidenses)</option>
            </select>
          </div>

          {/* Attribution Days */}
          <div>
            <label htmlFor="attributionDays" className="block text-sm font-medium mb-1.5">
              {t("attributionDaysLabel")}
            </label>
            <input
              id="attributionDays"
              type="number"
              disabled={isReadOnly}
              min="1"
              value={config.attributionDays}
              onChange={(e) => setConfig({ ...config, attributionDays: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
          </div>

          {/* Credit Validity Days */}
          <div>
            <label htmlFor="creditValidityDays" className="block text-sm font-medium mb-1.5">
              {t("creditValidityDaysLabel")}
            </label>
            <input
              id="creditValidityDays"
              type="number"
              disabled={isReadOnly}
              min="1"
              value={config.creditValidityDays}
              onChange={(e) => setConfig({ ...config, creditValidityDays: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
          </div>

          {/* Cap Referrals Per Referrer */}
          <div className="space-y-2">
            <label htmlFor="capReferrals" className="block text-sm font-medium mb-1.5">
              {t("capReferralsLabel")}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="capReferrals"
                type="number"
                disabled={isReadOnly || hasNoCap}
                min="1"
                value={config.capReferralsPerReferrer ?? 10}
                onChange={(e) =>
                  setConfig({ ...config, capReferralsPerReferrer: Number(e.target.value) })
                }
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={hasNoCap}
                  onChange={(e) => {
                    setHasNoCap(e.target.checked);
                    if (e.target.checked) {
                      setConfig({ ...config, capReferralsPerReferrer: null });
                    } else {
                      setConfig({ ...config, capReferralsPerReferrer: 10 });
                    }
                  }}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                {t("noCap")}
              </label>
            </div>
          </div>
        </div>

        {feedback && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            {feedback}
          </p>
        )}

        {!isReadOnly && (
          <div className="flex justify-end pt-4 border-t border-border">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {isSaving ? "Guardando..." : t("saveButton")}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
