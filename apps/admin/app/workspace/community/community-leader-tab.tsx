"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Crown,
  GitBranch,
  Lock,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  AttributedCommunityMetrics,
  LeaderCandidateProductDto,
  TenantCommunitiesOverviewDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatCommunityMoney, readApiError } from "./_types";

interface CommunityLeaderTabProps {
  overview: TenantCommunitiesOverviewDto;
  locale: AdminLocale;
  isOwner: boolean;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onDataMutated: () => Promise<void>;
}

/**
 * Pestaña 5 · Estudio del Líder: Solicitud/Creación de Comunidades, Compartición, Detector de Versiones y Radar de Impacto Atribuido (`SPEC-15`).
 */
export function CommunityLeaderTab({
  overview,
  locale,
  isOwner,
  onSuccessToast,
  onErrorToast,
  onDataMutated,
}: CommunityLeaderTabProps) {
  const dict = getAdminDictionary(locale).community;
  const auth = overview.leaderAuthorization;

  // Solicitud de liderazgo
  const [proposedName, setProposedName] = useState(auth.proposedCommunityName ?? "");
  const [businessModel, setBusinessModel] = useState(auth.businessModel ?? "");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Modal Crear Comunidad (auto-cierre al guardar)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgCategory, setNewOrgCategory] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [newOrgVisibility, setNewOrgVisibility] = useState<"private_invite" | "request_to_join">(
    "private_invite",
  );
  const [newOrgSharePolicy, setNewOrgSharePolicy] = useState<"leaders_only" | "collaborative">(
    "leaders_only",
  );
  const [newOrgRequireShareApproval, setNewOrgRequireShareApproval] = useState(true);
  const [newOrgModeration, setNewOrgModeration] = useState<"pre" | "post" | "none">("pre");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Comunidades donde puede compartir o liderar
  const shareableCommunities = useMemo(
    () =>
      overview.myCommunities.filter(
        (org) =>
          org.myRole === "originator" ||
          org.myRole === "co_leader" ||
          org.sharePolicy === "collaborative",
      ),
    [overview.myCommunities],
  );

  const [selectedOrgIdInput, setSelectedOrgIdInput] = useState<string>(shareableCommunities[0]?.id ?? "");
  const selectedOrgId = shareableCommunities.some((o) => o.id === selectedOrgIdInput)
    ? selectedOrgIdInput
    : (shareableCommunities[0]?.id ?? "");

  const selectedOrg = shareableCommunities.find((o) => o.id === selectedOrgId) ?? null;
  const isSelectedLeadership =
    selectedOrg?.myRole === "originator" || selectedOrg?.myRole === "co_leader";

  // Productos candidatos y shares activos
  const [candidates, setCandidates] = useState<LeaderCandidateProductDto[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Modal Compartir / Publicar Nueva Versión
  const [shareModalState, setShareModalState] = useState<{
    mode: "create" | "version";
    candidate: LeaderCandidateProductDto;
    wholesaleCost: string;
    suggestedPrice: string;
    minResalePrice: string;
    includeReferenceStock: boolean;
    changelog: string;
  } | null>(null);
  const [savingShare, setSavingShare] = useState(false);

  // Radar de impacto atribuido
  const [periodType, setPeriodType] = useState<"daily" | "weekly" | "monthly" | "annual">(
    "monthly",
  );
  const [metrics, setMetrics] = useState<AttributedCommunityMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadCandidates = useCallback(() => {
    setLoadingCandidates(true);
    setRefreshTick((t) => t + 1);
  }, []);

  const loadMetrics = useCallback(() => {
    setLoadingMetrics(true);
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!selectedOrgId || !isOwner) return;
    let active = true;

    fetch(`/api/tenant/community/shares?organizationId=${encodeURIComponent(selectedOrgId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const json = await res.json();
        if (active && json.ok) setCandidates(json.data);
      })
      .catch(() => {
        if (active) onErrorToast(dict.networkErrorShareLoad);
      })
      .finally(() => {
        if (active) setLoadingCandidates(false);
      });

    return () => {
      active = false;
    };
  }, [selectedOrgId, isOwner, refreshTick, onErrorToast, dict.networkErrorShareLoad]);

  useEffect(() => {
    if (!selectedOrgId || !isOwner || !isSelectedLeadership) return;
    let active = true;

    fetch(
      `/api/tenant/community/leadership-metrics?organizationId=${encodeURIComponent(
        selectedOrgId,
      )}&periodType=${periodType}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        if (!active || !res.ok) return;
        const json = await res.json();
        if (active && json.ok) setMetrics(json.data);
      })
      .catch(() => {
        if (active) onErrorToast(dict.networkErrorRadarLoad);
      })
      .finally(() => {
        if (active) setLoadingMetrics(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedOrgId,
    isOwner,
    isSelectedLeadership,
    periodType,
    refreshTick,
    onErrorToast,
    dict.networkErrorRadarLoad,
  ]);

  async function handleRequestLeader(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingRequest(true);
    try {
      const res = await fetch("/api/tenant/community/leader-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          proposedCommunityName: proposedName.trim(),
          businessModel: businessModel.trim(),
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo enviar la solicitud."));
        return;
      }
      await onDataMutated();
      onSuccessToast(dict.leaderPendingBanner);
    } catch {
      onErrorToast(dict.networkErrorLeaderRequest);
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreatingOrg(true);
    try {
      const res = await fetch("/api/tenant/community/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newOrgName.trim(),
          category: newOrgCategory.trim() || null,
          description: newOrgDesc.trim() || null,
          visibility: newOrgVisibility,
          sharePolicy: newOrgSharePolicy,
          requireShareApproval: newOrgRequireShareApproval,
          moderationMode: newOrgModeration,
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo crear la comunidad."));
        return;
      }
      const json = await res.json();
      setCreateModalOpen(false);
      setNewOrgName("");
      setNewOrgCategory("");
      setNewOrgDesc("");
      await onDataMutated();
      if (json.data?.id) setSelectedOrgIdInput(json.data.id);
      onSuccessToast(
        locale === "en" ? "Community created successfully!" : "Comunidad creada correctamente.",
      );
    } catch {
      onErrorToast(dict.networkErrorCreateCommunity);
    } finally {
      setCreatingOrg(false);
    }
  }

  function openShareModal(candidate: LeaderCandidateProductDto, mode: "create" | "version") {
    const existing = candidate.share;
    setShareModalState({
      mode,
      candidate,
      wholesaleCost: String(
        Math.round((existing?.wholesaleCostCents ?? candidate.costPriceCents) / 100),
      ),
      suggestedPrice: String(
        Math.round((existing?.suggestedPriceCents ?? candidate.priceCents) / 100),
      ),
      minResalePrice:
        existing?.minResalePriceCents !== null && existing?.minResalePriceCents !== undefined
          ? String(Math.round(existing.minResalePriceCents / 100))
          : "",
      includeReferenceStock: false,
      changelog: "",
    });
  }

  async function handleSubmitShareModal(e: React.FormEvent) {
    e.preventDefault();
    if (!shareModalState || !selectedOrgId) return;

    const wholesaleCents = Math.max(
      0,
      Math.round((Number.parseFloat(shareModalState.wholesaleCost) || 0) * 100),
    );
    const suggestedCents = Math.max(
      0,
      Math.round((Number.parseFloat(shareModalState.suggestedPrice) || 0) * 100),
    );
    const minResaleCents = shareModalState.minResalePrice.trim()
      ? Math.max(0, Math.round((Number.parseFloat(shareModalState.minResalePrice) || 0) * 100))
      : null;

    setSavingShare(true);
    try {
      const endpoint =
        shareModalState.mode === "create"
          ? "/api/tenant/community/shares"
          : `/api/tenant/community/shares/${shareModalState.candidate.share!.shareId}/version`;

      const payload =
        shareModalState.mode === "create"
          ? {
              organizationId: selectedOrgId,
              sourceProductId: shareModalState.candidate.productId,
              wholesaleCostCents: wholesaleCents,
              suggestedPriceCents: suggestedCents,
              minResalePriceCents: minResaleCents,
              includeReferenceStock: shareModalState.includeReferenceStock,
              changelog: shareModalState.changelog.trim() || null,
            }
          : {
              wholesaleCostCents: wholesaleCents,
              suggestedPriceCents: suggestedCents,
              minResalePriceCents: minResaleCents,
              includeReferenceStock: shareModalState.includeReferenceStock,
              changelog: shareModalState.changelog.trim() || null,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        onErrorToast(await readApiError(res, "Error al publicar en la comunidad."));
        return;
      }

      setShareModalState(null);
      await loadCandidates();
      await onDataMutated();
      onSuccessToast(
        shareModalState.mode === "create"
          ? locale === "en"
            ? "Product shared to community!"
            : "Producto compartido en la comunidad."
          : locale === "en"
            ? "New version published to adopters!"
            : "Nueva versión publicada hacia adoptantes.",
      );
    } catch {
      onErrorToast(dict.networkErrorSaveShare);
    } finally {
      setSavingShare(false);
    }
  }

  async function handleToggleShareArchive(shareId: string, nextStatus: "active" | "archived") {
    try {
      const res = await fetch(`/api/tenant/community/shares/${shareId}/moderate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo cambiar el estado."));
        return;
      }
      await loadCandidates();
      await onDataMutated();
    } catch {
      onErrorToast(dict.networkErrorGeneric);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tarjeta de Autorización de Líder o Creación */}
      {auth.status !== "approved" ? (
        <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[var(--dsn-accent)]/15 p-2.5 text-[var(--dsn-accent)]">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.leaderRequestCardTitle}
              </h3>
              <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">
                {dict.leaderRequestCardDesc}
              </p>
            </div>
          </div>

          {auth.status === "pending" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{dict.leaderPendingBanner}</span>
            </div>
          )}

          {(auth.status === "rejected" || auth.status === "revoked") && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-300 space-y-1">
              <p>{dict.leaderRejectedBanner}</p>
              {auth.reviewNotes && <p className="opacity-85">{auth.reviewNotes}</p>}
            </div>
          )}

          {isOwner && auth.status !== "pending" && (
            <form onSubmit={handleRequestLeader} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block font-medium text-[var(--dsn-text)]">
                  {dict.leaderProposedNameLabel}
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={proposedName}
                  onChange={(e) => setProposedName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-medium text-[var(--dsn-text)]">
                  {dict.leaderBusinessModelLabel}
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  value={businessModel}
                  onChange={(e) => setBusinessModel(e.target.value)}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                />
              </div>
              <button
                type="submit"
                disabled={submittingRequest}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Crown className="h-3.5 w-3.5" />
                <span>{dict.leaderSubmitRequestCta}</span>
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/5 p-4 md:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--dsn-accent)] p-2.5 text-white">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--dsn-text)]">
                {locale === "en" ? "Authorized Community Leader" : "Líder de Comunidad Habilitado"}
              </h3>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                {auth.ownedCommunitiesCount} /{" "}
                {auth.maxOwnedCommunities === null ? "∞" : auth.maxOwnedCommunities}{" "}
                {locale === "en" ? "communities created" : "comunidades creadas"}
              </p>
            </div>
          </div>

          {isOwner && auth.canCreateMoreCommunities && (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span>{dict.createCommunityTitle}</span>
            </button>
          )}
        </section>
      )}

      {/* Selector de comunidad activa del estudio */}
      {shareableCommunities.length > 0 && isOwner && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {shareableCommunities.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => setSelectedOrgIdInput(org.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                    selectedOrgId === org.id
                      ? "bg-[var(--dsn-accent)] text-white"
                      : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
                  }`}
                >
                  {org.name} (
                  {org.myRole === "originator"
                    ? dict.roleOriginator
                    : org.myRole === "co_leader"
                      ? dict.roleCoLeader
                      : dict.roleMember}
                  )
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                void loadCandidates();
                void loadMetrics();
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2 text-[var(--dsn-accent)]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingCandidates || loadingMetrics ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {/* Radar de Impacto Atribuido (solo líderes y co-líderes) */}
          {isSelectedLeadership && metrics && (
            <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 md:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>{dict.leaderRadarTitle}</span>
                  </h3>
                  <p className="text-xs text-[var(--dsn-text-secondary)]">
                    {dict.leaderRadarSubtitle}
                  </p>
                </div>

                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value as typeof periodType)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs text-[var(--dsn-text)]"
                >
                  <option value="daily">{dict.periodDaily}</option>
                  <option value="weekly">{dict.periodWeekly}</option>
                  <option value="monthly">{dict.periodMonthly}</option>
                  <option value="annual">{dict.periodYearly}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5">
                  <span className="text-xs text-[var(--dsn-text-secondary)]">
                    {dict.radarClonesMetric}
                  </span>
                  <p className="mt-1 text-xl font-bold text-[var(--dsn-text)]">
                    {metrics.totalActiveClones}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5">
                  <span className="text-xs text-[var(--dsn-text-secondary)]">
                    {dict.radarOutdatedMetric}
                  </span>
                  <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">
                    {metrics.outdatedClonesCount}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5">
                  <span className="text-xs text-[var(--dsn-text-secondary)]">
                    {dict.radarUnitsMetric}
                  </span>
                  <p className="mt-1 text-xl font-bold text-[var(--dsn-text)]">
                    {metrics.totalUnitsSold}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5">
                  <span className="text-xs text-[var(--dsn-text-secondary)]">
                    {dict.radarRevenueMetric}
                  </span>
                  <p className="mt-1 text-xl font-bold text-[var(--dsn-accent)]">
                    {formatCommunityMoney(metrics.totalRevenueCents, metrics.currency, locale)}
                  </p>
                </div>
              </div>

              {metrics.topSharedProducts.length > 0 && (
                <div className="overflow-x-auto border-t border-[var(--dsn-border)] pt-3">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[var(--dsn-text-secondary)]">
                      <tr>
                        <th className="py-2 pr-3 font-semibold">
                          {locale === "en" ? "Product" : "Producto Compartido"}
                        </th>
                        <th className="py-2 px-3 font-semibold">{dict.radarClonesMetric}</th>
                        <th className="py-2 px-3 font-semibold">{dict.radarOutdatedMetric}</th>
                        <th className="py-2 px-3 font-semibold">{dict.radarUnitsMetric}</th>
                        <th className="py-2 pl-3 font-semibold text-right">
                          {dict.radarRevenueMetric}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--dsn-border)]">
                      {metrics.topSharedProducts.map((tp) => (
                        <tr key={tp.shareId}>
                          <td className="py-2 pr-3 font-medium text-[var(--dsn-text)]">
                            {tp.productName} (v{tp.currentVersion})
                          </td>
                          <td className="py-2 px-3">{tp.clonesCount}</td>
                          <td className="py-2 px-3">{tp.outdatedClonesCount}</td>
                          <td className="py-2 px-3">{tp.unitsSold}</td>
                          <td className="py-2 pl-3 text-right font-semibold text-[var(--dsn-accent)]">
                            {formatCommunityMoney(tp.revenueCents, tp.currency, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Centro de Publicación y Detector de Versiones */}
          <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 md:p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[var(--dsn-accent)]" />
                <span>{dict.leaderShareTitle}</span>
              </h3>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                {selectedOrg?.name} ·{" "}
                {selectedOrg?.sharePolicy === "collaborative"
                  ? dict.sharePolicyCollaborative
                  : dict.sharePolicyLeaders}
              </p>
            </div>

            {candidates.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--dsn-text-secondary)]">
                {locale === "en"
                  ? "Create your own products under Products first to share them with this community."
                  : "Crea productos propios en la sección Productos para poder compartirlos en esta comunidad."}
              </div>
            ) : (
              <div className="space-y-2.5">
                {candidates.map((cand) => (
                  <div
                    key={cand.productId}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-lg bg-[var(--dsn-surface)] border border-[var(--dsn-border)] flex items-center justify-center overflow-hidden shrink-0">
                        {cand.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cand.coverImageUrl}
                            alt={cand.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-[var(--dsn-text-secondary)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[var(--dsn-text)] truncate">
                            {cand.name}
                          </span>
                          {cand.isClonedFromCommunity && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              <Lock className="h-3 w-3" />
                              {locale === "en" ? "Community Import" : "Importado de Comunidad"}
                            </span>
                          )}
                          {cand.share && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--dsn-accent)]">
                              <GitBranch className="h-3 w-3" />
                              v{cand.share.currentVersion} ({cand.share.adoptionsCount} clones)
                            </span>
                          )}
                          {cand.share?.hasPendingChanges && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                              <Sparkles className="h-3 w-3" />
                              {dict.pendingChangesBadge} (
                              {cand.share.pendingChangedAttributes.length})
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {formatCommunityMoney(cand.priceCents, cand.currency, locale)}
                          {cand.sku ? ` · SKU ${cand.sku}` : ""} ·{" "}
                          {cand.compositionType === "combo"
                            ? `${dict.comboTypeLabel} (${cand.comboComponentsCount})`
                            : dict.simpleTypeLabel}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {cand.isClonedFromCommunity ? (
                        <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {locale === "en"
                            ? "Clones cannot be re-shared"
                            : "Los clones no pueden re-compartirse"}
                        </span>
                      ) : !cand.share ? (
                        <button
                          type="button"
                          onClick={() => openShareModal(cand, "create")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{dict.shareToCommunityCta}</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openShareModal(cand, "version")}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                              cand.share.hasPendingChanges
                                ? "bg-[var(--dsn-accent)] text-white"
                                : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)]"
                            }`}
                          >
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span>{dict.publishVersionCta}</span>
                          </button>

                          {cand.share.status === "active" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleToggleShareArchive(cand.share!.shareId, "archived")
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text-secondary)]"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              <span>{dict.archiveShareAction}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void handleToggleShareArchive(cand.share!.shareId, "active")
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-accent)]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>{dict.restoreShareAction}</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal Crear Comunidad (auto-cierre al guardar) */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.createCommunityTitle}
              </h3>
              <button
                type="button"
                onClick={() => !creatingOrg && setCreateModalOpen(false)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium text-[var(--dsn-text)]">
                    {dict.communityNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium text-[var(--dsn-text)]">
                    {dict.communityCategoryLabel}
                  </label>
                  <input
                    type="text"
                    value={newOrgCategory}
                    onChange={(e) => setNewOrgCategory(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-medium text-[var(--dsn-text)]">
                  {dict.communityDescLabel}
                </label>
                <textarea
                  rows={2}
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium text-[var(--dsn-text)]">
                    {dict.communityVisibilityLabel}
                  </label>
                  <select
                    value={newOrgVisibility}
                    onChange={(e) => setNewOrgVisibility(e.target.value as typeof newOrgVisibility)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                  >
                    <option value="private_invite">{dict.visibilityPrivate}</option>
                    <option value="request_to_join">{dict.visibilityDiscoverable}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-[var(--dsn-text)]">
                    {dict.communitySharePolicyLabel}
                  </label>
                  <select
                    value={newOrgSharePolicy}
                    onChange={(e) => setNewOrgSharePolicy(e.target.value as typeof newOrgSharePolicy)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                  >
                    <option value="leaders_only">{dict.sharePolicyLeaders}</option>
                    <option value="collaborative">{dict.sharePolicyCollaborative}</option>
                  </select>
                </div>
              </div>

              {newOrgSharePolicy === "collaborative" && (
                <label className="flex items-center gap-2 text-[var(--dsn-text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newOrgRequireShareApproval}
                    onChange={(e) => setNewOrgRequireShareApproval(e.target.checked)}
                    className="accent-[var(--dsn-accent)]"
                  />
                  <span>{dict.communityRequireShareApprovalLabel}</span>
                </label>
              )}

              <div className="space-y-1">
                <label className="block font-medium text-[var(--dsn-text)]">
                  {dict.communityModerationLabel}
                </label>
                <select
                  value={newOrgModeration}
                  onChange={(e) => setNewOrgModeration(e.target.value as typeof newOrgModeration)}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                >
                  <option value="pre">{dict.moderationPre}</option>
                  <option value="post">{dict.moderationPost}</option>
                  <option value="none">{dict.moderationNone}</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 font-semibold text-[var(--dsn-text)]"
                >
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={creatingOrg}
                  className="rounded-lg bg-[var(--dsn-accent)] px-4 py-2 font-semibold text-white"
                >
                  {dict.createCommunityCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Compartir o Publicar Nueva Versión (auto-cierre al guardar) */}
      {shareModalState && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {shareModalState.mode === "create"
                    ? dict.shareToCommunityCta
                    : dict.publishVersionCta}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {shareModalState.candidate.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !savingShare && setShareModalState(null)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitShareModal} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium text-[var(--dsn-text)]">
                    {dict.wholesaleCostLabel} ({shareModalState.candidate.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={shareModalState.wholesaleCost}
                    onChange={(e) =>
                      setShareModalState((s) => (s ? { ...s, wholesaleCost: e.target.value } : null))
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-medium text-[var(--dsn-text)]">
                    {dict.suggestedPriceLabel} ({shareModalState.candidate.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={shareModalState.suggestedPrice}
                    onChange={(e) =>
                      setShareModalState((s) =>
                        s ? { ...s, suggestedPrice: e.target.value } : null,
                      )
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-medium text-[var(--dsn-text)]">
                  {dict.minResaleLabel} ({shareModalState.candidate.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={shareModalState.minResalePrice}
                  onChange={(e) =>
                    setShareModalState((s) => (s ? { ...s, minResalePrice: e.target.value } : null))
                  }
                  placeholder={locale === "en" ? "Optional minimum floor" : "Opcional (mínimo sugerido)"}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-medium text-[var(--dsn-text)]">
                  {dict.shareChangelogLabel}
                </label>
                <textarea
                  rows={2}
                  value={shareModalState.changelog}
                  onChange={(e) =>
                    setShareModalState((s) => (s ? { ...s, changelog: e.target.value } : null))
                  }
                  placeholder={dict.shareChangelogPlaceholder}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-[var(--dsn-text)]"
                />
              </div>

              <label className="flex items-center gap-2 text-[var(--dsn-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareModalState.includeReferenceStock}
                  onChange={(e) =>
                    setShareModalState((s) =>
                      s ? { ...s, includeReferenceStock: e.target.checked } : null,
                    )
                  }
                  className="accent-[var(--dsn-accent)]"
                />
                <span>{dict.referenceStockLabel}</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShareModalState(null)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 font-semibold text-[var(--dsn-text)]"
                >
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={savingShare}
                  className="rounded-lg bg-[var(--dsn-accent)] px-4 py-2 font-semibold text-white"
                >
                  {shareModalState.mode === "create"
                    ? dict.shareToCommunityCta
                    : dict.publishVersionCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
