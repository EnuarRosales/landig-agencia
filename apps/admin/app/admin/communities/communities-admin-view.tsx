"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Globe,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type {
  AdminCommunitiesOverviewDto,
  AdminLeaderAuthorizationItemDto,
  AdminOrganizationSummaryDto,
} from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmationModal,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

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
  const isClientHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

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

  // Parametrización SaaS de retención de publicaciones del muro (SPEC-15-D14)
  const [retentionDaysInput, setRetentionDaysInput] = useState(
    String(initialOverview.retentionSettings?.feedRetentionDays ?? 90),
  );
  const [retentionUnlimited, setRetentionUnlimited] = useState(
    initialOverview.retentionSettings?.feedRetentionDays === null,
  );
  const [savingRetention, setSavingRetention] = useState(false);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgingRetention, setPurgingRetention] = useState(false);

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

  async function handleSaveRetention(e: React.FormEvent) {
    e.preventDefault();
    setSavingRetention(true);
    setFeedback(null);
    try {
      const parsedDays = retentionUnlimited
        ? null
        : Math.min(3650, Math.max(1, Number.parseInt(retentionDaysInput || "90", 10) || 90));

      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update_retention_settings",
          feedRetentionDays: parsedDays,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar la retención.");
      }
      await reloadOverview();
      router.refresh();
      setFeedback({ type: "ok", message: dict.retentionSavedMsg });
    } catch (err) {
      setFeedback({
        type: "err",
        message: err instanceof Error ? err.message : "Error inesperado.",
      });
    } finally {
      setSavingRetention(false);
    }
  }

  async function handleRunRetentionPurge() {
    setPurgingRetention(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "run_retention_purge" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo ejecutar la purga.");
      }
      setPurgeModalOpen(false);
      await reloadOverview();
      router.refresh();
      const purgedCount = json.data?.purgedPostsCount ?? 0;
      const freedMb = ((json.data?.releasedBytesTotal ?? 0) / (1024 * 1024)).toFixed(2);
      setFeedback({
        type: "ok",
        message:
          locale === "en"
            ? `${dict.retentionPurgedMsg} Purged posts: ${purgedCount}, released storage: ${freedMb} MB.`
            : `${dict.retentionPurgedMsg} Publicaciones purgadas: ${purgedCount}, almacenamiento liberado: ${freedMb} MB.`,
      });
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPurgingRetention(false);
    }
  }

  function renderAuthStatusBadge(status: AdminLeaderAuthorizationItemDto["status"]) {
    if (status === "approved") {
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{dict.statusApproved}</span>
        </Badge>
      );
    }
    if (status === "pending") {
      return (
        <Badge variant="warning" className="gap-1">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>{dict.statusPending}</span>
        </Badge>
      );
    }
    if (status === "rejected") {
      return (
        <Badge variant="destructive" className="gap-1">
          <span>{dict.statusRejected}</span>
        </Badge>
      );
    }
    return <Badge variant="outline">{dict.statusRevoked}</Badge>;
  }

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.pageTitle}
            </h1>
            <Badge variant="accent">{dict.pageBadge}</Badge>
          </div>
          <p className="mt-1 text-xs md:text-sm text-[var(--dsn-text-secondary)]">
            {dict.pageSubtitle}
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => void reloadOverview()}
          disabled={refreshing}
          className="min-h-[40px] text-xs"
        >
          <RefreshCw className={`h-4 w-4 text-[var(--dsn-accent)] ${refreshing ? "animate-spin" : ""}`} />
          <span>{locale === "en" ? "Refresh" : "Actualizar"}</span>
        </Button>
      </header>

      {feedback && (
        <Alert variant={feedback.type === "ok" ? "success" : "destructive"}>
          <AlertDescription className="text-xs font-medium">{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* KPIs de gobierno */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiTotalRequests}</span>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{pendingCount}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiAuthorizedLeaders}</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{approvedCount}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiActiveOrgs}</span>
            <Globe className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{activeOrgsCount}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{dict.kpiTotalClones}</span>
            <Users className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)]">{totalSharesCount}</p>
        </Card>
      </section>

      {/* Habilitación directa de un comercio como Líder */}
      <Card asChild>
        <section className="p-4 md:p-5 space-y-4">
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
              <Label htmlFor="direct-leader-client" className="block text-xs font-medium text-[var(--dsn-text)]">
                {dict.selectClientLabel}
              </Label>
              <Select
                id="direct-leader-client"
                value={directClientId}
                onChange={(e) => setDirectClientId(e.target.value)}
                className="text-xs"
                required
              >
                <option value="">-- {dict.selectClientLabel} --</option>
                {overview.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName} ({t.slug}) · {t.planName} [{t.leaderStatus}]
                  </option>
                ))}
              </Select>
            </div>

            <div className="md:col-span-3 space-y-1">
              <Label htmlFor="direct-leader-quota" className="block text-xs font-medium text-[var(--dsn-text)]">
                {dict.quotaLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="direct-leader-quota"
                  type="number"
                  min={1}
                  max={1000}
                  disabled={directUnlimited}
                  value={directMaxQuota}
                  onChange={(e) => setDirectMaxQuota(e.target.value)}
                  className="w-24 text-xs"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--dsn-text-secondary)] cursor-pointer">
                  <Checkbox
                    checked={directUnlimited}
                    onCheckedChange={(checked) => setDirectUnlimited(checked === true)}
                  />
                  <span>{dict.unlimitedQuotaLabel}</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <Label htmlFor="direct-leader-notes" className="block text-xs font-medium text-[var(--dsn-text)]">
                {dict.notesLabel}
              </Label>
              <Input
                id="direct-leader-notes"
                type="text"
                value={directNotes}
                onChange={(e) => setDirectNotes(e.target.value)}
                placeholder={dict.notesPlaceholder}
                className="text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <Button
                type="submit"
                variant="primary"
                disabled={!directClientId || savingDirect}
                loading={savingDirect}
                className="w-full min-h-[38px] text-xs"
              >
                <span>{dict.approveAction}</span>
              </Button>
            </div>
          </form>
        </section>
      </Card>

      {/* Parametrización SaaS de retención de publicaciones del muro */}
      <Card asChild>
        <section className="p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--dsn-text)] flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--dsn-accent)]" />
                <span>{dict.retentionTitle}</span>
              </h2>
              <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                {dict.retentionSubtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--dsn-text-secondary)]">
              <Badge variant="outline">
                {dict.retentionEligibleLabel}: {overview.retentionSettings?.eligibleToPurgeCount ?? 0}
              </Badge>
              <span>
                {dict.retentionLastRunLabel}:{" "}
                {overview.retentionSettings?.lastRetentionPurgeAt
                  ? isClientHydrated
                    ? new Date(overview.retentionSettings.lastRetentionPurgeAt).toLocaleString(
                        locale === "en" ? "en-US" : "es-CO",
                      )
                    : `${new Date(overview.retentionSettings.lastRetentionPurgeAt).toLocaleString(
                        locale === "en" ? "en-US" : "es-CO",
                        { timeZone: "UTC" },
                      )} UTC`
                  : dict.retentionNeverRun}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveRetention} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="retention-days-input" className="block text-xs font-medium text-[var(--dsn-text)]">
                {dict.retentionDaysLabel}
              </Label>
              <Input
                id="retention-days-input"
                type="number"
                min={1}
                max={3650}
                disabled={retentionUnlimited || savingRetention}
                value={retentionDaysInput}
                onChange={(e) => setRetentionDaysInput(e.target.value)}
                className="w-28 text-xs"
              />
            </div>

            <label className="inline-flex h-9 items-center gap-2 text-xs text-[var(--dsn-text-secondary)] cursor-pointer">
              <Checkbox
                checked={retentionUnlimited}
                onCheckedChange={(checked) => setRetentionUnlimited(checked === true)}
              />
              <span>{dict.retentionUnlimitedLabel}</span>
            </label>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <Button
                type="submit"
                variant="primary"
                disabled={savingRetention}
                loading={savingRetention}
                className="min-h-[38px] text-xs"
              >
                <span>{dict.retentionSaveCta}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={purgingRetention || retentionUnlimited}
                onClick={() => {
                  setConfirmError(null);
                  setPurgeModalOpen(true);
                }}
                className="min-h-[38px] text-xs"
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>{dict.retentionPurgeCta}</span>
              </Button>
            </div>
          </form>
        </section>
      </Card>

      {/* Tabs + Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeTab === "leaders" ? "primary" : "secondary"}
            onClick={() => setActiveTab("leaders")}
            className="text-xs"
          >
            {dict.tabRequests} ({overview.authorizations.length})
          </Button>
          <Button
            type="button"
            variant={activeTab === "organizations" ? "primary" : "secondary"}
            onClick={() => setActiveTab("organizations")}
            className="text-xs"
          >
            {dict.tabOrganizations} ({overview.organizations.length})
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={locale === "en" ? "Search..." : "Buscar..."}
              className="bg-[var(--dsn-surface)] pl-8 text-xs"
            />
          </div>

          {activeTab === "leaders" && (
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--dsn-surface)] text-xs w-auto"
            >
              <option value="all">{locale === "en" ? "All Statuses" : "Todos los Estados"}</option>
              <option value="pending">{dict.statusPending}</option>
              <option value="approved">{dict.statusApproved}</option>
              <option value="rejected">{dict.statusRejected}</option>
              <option value="revoked">{dict.statusRevoked}</option>
            </Select>
          )}
        </div>
      </div>

      {/* Tab 1: Solicitudes y Líderes */}
      {activeTab === "leaders" && (
        <Card asChild>
          <section className="overflow-hidden">
            {filteredAuthorizations.length === 0 ? (
              <EmptyState
                title={dict.noRequestsTitle}
                description={dict.noRequestsDesc}
                className="border-0 rounded-none py-10"
              />
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
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
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
                            className="h-auto min-h-0 px-2.5 py-1.5 text-[11px]"
                          >
                            {item.status === "approved" ? dict.updateQuotaAction : dict.approveAction}
                          </Button>

                          {item.status === "pending" && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
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
                              className="h-auto min-h-0 px-2.5 py-1.5 text-[11px]"
                            >
                              {dict.rejectAction}
                            </Button>
                          )}

                          {item.status === "approved" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setConfirmError(null);
                                setRevokeTarget(item);
                              }}
                              className="h-auto min-h-0 px-2.5 py-1.5 text-[11px] text-rose-600 hover:border-rose-500/40"
                            >
                              {dict.revokeAction}
                            </Button>
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
        </Card>
      )}

      {/* Tab 2: Comunidades Registradas */}
      {activeTab === "organizations" && (
        <Card asChild>
          <section className="overflow-hidden">
            {filteredOrganizations.length === 0 ? (
              <EmptyState
                title={dict.noOrgsTitle}
                description={dict.noOrgsDesc}
                className="border-0 rounded-none py-10"
              />
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
                          <Badge variant={org.status === "active" ? "success" : "destructive"}>
                            {org.status === "active" ? dict.statusActive : dict.statusSuspended}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {org.status === "active" ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setConfirmError(null);
                                setSuspendTarget(org);
                              }}
                              className="h-auto min-h-0 px-2.5 py-1.5 text-[11px]"
                            >
                              {dict.suspendOrgAction}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={confirmLoading}
                              onClick={() => void handleToggleOrgStatus(org, "active")}
                              className="h-auto min-h-0 px-2.5 py-1.5 text-[11px]"
                            >
                              {dict.reactivateOrgAction}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </Card>
      )}

      {/* Modal de Revisión / Cupo de Líder */}
      <Dialog
        open={Boolean(reviewModalTarget)}
        onOpenChange={(open) => {
          if (!open && !savingReview) setReviewModalTarget(null);
        }}
      >
        <DialogContent className="max-w-md p-5 space-y-4">
          {reviewModalTarget && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                  {reviewModalTarget.action === "approve" ? dict.approveAction : dict.rejectAction}
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--dsn-text-secondary)]">
                  {reviewModalTarget.clientName}
                </DialogDescription>
              </DialogHeader>

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
                    <Label className="block text-xs font-medium text-[var(--dsn-text)]">
                      {dict.quotaLabel}
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
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
                        className="w-28 text-xs"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-[var(--dsn-text)] cursor-pointer">
                        <Checkbox
                          checked={reviewModalTarget.unlimited}
                          onCheckedChange={(checked) =>
                            setReviewModalTarget((prev) =>
                              prev ? { ...prev, unlimited: checked === true } : null,
                            )
                          }
                        />
                        <span>{dict.unlimitedQuotaLabel}</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="block text-xs font-medium text-[var(--dsn-text)]">
                    {dict.notesLabel}
                  </Label>
                  <Textarea
                    rows={3}
                    value={reviewModalTarget.reviewNotes}
                    onChange={(e) =>
                      setReviewModalTarget((prev) =>
                        prev ? { ...prev, reviewNotes: e.target.value } : null,
                      )
                    }
                    placeholder={dict.notesPlaceholder}
                    className="text-xs"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setReviewModalTarget(null)}
                    className="text-xs"
                  >
                    {locale === "en" ? "Cancel" : "Cancelar"}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={savingReview}
                    loading={savingReview}
                    className="text-xs"
                  >
                    {reviewModalTarget.action === "approve" ? dict.approveAction : dict.rejectAction}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Modal de Confirmación de Purga de Retención */}
      <ConfirmationModal
        isOpen={purgeModalOpen}
        onClose={() => !purgingRetention && setPurgeModalOpen(false)}
        onConfirm={() => void handleRunRetentionPurge()}
        title={dict.retentionConfirmTitle}
        subtitle={
          retentionUnlimited
            ? dict.retentionUnlimitedLabel
            : `${overview.retentionSettings?.feedRetentionDays ?? retentionDaysInput} ${
                locale === "en" ? "Days" : "Días"
              }`
        }
        variant="warning"
        details={[
          {
            label: dict.retentionEligibleLabel,
            value: String(overview.retentionSettings?.eligibleToPurgeCount ?? 0),
          },
        ]}
        warningTitle={dict.retentionConfirmTitle}
        warningMessage={dict.retentionConfirmDesc}
        confirmText={dict.retentionPurgeCta}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={purgingRetention}
        error={confirmError}
      />
    </div>
  );
}
