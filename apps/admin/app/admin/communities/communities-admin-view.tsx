"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Globe,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type {
  AdminCommunitiesOverviewDto,
  AdminLeaderAuthorizationItemDto,
  AdminOrganizationSummaryDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface CommunitiesAdminViewProps {
  initialOverview: AdminCommunitiesOverviewDto;
  locale?: AdminLocale;
}

/**
 * Consola SaaS de gobierno de líderes y supervisión de comunidades colaborativas (`SPEC-15-D03`).
 */
export function CommunitiesAdminView({
  initialOverview,
  locale = "es",
}: CommunitiesAdminViewProps) {
  const router = useRouter();
  const dict = getAdminDictionary(locale).adminCommunities;

  const [overview, setOverview] = useState<AdminCommunitiesOverviewDto>(initialOverview);
  const [activeTab, setActiveTab] = useState<"leaders" | "organizations">("leaders");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  // Modal de aprobación / edición de cupo (se cierra automáticamente al guardar)
  const [reviewModalTarget, setReviewModalTarget] = useState<{
    clientId: string;
    clientName: string;
    proposedName: string | null;
    businessModel: string | null;
    action: "approve" | "reject";
    maxOwnedCommunities: string;
    unlimited: boolean;
    reviewNotes: string;
  } | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  // Alta directa de líder desde dropdown de comercios
  const [directClientId, setDirectClientId] = useState("");
  const [directMaxQuota, setDirectMaxQuota] = useState("3");
  const [directUnlimited, setDirectUnlimited] = useState(false);
  const [directNotes, setDirectNotes] = useState("");
  const [savingDirect, setSavingDirect] = useState(false);

  // Modales destructivos con ConfirmationModal
  const [revokeTarget, setRevokeTarget] = useState<AdminLeaderAuthorizationItemDto | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminOrganizationSummaryDto | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => overview.authorizations.filter((a) => a.status === "pending").length,
    [overview.authorizations],
  );
  const approvedCount = useMemo(
    () => overview.authorizations.filter((a) => a.status === "approved").length,
    [overview.authorizations],
  );
  const activeOrgsCount = useMemo(
    () => overview.organizations.filter((o) => o.status === "active").length,
    [overview.organizations],
  );
  const totalSharesCount = useMemo(
    () => overview.organizations.reduce((acc, o) => acc + o.sharesCount, 0),
    [overview.organizations],
  );

  const filteredAuthorizations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return overview.authorizations.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      return `${a.clientName} ${a.clientSlug} ${a.contactEmail} ${a.proposedCommunityName ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [overview.authorizations, searchTerm, statusFilter]);

  const filteredOrganizations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return overview.organizations.filter((o) => {
      if (!q) return true;
      return `${o.name} ${o.slug} ${o.originatorName} ${o.category ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [overview.organizations, searchTerm]);

  async function reloadOverview() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/communities", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.ok && json.data) {
        setOverview(json.data);
      }
    } catch {
      // Silencioso en recarga manual
    } finally {
      setRefreshing(false);
    }
  }

  async function submitReviewModal(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewModalTarget) return;
    setSavingReview(true);
    setFeedback(null);
    try {
      const parsedQuota = reviewModalTarget.unlimited
        ? null
        : Math.max(1, Number.parseInt(reviewModalTarget.maxOwnedCommunities || "3", 10) || 3);

      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "review_leader",
          clientId: reviewModalTarget.clientId,
          decision: reviewModalTarget.action,
          maxOwnedCommunities: parsedQuota,
          reviewNotes: reviewModalTarget.reviewNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "Error al guardar la decisión.");
      }

      setReviewModalTarget(null);
      await reloadOverview();
      router.refresh();
      setFeedback({
        type: "ok",
        message:
          reviewModalTarget.action === "approve"
            ? "Autorización de líder actualizada correctamente."
            : "Solicitud rechazada correctamente.",
      });
    } catch (err) {
      setFeedback({
        type: "err",
        message: err instanceof Error ? err.message : "Error inesperado.",
      });
    } finally {
      setSavingReview(false);
    }
  }

  async function handleDirectGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!directClientId) return;
    setSavingDirect(true);
    setFeedback(null);
    try {
      const parsedQuota = directUnlimited
        ? null
        : Math.max(1, Number.parseInt(directMaxQuota || "3", 10) || 3);

      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "review_leader",
          clientId: directClientId,
          decision: "approve",
          maxOwnedCommunities: parsedQuota,
          reviewNotes: directNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo habilitar al líder.");
      }

      setDirectClientId("");
      setDirectNotes("");
      await reloadOverview();
      router.refresh();
      setFeedback({ type: "ok", message: "Comercio habilitado como Líder de Comunidad." });
    } catch (err) {
      setFeedback({
        type: "err",
        message: err instanceof Error ? err.message : "Error al autorizar comercio.",
      });
    } finally {
      setSavingDirect(false);
    }
  }

  async function handleConfirmRevoke() {
    if (!revokeTarget) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "review_leader",
          clientId: revokeTarget.clientId,
          decision: "revoke",
          reviewNotes: "Permiso revocado por administrador de plataforma.",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo revocar el permiso.");
      }
      setRevokeTarget(null);
      await reloadOverview();
      router.refresh();
      setFeedback({ type: "ok", message: "Permiso de creación de comunidades revocado." });
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleToggleOrgStatus(org: AdminOrganizationSummaryDto, nextStatus: "active" | "suspended") {
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "set_org_status",
          organizationId: org.id,
          status: nextStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo actualizar el estado.");
      }
      setSuspendTarget(null);
      await reloadOverview();
      router.refresh();
      setFeedback({
        type: "ok",
        message:
          nextStatus === "suspended"
            ? "Comunidad suspendida correctamente."
            : "Comunidad reactivada correctamente.",
      });
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setConfirmLoading(false);
    }
  }

  function renderAuthStatusBadge(status: AdminLeaderAuthorizationItemDto["status"]) {
    if (status === "approved") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {dict.statusApproved}
        </span>
      );
    }
    if (status === "pending") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          {dict.statusPending}
        </span>
      );
    }
    if (status === "rejected") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
          {dict.statusRejected}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        {dict.statusRevoked}
      </span>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.pageTitle}
            </h1>
            <span className="rounded-full bg-[var(--dsn-accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20">
              {dict.pageBadge}
            </span>
          </div>
          <p className="mt-1 text-xs md:text-sm text-[var(--dsn-text-secondary)]">
            {dict.pageSubtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void reloadOverview()}
          disabled={refreshing}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-[var(--dsn-accent)] ${refreshing ? "animate-spin" : ""}`} />
          <span>{locale === "en" ? "Refresh" : "Actualizar"}</span>
        </button>
      </header>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            feedback.type === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* KPIs de gobierno */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiTotalRequests}</span>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{pendingCount}</p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiAuthorizedLeaders}</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{approvedCount}</p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiActiveOrgs}</span>
            <Globe className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{activeOrgsCount}</p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiTotalClones}</span>
            <Users className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{totalSharesCount}</p>
        </div>
      </section>

      {/* Habilitación directa de un comercio como Líder */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 md:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--dsn-text)] flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>{dict.directGrantTitle}</span>
          </h2>
          <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
            {dict.directGrantSubtitle}
          </p>
        </div>

        <form onSubmit={handleDirectGrant} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4 space-y-1">
            <label htmlFor="direct-leader-client" className="block text-xs font-medium text-[var(--dsn-text)]">
              {dict.selectClientLabel}
            </label>
            <select
              id="direct-leader-client"
              value={directClientId}
              onChange={(e) => setDirectClientId(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
              required
            >
              <option value="">-- {dict.selectClientLabel} --</option>
              {overview.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.slug}) · {t.planName} [{t.leaderStatus}]
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 space-y-1">
            <label htmlFor="direct-leader-quota" className="block text-xs font-medium text-[var(--dsn-text)]">
              {dict.quotaLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="direct-leader-quota"
                type="number"
                min={1}
                max={1000}
                disabled={directUnlimited}
                value={directMaxQuota}
                onChange={(e) => setDirectMaxQuota(e.target.value)}
                className="w-24 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)] disabled:opacity-50"
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-[var(--dsn-text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={directUnlimited}
                  onChange={(e) => setDirectUnlimited(e.target.checked)}
                  className="accent-[var(--dsn-accent)]"
                />
                <span>{dict.unlimitedQuotaLabel}</span>
              </label>
            </div>
          </div>

          <div className="md:col-span-3 space-y-1">
            <label htmlFor="direct-leader-notes" className="block text-xs font-medium text-[var(--dsn-text)]">
              {dict.notesLabel}
            </label>
            <input
              id="direct-leader-notes"
              type="text"
              value={directNotes}
              onChange={(e) => setDirectNotes(e.target.value)}
              placeholder={dict.notesPlaceholder}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!directClientId || savingDirect}
              className="w-full inline-flex min-h-[38px] items-center justify-center rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {dict.approveAction}
            </button>
          </div>
        </form>
      </section>

      {/* Tabs + Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("leaders")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === "leaders"
                ? "bg-[var(--dsn-accent)] text-white"
                : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            {dict.tabRequests} ({overview.authorizations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("organizations")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === "organizations"
                ? "bg-[var(--dsn-accent)] text-white"
                : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            {dict.tabOrganizations} ({overview.organizations.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={locale === "en" ? "Search..." : "Buscar..."}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] pl-8 pr-3 py-2 text-xs text-[var(--dsn-text)]"
            />
          </div>

          {activeTab === "leaders" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
            >
              <option value="all">{locale === "en" ? "All Statuses" : "Todos los Estados"}</option>
              <option value="pending">{dict.statusPending}</option>
              <option value="approved">{dict.statusApproved}</option>
              <option value="rejected">{dict.statusRejected}</option>
              <option value="revoked">{dict.statusRevoked}</option>
            </select>
          )}
        </div>
      </div>

      {/* Tab 1: Solicitudes y Líderes */}
      {activeTab === "leaders" && (
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden">
          {filteredAuthorizations.length === 0 ? (
            <div className="p-10 text-center space-y-1">
              <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.noRequestsTitle}</p>
              <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.noRequestsDesc}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 text-[var(--dsn-text-secondary)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{dict.colTenant}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colProposedName}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colQuota}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colStatus}</th>
                    <th className="px-4 py-3 font-semibold text-right">{dict.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dsn-border)]">
                  {filteredAuthorizations.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--dsn-surface-secondary)]/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--dsn-text)] flex items-center gap-1.5">
                          <Store className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                          <span>{item.clientName}</span>
                        </div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {item.clientSlug} · {item.planName}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-[var(--dsn-text)]">
                          {item.proposedCommunityName || "—"}
                        </div>
                        {item.businessModel && (
                          <p className="text-[11px] text-[var(--dsn-text-secondary)] line-clamp-2">
                            {item.businessModel}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--dsn-text)]">
                        {item.ownedCommunitiesCount} /{" "}
                        {item.maxOwnedCommunities === null ? "∞" : item.maxOwnedCommunities}
                      </td>
                      <td className="px-4 py-3">{renderAuthStatusBadge(item.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setReviewModalTarget({
                                clientId: item.clientId,
                                clientName: item.clientName,
                                proposedName: item.proposedCommunityName,
                                businessModel: item.businessModel,
                                action: "approve",
                                maxOwnedCommunities: String(item.maxOwnedCommunities ?? 3),
                                unlimited: item.maxOwnedCommunities === null && item.status === "approved",
                                reviewNotes: item.reviewNotes ?? "",
                              })
                            }
                            className="rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                          >
                            {item.status === "approved" ? dict.updateQuotaAction : dict.approveAction}
                          </button>

                          {item.status === "pending" && (
                            <button
                              type="button"
                              onClick={() =>
                                setReviewModalTarget({
                                  clientId: item.clientId,
                                  clientName: item.clientName,
                                  proposedName: item.proposedCommunityName,
                                  businessModel: item.businessModel,
                                  action: "reject",
                                  maxOwnedCommunities: "3",
                                  unlimited: false,
                                  reviewNotes: "",
                                })
                              }
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                            >
                              {dict.rejectAction}
                            </button>
                          )}

                          {item.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmError(null);
                                setRevokeTarget(item);
                              }}
                              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:border-rose-500/40"
                            >
                              {dict.revokeAction}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Comunidades Registradas */}
      {activeTab === "organizations" && (
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden">
          {filteredOrganizations.length === 0 ? (
            <div className="p-10 text-center space-y-1">
              <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.noOrgsTitle}</p>
              <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.noOrgsDesc}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 text-[var(--dsn-text-secondary)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{dict.colCommunity}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colLeader}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colPolicy}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colMembers}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colShares}</th>
                    <th className="px-4 py-3 font-semibold">{dict.colStatus}</th>
                    <th className="px-4 py-3 font-semibold text-right">{dict.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dsn-border)]">
                  {filteredOrganizations.map((org) => (
                    <tr key={org.id} className="hover:bg-[var(--dsn-surface-secondary)]/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--dsn-text)]">{org.name}</div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                          /{org.slug} {org.category ? `· ${org.category}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--dsn-text)]">{org.originatorName}</td>
                      <td className="px-4 py-3 text-[var(--dsn-text-secondary)]">
                        <div>{org.sharePolicy}</div>
                        <div className="text-[11px]">{org.visibility} · mod: {org.moderationMode}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--dsn-text)]">{org.membersCount}</td>
                      <td className="px-4 py-3 font-medium text-[var(--dsn-text)]">{org.sharesCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            org.status === "active"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {org.status === "active" ? dict.statusActive : dict.statusSuspended}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {org.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmError(null);
                              setSuspendTarget(org);
                            }}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                          >
                            {dict.suspendOrgAction}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={confirmLoading}
                            onClick={() => void handleToggleOrgStatus(org, "active")}
                            className="rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                          >
                            {dict.reactivateOrgAction}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal de Revisión / Cupo de Líder */}
      {reviewModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {reviewModalTarget.action === "approve" ? dict.approveAction : dict.rejectAction}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {reviewModalTarget.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalTarget(null)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {reviewModalTarget.proposedName && (
              <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs space-y-1">
                <div className="font-semibold text-[var(--dsn-text)]">
                  {reviewModalTarget.proposedName}
                </div>
                {reviewModalTarget.businessModel && (
                  <p className="text-[var(--dsn-text-secondary)]">{reviewModalTarget.businessModel}</p>
                )}
              </div>
            )}

            <form onSubmit={submitReviewModal} className="space-y-3">
              {reviewModalTarget.action === "approve" && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--dsn-text)]">
                    {dict.quotaLabel}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      disabled={reviewModalTarget.unlimited}
                      value={reviewModalTarget.maxOwnedCommunities}
                      onChange={(e) =>
                        setReviewModalTarget((prev) =>
                          prev ? { ...prev, maxOwnedCommunities: e.target.value } : null,
                        )
                      }
                      className="w-28 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)] disabled:opacity-50"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--dsn-text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewModalTarget.unlimited}
                        onChange={(e) =>
                          setReviewModalTarget((prev) =>
                            prev ? { ...prev, unlimited: e.target.checked } : null,
                          )
                        }
                        className="accent-[var(--dsn-accent)]"
                      />
                      <span>{dict.unlimitedQuotaLabel}</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--dsn-text)]">
                  {dict.notesLabel}
                </label>
                <textarea
                  rows={3}
                  value={reviewModalTarget.reviewNotes}
                  onChange={(e) =>
                    setReviewModalTarget((prev) =>
                      prev ? { ...prev, reviewNotes: e.target.value } : null,
                    )
                  }
                  placeholder={dict.notesPlaceholder}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalTarget(null)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={savingReview}
                  className="rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {reviewModalTarget.action === "approve" ? dict.approveAction : dict.rejectAction}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Revocación */}
      <ConfirmationModal
        isOpen={Boolean(revokeTarget)}
        onClose={() => !confirmLoading && setRevokeTarget(null)}
        onConfirm={() => void handleConfirmRevoke()}
        title={dict.confirmRevokeTitle}
        subtitle={revokeTarget?.clientName || ""}
        variant="warning"
        details={
          revokeTarget
            ? [
                { label: dict.colTenant, value: revokeTarget.clientName },
                {
                  label: dict.colQuota,
                  value: `${revokeTarget.ownedCommunitiesCount} / ${
                    revokeTarget.maxOwnedCommunities ?? "∞"
                  }`,
                },
              ]
            : []
        }
        warningTitle={dict.confirmRevokeTitle}
        warningMessage={dict.confirmRevokeDesc}
        confirmText={dict.revokeAction}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={confirmLoading}
        error={confirmError}
      />

      {/* Modal de Confirmación de Suspensión de Comunidad */}
      <ConfirmationModal
        isOpen={Boolean(suspendTarget)}
        onClose={() => !confirmLoading && setSuspendTarget(null)}
        onConfirm={() => {
          if (suspendTarget) void handleToggleOrgStatus(suspendTarget, "suspended");
        }}
        title={dict.confirmSuspendTitle}
        subtitle={suspendTarget?.name || ""}
        variant="danger"
        details={
          suspendTarget
            ? [
                { label: dict.colCommunity, value: suspendTarget.name },
                { label: dict.colLeader, value: suspendTarget.originatorName },
                { label: dict.colMembers, value: String(suspendTarget.membersCount) },
              ]
            : []
        }
        warningTitle={dict.confirmSuspendTitle}
        warningMessage={dict.confirmSuspendDesc}
        confirmText={dict.suspendOrgAction}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={confirmLoading}
        error={confirmError}
      />
    </div>
  );
}
