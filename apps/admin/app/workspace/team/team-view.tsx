"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownUp,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type {
  TeamInvitationViewDto,
  TeamListResultDto,
  TeamMemberProfileDto,
  WorkspaceTeamMemberDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface TeamViewProps {
  initialData?: TeamListResultDto | null;
  initialMembers?: WorkspaceTeamMemberDto[];
  isOwner?: boolean;
  locale?: AdminLocale;
}

type ConfirmActionState =
  | { kind: "suspend"; member: TeamMemberProfileDto }
  | { kind: "reactivate"; member: TeamMemberProfileDto }
  | { kind: "retire"; member: TeamMemberProfileDto }
  | { kind: "revoke"; invitation: TeamInvitationViewDto }
  | null;

function normalizeInitialTeamData(
  initialData?: TeamListResultDto | null,
  initialMembers?: WorkspaceTeamMemberDto[],
): TeamListResultDto {
  if (initialData) return initialData;

  const mapped: TeamMemberProfileDto[] = (initialMembers ?? []).map((m) => ({
    id: m.id,
    userId: m.userId,
    email: m.email,
    displayName: m.displayName ?? null,
    role: m.role === "tenant_owner" ? "tenant_owner" : "tenant_agent",
    status:
      m.status === "suspended"
        ? "suspended"
        : m.status === "left"
          ? "left"
          : "active",
    grantChatwootAccess: true,
    chatwootAgentId: null,
    joinedAt: m.joinedAt,
    lastAccessAt: null,
  }));

  return {
    members: mapped,
    pagination: {
      page: 1,
      limit: 20,
      total: mapped.length,
      totalPages: 1,
    },
    invitations: [],
    quota: {
      tenantUsers: {
        usedActive: mapped.filter((m) => m.status === "active").length,
        pendingInvitations: 0,
        totalConsumed: mapped.filter((m) => m.status === "active").length,
        limit: null,
        mode: "UNLIMITED",
      },
      chatwootAgents: {
        usedActive: mapped.filter((m) => m.status === "active").length,
        pendingInvitations: 0,
        totalConsumed: mapped.filter((m) => m.status === "active").length,
        limit: null,
        mode: "UNLIMITED",
      },
    },
  };
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.split("T")[0] || iso;
}

/**
 * Vista operativa completa de Equipo de Trabajo (`/workspace/team`, `SPEC-12`).
 *
 * Incluye cuota de plan (`tenant_users` y `chatwoot_agents`), pestañas Miembros / Invitaciones,
 * búsqueda y filtros, paginación, modales de invitación/edición y confirmaciones `--dsn-*`.
 */
export function TeamView({
  initialData = null,
  initialMembers,
  isOwner = true,
  locale = "es",
}: TeamViewProps) {
  const dict = getAdminDictionary(locale);
  const w = dict.workspace;

  const [data, setData] = useState<TeamListResultDto>(() =>
    normalizeInitialTeamData(initialData, initialMembers),
  );
  const [activeTab, setActiveTab] = useState<"members" | "invitations">("members");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [sortBy, setSortBy] = useState<"joined_at" | "display_name" | "email" | "status">("joined_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modal de Invitar / Editar
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteChatwoot, setInviteChatwoot] = useState(true);
  const [editingMember, setEditingMember] = useState<TeamMemberProfileDto | null>(null);
  const [editName, setEditName] = useState("");
  const [editChatwoot, setEditChatwoot] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal de confirmación accesible `--dsn-*`
  const [confirmState, setConfirmState] = useState<ConfirmActionState>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const userQuota = data.quota.tenantUsers;
  const cwQuota = data.quota.chatwootAgents;
  const isTeamQuotaFull =
    userQuota.mode === "LIMITED" &&
    userQuota.limit !== null &&
    userQuota.totalConsumed >= userQuota.limit;

  const fetchTeam = async (overrides?: {
    nextQuery?: string;
    nextStatus?: "all" | "active" | "suspended";
    nextSortBy?: "joined_at" | "display_name" | "email" | "status";
    nextSortDir?: "asc" | "desc";
    nextPage?: number;
  }) => {
    setLoading(true);
    try {
      const q = overrides?.nextQuery ?? query;
      const st = overrides?.nextStatus ?? statusFilter;
      const sb = overrides?.nextSortBy ?? sortBy;
      const sd = overrides?.nextSortDir ?? sortDir;
      const pg = overrides?.nextPage ?? page;

      const params = new URLSearchParams({
        page: String(pg),
        limit: "20",
        status: st,
        sortBy: sb,
        sortDir: sd,
      });
      if (q.trim()) params.set("q", q.trim());

      const res = await workspaceFetch<TeamListResultDto>(`/api/tenant/team?${params.toString()}`);
      if (res.ok && res.data) {
        setData(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const openInviteModal = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteChatwoot(true);
    setFormError(null);
    setInviteOpen(true);
  };

  const openEditModal = (member: TeamMemberProfileDto) => {
    setEditingMember(member);
    setEditName(member.displayName || "");
    setEditChatwoot(member.grantChatwootAccess);
    setFormError(null);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);
    try {
      const res = await workspaceFetch("/api/tenant/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          displayName: inviteName.trim() || undefined,
          role: "tenant_agent",
          grantChatwootAccess: inviteChatwoot,
        }),
      });
      if (!res.ok) {
        setFormError(res.error || "No se pudo enviar la invitación.");
        return;
      }
      setInviteOpen(false);
      setActiveTab("invitations");
      setFeedback({ type: "success", message: w.teamInviteSuccess });
      await fetchTeam({ nextPage: 1 });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setFormError(null);
    setFormSubmitting(true);
    try {
      const res = await workspaceFetch(`/api/tenant/team/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editName.trim(),
          grantChatwootAccess: editChatwoot,
        }),
      });
      if (!res.ok) {
        setFormError(res.error || "No se pudo actualizar el colaborador.");
        return;
      }
      setEditingMember(null);
      setFeedback({ type: "success", message: w.teamEditSuccess });
      await fetchTeam();
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleResendInvitation = async (inv: TeamInvitationViewDto) => {
    setResendingId(inv.id);
    setFeedback(null);
    try {
      const res = await workspaceFetch(`/api/tenant/team/invitations/${inv.id}/resend`, {
        method: "POST",
      });
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: res.error || "No se pudo reenviar la invitación.",
        });
        return;
      }
      setFeedback({ type: "success", message: w.teamResendSuccess });
      await fetchTeam();
    } finally {
      setResendingId(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    setConfirmError(null);
    setConfirmLoading(true);
    try {
      let res: { ok: boolean; data?: unknown; error?: string };
      let successMsg = "";

      if (confirmState.kind === "suspend") {
        res = await workspaceFetch(`/api/tenant/team/${confirmState.member.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "suspended" }),
        });
        successMsg = w.teamSuspendSuccess;
      } else if (confirmState.kind === "reactivate") {
        res = await workspaceFetch(`/api/tenant/team/${confirmState.member.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        successMsg = w.teamReactivateSuccess;
      } else if (confirmState.kind === "retire") {
        res = await workspaceFetch(`/api/tenant/team/${confirmState.member.id}`, {
          method: "DELETE",
        });
        successMsg = w.teamRetireSuccess;
      } else {
        res = await workspaceFetch(
          `/api/tenant/team/invitations/${confirmState.invitation.id}`,
          { method: "DELETE" },
        );
        successMsg = w.teamRevokeSuccess;
      }

      if (!res.ok) {
        setConfirmError(res.error || "No se pudo completar la operación.");
        return;
      }

      setConfirmState(null);
      setFeedback({ type: "success", message: successMsg });
      await fetchTeam();
    } finally {
      setConfirmLoading(false);
    }
  };

  const toggleSort = (col: "joined_at" | "display_name" | "email" | "status") => {
    const nextDir: "asc" | "desc" =
      sortBy === col && sortDir === "asc" ? "desc" : "asc";
    setSortBy(col);
    setSortDir(nextDir);
    void fetchTeam({ nextSortBy: col, nextSortDir: nextDir, nextPage: 1 });
  };

  const confirmModalConfig = (() => {
    if (!confirmState) return null;
    if (confirmState.kind === "suspend") {
      return {
        title: w.teamSuspendTitle,
        subtitle: w.teamSuspendSubtitle,
        variant: "warning" as const,
        warningTitle: w.teamSuspendWarningTitle,
        warningMessage: w.teamSuspendWarningMsg,
        confirmText: w.teamSuspendConfirmCta,
        details: [
          {
            label: w.teamDetailUserLabel,
            value: confirmState.member.displayName || confirmState.member.email,
          },
          { label: w.teamDetailEmailLabel, value: confirmState.member.email, mono: true },
        ],
      };
    }
    if (confirmState.kind === "reactivate") {
      return {
        title: w.teamReactivateTitle,
        subtitle: w.teamReactivateSubtitle,
        variant: "neutral" as const,
        warningTitle: w.teamReactivateWarningTitle,
        warningMessage: w.teamReactivateWarningMsg,
        confirmText: w.teamReactivateConfirmCta,
        details: [
          {
            label: w.teamDetailUserLabel,
            value: confirmState.member.displayName || confirmState.member.email,
          },
          { label: w.teamDetailEmailLabel, value: confirmState.member.email, mono: true },
        ],
      };
    }
    if (confirmState.kind === "retire") {
      return {
        title: w.teamRetireTitle,
        subtitle: w.teamRetireSubtitle,
        variant: "danger" as const,
        warningTitle: w.teamRetireWarningTitle,
        warningMessage: w.teamRetireWarningMsg,
        confirmText: w.teamRetireConfirmCta,
        details: [
          {
            label: w.teamDetailUserLabel,
            value: confirmState.member.displayName || confirmState.member.email,
          },
          { label: w.teamDetailEmailLabel, value: confirmState.member.email, mono: true },
        ],
      };
    }
    return {
      title: w.teamRevokeTitle,
      subtitle: w.teamRevokeSubtitle,
      variant: "danger" as const,
      warningTitle: w.teamRevokeWarningTitle,
      warningMessage: w.teamRevokeWarningMsg,
      confirmText: w.teamRevokeConfirmCta,
      details: [
        { label: w.teamDetailEmailLabel, value: confirmState.invitation.email, mono: true },
        {
          label: w.teamDetailExpiresLabel,
          value: formatShortDate(confirmState.invitation.expiresAt),
          mono: true,
        },
      ],
    };
  })();

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Cabecera */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {w.teamTitle}
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] border border-cyan-500/20">
              {w.teamBadge}
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            {w.teamSubtitle}
          </p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={openInviteModal}
            disabled={isTeamQuotaFull}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs md:text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="h-4 w-4" />
            <span>{w.teamInviteCta}</span>
          </button>
        )}
      </header>

      {/* Banner de Cuotas del Plan */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[var(--dsn-accent)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                {w.teamQuotaLabel}
              </p>
              <p className="text-sm md:text-base font-bold text-[var(--dsn-text)] font-mono">
                {userQuota.mode === "UNLIMITED"
                  ? `${userQuota.totalConsumed} (${w.teamQuotaUnlimited})`
                  : `${userQuota.totalConsumed} ${w.teamQuotaOf} ${userQuota.limit ?? 0} ${w.teamQuotaAvailable}`}
              </p>
            </div>
          </div>
          {isTeamQuotaFull && isOwner && (
            <Link
              href="/workspace/billing"
              className="shrink-0 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs font-semibold text-[var(--dsn-accent)] hover:opacity-90"
            >
              {w.teamUpgradePlanCta}
            </Link>
          )}
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                {w.teamChatwootQuotaLabel}
              </p>
              <p className="text-sm md:text-base font-bold text-[var(--dsn-text)] font-mono">
                {cwQuota.mode === "UNLIMITED"
                  ? `${cwQuota.totalConsumed} (${w.teamQuotaUnlimited})`
                  : `${cwQuota.totalConsumed} ${w.teamQuotaOf} ${cwQuota.limit ?? 0} ${w.teamQuotaAvailable}`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {isTeamQuotaFull && isOwner && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{w.teamQuotaFullNotice}</span>
          </div>
          <Link
            href="/workspace/billing"
            className="font-semibold underline underline-offset-2 text-amber-200 shrink-0"
          >
            {w.teamUpgradePlanCta}
          </Link>
        </div>
      )}

      {!isOwner && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-4 py-3 text-xs text-[var(--dsn-text-secondary)]">
          <Shield className="h-4 w-4 shrink-0 text-[var(--dsn-accent)]" />
          <span>{w.teamReadOnlyBanner}</span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
            feedback.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded hover:bg-black/10"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Pestañas + Barra de Filtros */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-4 md:px-5 pt-4 border-b border-[var(--dsn-border)] flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("members")}
              className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === "members"
                  ? "bg-[var(--dsn-accent)] text-white"
                  : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              {w.teamTabMembers} ({data.pagination.total})
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={() => setActiveTab("invitations")}
                className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "invitations"
                    ? "bg-[var(--dsn-accent)] text-white"
                    : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                }`}
              >
                {w.teamTabInvitations} ({data.invitations.length})
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="h-4 w-4 text-[var(--dsn-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  setPage(1);
                  void fetchTeam({ nextQuery: val, nextPage: 1 });
                }}
                placeholder={w.teamSearchPlaceholder}
                aria-label={w.teamSearchPlaceholder}
                className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] pl-9 pr-3 py-1.5 text-xs text-[var(--dsn-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dsn-accent)]"
              />
            </div>

            {activeTab === "members" && isOwner && (
              <select
                value={statusFilter}
                onChange={(e) => {
                  const nextSt = e.target.value as "all" | "active" | "suspended";
                  setStatusFilter(nextSt);
                  setPage(1);
                  void fetchTeam({ nextStatus: nextSt, nextPage: 1 });
                }}
                aria-label={w.teamColStatus}
                className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-1.5 text-xs text-[var(--dsn-text)]"
              >
                <option value="all">{w.teamFilterAll}</option>
                <option value="active">{w.teamFilterActive}</option>
                <option value="suspended">{w.teamFilterSuspended}</option>
              </select>
            )}
          </div>
        </div>

        {/* Contenido Pestaña Miembros */}
        {activeTab === "members" && (
          <>
            {data.members.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
                <p className="text-sm font-medium text-[var(--dsn-text-secondary)]">
                  {w.teamEmptyMembers}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile First Tarjetas (< 768px) */}
                <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                  {data.members.map((m) => (
                    <article
                      key={m.id}
                      className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--dsn-text)]">
                            {m.displayName || m.email}
                          </p>
                          <p className="text-xs font-mono text-[var(--dsn-text-secondary)]">
                            {m.email}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                            m.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {m.status === "active" ? w.teamStatusActive : w.teamStatusSuspended}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[var(--dsn-text-secondary)] block">
                            {w.teamColRole}
                          </span>
                          <span className="font-medium text-[var(--dsn-text)]">
                            {m.role === "tenant_owner" ? w.teamRoleOwner : w.teamRoleAgent}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--dsn-text-secondary)] block">
                            {w.teamColChatwoot}
                          </span>
                          <span className="font-medium text-[var(--dsn-text)]">
                            {m.grantChatwootAccess ? w.teamChatwootEnabled : w.teamChatwootDisabled}
                          </span>
                        </div>
                      </div>

                      {isOwner && m.role !== "tenant_owner" && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--dsn-border)]">
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="min-h-[38px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)]"
                          >
                            {w.teamActionEdit}
                          </button>
                          {m.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => setConfirmState({ kind: "suspend", member: m })}
                              className="min-h-[38px] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400"
                            >
                              {w.teamActionSuspend}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmState({ kind: "reactivate", member: m })}
                              className="min-h-[38px] rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400"
                            >
                              {w.teamActionReactivate}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmState({ kind: "retire", member: m })}
                            className="min-h-[38px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400"
                          >
                            {w.teamActionRetire}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                {/* Tabla Escritorio */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                      <tr>
                        <th className="px-4 py-3 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort("display_name")}
                            className="inline-flex items-center gap-1 hover:text-[var(--dsn-text)]"
                          >
                            <span>{w.teamColName}</span>
                            <ArrowDownUp className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-4 py-3 font-medium">{w.teamColRole}</th>
                        <th className="px-4 py-3 font-medium">{w.teamColChatwoot}</th>
                        <th className="px-4 py-3 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort("status")}
                            className="inline-flex items-center gap-1 hover:text-[var(--dsn-text)]"
                          >
                            <span>{w.teamColStatus}</span>
                            <ArrowDownUp className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-4 py-3 font-medium">{w.teamColLastAccess}</th>
                        {isOwner && (
                          <th className="px-4 py-3 font-medium text-right">{w.teamColActions}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                      {data.members.map((m) => (
                        <tr
                          key={m.id}
                          className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[var(--dsn-text)]">
                              {m.displayName || m.email}
                            </p>
                            <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                              {m.email}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                m.role === "tenant_owner"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                  : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                              }`}
                            >
                              {m.role === "tenant_owner" ? w.teamRoleOwner : w.teamRoleAgent}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                m.grantChatwootAccess
                                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                                  : "bg-slate-500/10 text-[var(--dsn-text-secondary)] border-[var(--dsn-border)]"
                              }`}
                            >
                              {m.grantChatwootAccess
                                ? w.teamChatwootEnabled
                                : w.teamChatwootDisabled}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                m.status === "active"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}
                            >
                              {m.status === "active"
                                ? w.teamStatusActive
                                : w.teamStatusSuspended}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                            {m.lastAccessAt
                              ? formatShortDate(m.lastAccessAt)
                              : w.teamNeverAccessed}
                          </td>
                          {isOwner && (
                            <td className="px-4 py-3 text-right">
                              {m.role !== "tenant_owner" ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(m)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                                  >
                                    <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                                    <span>{w.teamActionEdit}</span>
                                  </button>
                                  {m.status === "active" ? (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmState({ kind: "suspend", member: m })}
                                      className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20"
                                    >
                                      <Ban className="h-3.5 w-3.5" />
                                      <span>{w.teamActionSuspend}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmState({ kind: "reactivate", member: m })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                                    >
                                      <UserCheck className="h-3.5 w-3.5" />
                                      <span>{w.teamActionReactivate}</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setConfirmState({ kind: "retire", member: m })}
                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>{w.teamActionRetire}</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                                  —
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Paginación */}
            {data.pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[var(--dsn-border)] flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
                <span>
                  {w.teamPaginationPage} {data.pagination.page} {w.teamPaginationOf}{" "}
                  {data.pagination.totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => {
                      const next = Math.max(1, page - 1);
                      setPage(next);
                      void fetchTeam({ nextPage: next });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1.5 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>{w.teamPaginationPrev}</span>
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.pagination.totalPages || loading}
                    onClick={() => {
                      const next = Math.min(data.pagination.totalPages, page + 1);
                      setPage(next);
                      void fetchTeam({ nextPage: next });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1.5 disabled:opacity-50"
                  >
                    <span>{w.teamPaginationNext}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Contenido Pestaña Invitaciones Pendientes */}
        {activeTab === "invitations" && isOwner && (
          <>
            {data.invitations.length === 0 ? (
              <div className="p-10 text-center">
                <Mail className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
                <p className="text-sm font-medium text-[var(--dsn-text-secondary)]">
                  {w.teamEmptyInvitations}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                  {data.invitations.map((inv) => (
                    <article
                      key={inv.id}
                      className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--dsn-text)]">
                            {inv.displayName || inv.email}
                          </p>
                          <p className="text-xs font-mono text-[var(--dsn-text-secondary)]">
                            {inv.email}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                            inv.status === "pending"
                              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {inv.status === "pending" ? w.teamInvitePending : w.teamInviteExpired}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[var(--dsn-text-secondary)]">
                        {w.teamColInviteExpires}: {formatShortDate(inv.expiresAt)}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--dsn-border)]">
                        <button
                          type="button"
                          disabled={resendingId === inv.id}
                          onClick={() => void handleResendInvitation(inv)}
                          className="min-h-[38px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)]"
                        >
                          {w.teamActionResend}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmState({ kind: "revoke", invitation: inv })}
                          className="min-h-[38px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400"
                        >
                          {w.teamActionRevoke}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                      <tr>
                        <th className="px-4 py-3 font-medium">{w.teamColInviteEmail}</th>
                        <th className="px-4 py-3 font-medium">{w.teamColRole}</th>
                        <th className="px-4 py-3 font-medium">{w.teamColChatwoot}</th>
                        <th className="px-4 py-3 font-medium">{w.teamColInviteStatus}</th>
                        <th className="px-4 py-3 font-medium">{w.teamColInviteExpires}</th>
                        <th className="px-4 py-3 font-medium text-right">{w.teamColActions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                      {data.invitations.map((inv) => (
                        <tr
                          key={inv.id}
                          className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[var(--dsn-text)]">
                              {inv.displayName || inv.email}
                            </p>
                            <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                              {inv.email}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400 border border-cyan-500/20">
                              {w.teamRoleAgent}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                              {inv.grantChatwootAccess
                                ? w.teamChatwootEnabled
                                : w.teamChatwootDisabled}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                inv.status === "pending"
                                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              <span>
                                {inv.status === "pending"
                                  ? w.teamInvitePending
                                  : w.teamInviteExpired}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                            {formatShortDate(inv.expiresAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={resendingId === inv.id}
                                onClick={() => void handleResendInvitation(inv)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] disabled:opacity-50"
                              >
                                <RefreshCw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                                <span>{w.teamActionResend}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({ kind: "revoke", invitation: inv })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>{w.teamActionRevoke}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* Modal de Invitación */}
      {inviteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--dsn-border)] pb-3">
              <div>
                <h2
                  id="invite-modal-title"
                  className="text-base font-bold text-[var(--dsn-text)]"
                >
                  {w.teamInviteModalTitle}
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  {w.teamInviteModalSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="p-1.5 rounded-lg text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="team-invite-email"
                  className="block text-xs font-medium text-[var(--dsn-text)]"
                >
                  {w.teamFieldEmail}
                </label>
                <input
                  id="team-invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="team-invite-name"
                  className="block text-xs font-medium text-[var(--dsn-text)]"
                >
                  {w.teamFieldDisplayName}
                </label>
                <input
                  id="team-invite-name"
                  type="text"
                  maxLength={160}
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inviteChatwoot}
                  onChange={(e) => setInviteChatwoot(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--dsn-accent)]"
                />
                <span className="text-xs">
                  <span className="font-medium text-[var(--dsn-text)] block">
                    {w.teamFieldChatwootAccess}
                  </span>
                  <span className="text-[var(--dsn-text-secondary)]">
                    {w.teamFieldChatwootHint}
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--dsn-border)]">
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => setInviteOpen(false)}
                  className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-medium text-[var(--dsn-text)]"
                >
                  {w.teamCancelCta}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="min-h-[40px] rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {formSubmitting ? w.teamSendingInviteCta : w.teamSendInviteCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edición de Colaborador */}
      {editingMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-member-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--dsn-border)] pb-3">
              <div>
                <h2
                  id="edit-member-modal-title"
                  className="text-base font-bold text-[var(--dsn-text)]"
                >
                  {w.teamEditModalTitle}
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  {w.teamEditModalSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 rounded-lg text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="team-edit-name"
                  className="block text-xs font-medium text-[var(--dsn-text)]"
                >
                  {w.teamFieldDisplayName}
                </label>
                <input
                  id="team-edit-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={160}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editChatwoot}
                  onChange={(e) => setEditChatwoot(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--dsn-accent)]"
                />
                <span className="text-xs">
                  <span className="font-medium text-[var(--dsn-text)] block">
                    {w.teamFieldChatwootAccess}
                  </span>
                  <span className="text-[var(--dsn-text-secondary)]">
                    {w.teamFieldChatwootHint}
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--dsn-border)]">
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={() => setEditingMember(null)}
                  className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-medium text-[var(--dsn-text)]"
                >
                  {w.teamCancelCta}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="min-h-[40px] rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {formSubmitting ? w.teamSavingMemberCta : w.teamSaveMemberCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación Accesible `--dsn-*` */}
      {confirmModalConfig && (
        <ConfirmationModal
          isOpen={Boolean(confirmState)}
          onClose={() => {
            if (!confirmLoading) {
              setConfirmState(null);
              setConfirmError(null);
            }
          }}
          onConfirm={handleConfirmAction}
          title={confirmModalConfig.title}
          subtitle={confirmModalConfig.subtitle}
          variant={confirmModalConfig.variant}
          details={confirmModalConfig.details}
          warningTitle={confirmModalConfig.warningTitle}
          warningMessage={confirmModalConfig.warningMessage}
          confirmText={confirmModalConfig.confirmText}
          cancelText={w.teamCancelCta}
          loading={confirmLoading}
          error={confirmError}
        />
      )}
    </div>
  );
}
