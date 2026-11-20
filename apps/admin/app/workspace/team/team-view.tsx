"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Edit3,
  Mail,
  MessageSquare,
  RefreshCw,
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
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";
import {
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@/components/ui/workspace-data-table";

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
  const [limit, setLimit] = useState<number>(initialData?.pagination?.limit || 20);
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
    nextLimit?: number;
  }) => {
    setLoading(true);
    try {
      const q = overrides?.nextQuery ?? query;
      const st = overrides?.nextStatus ?? statusFilter;
      const sb = overrides?.nextSortBy ?? sortBy;
      const sd = overrides?.nextSortDir ?? sortDir;
      const pg = overrides?.nextPage ?? page;
      const lm = overrides?.nextLimit ?? limit;

      const params = new URLSearchParams({
        page: String(pg),
        limit: String(lm),
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

  const tabButtons = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={activeTab === "members" ? "primary" : "outline"}
        onClick={() => setActiveTab("members")}
      >
        {w.teamTabMembers} ({data.pagination.total})
      </Button>

      {isOwner && (
        <Button
          type="button"
          size="sm"
          variant={activeTab === "invitations" ? "primary" : "outline"}
          onClick={() => setActiveTab("invitations")}
        >
          {w.teamTabInvitations} ({data.invitations.length})
        </Button>
      )}
    </div>
  );

  const memberColumns: WorkspaceTableColumn<TeamMemberProfileDto>[] = [
    {
      key: "display_name",
      header: w.teamColName,
      sortable: true,
      renderCell: (m) => (
        <div>
          <p className="font-semibold text-[var(--dsn-text)]">{m.displayName || m.email}</p>
          <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">{m.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: w.teamColRole,
      renderCell: (m) => (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
            m.role === "tenant_owner"
              ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
          }`}
        >
          {m.role === "tenant_owner" ? w.teamRoleOwner : w.teamRoleAgent}
        </span>
      ),
    },
    {
      key: "chatwoot",
      header: w.teamColChatwoot,
      renderCell: (m) => (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
            m.grantChatwootAccess
              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
              : "bg-slate-500/10 text-[var(--dsn-text-secondary)] border-[var(--dsn-border)]"
          }`}
        >
          {m.grantChatwootAccess ? w.teamChatwootEnabled : w.teamChatwootDisabled}
        </span>
      ),
    },
    {
      key: "status",
      header: w.teamColStatus,
      sortable: true,
      renderCell: (m) => (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
            m.status === "active"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}
        >
          {m.status === "active" ? w.teamStatusActive : w.teamStatusSuspended}
        </span>
      ),
    },
    {
      key: "lastAccess",
      header: w.teamColLastAccess,
      renderCell: (m) => (
        <span className="font-mono text-xs text-[var(--dsn-text-secondary)]">
          {m.lastAccessAt ? formatShortDate(m.lastAccessAt) : w.teamNeverAccessed}
        </span>
      ),
    },
    ...(isOwner
      ? [
          {
            key: "actions",
            header: w.teamColActions,
            align: "right" as const,
            renderCell: (m: TeamMemberProfileDto) =>
              m.role !== "tenant_owner" ? (
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
                      onClick={() => setConfirmState({ kind: "reactivate", member: m })}
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
                <span className="text-[11px] text-[var(--dsn-text-secondary)]">—</span>
              ),
          },
        ]
      : []),
  ];

  const invitationColumns: WorkspaceTableColumn<TeamInvitationViewDto>[] = [
    {
      key: "email",
      header: w.teamColInviteEmail,
      sortable: true,
      sortValue: (inv) => inv.displayName || inv.email,
      renderCell: (inv) => (
        <div>
          <p className="font-semibold text-[var(--dsn-text)]">{inv.displayName || inv.email}</p>
          <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">{inv.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: w.teamColRole,
      renderCell: () => (
        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400 border border-cyan-500/20">
          {w.teamRoleAgent}
        </span>
      ),
    },
    {
      key: "chatwoot",
      header: w.teamColChatwoot,
      renderCell: (inv) => (
        <span className="text-[11px] text-[var(--dsn-text-secondary)]">
          {inv.grantChatwootAccess ? w.teamChatwootEnabled : w.teamChatwootDisabled}
        </span>
      ),
    },
    {
      key: "status",
      header: w.teamColInviteStatus,
      renderCell: (inv) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
            inv.status === "pending"
              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}
        >
          <Clock className="h-3 w-3" />
          <span>{inv.status === "pending" ? w.teamInvitePending : w.teamInviteExpired}</span>
        </span>
      ),
    },
    {
      key: "expiresAt",
      header: w.teamColInviteExpires,
      sortable: true,
      sortValue: (inv) => inv.expiresAt,
      renderCell: (inv) => (
        <span className="font-mono text-xs text-[var(--dsn-text-secondary)]">
          {formatShortDate(inv.expiresAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: w.teamColActions,
      align: "right",
      renderCell: (inv) => (
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
            onClick={() => setConfirmState({ kind: "revoke", invitation: inv })}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{w.teamActionRevoke}</span>
          </button>
        </div>
      ),
    },
  ];

  const handleSortServer = (col: string, dir: "asc" | "desc") => {
    const validCol: "joined_at" | "display_name" | "email" | "status" =
      col === "display_name" || col === "email" || col === "status" ? col : "joined_at";
    setSortBy(validCol);
    setSortDir(dir);
    setPage(1);
    void fetchTeam({ nextSortBy: validCol, nextSortDir: dir, nextPage: 1 });
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
      <header className="flex flex-col justify-between gap-4 border-b border-[var(--dsn-border)] pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)] md:text-2xl">
              {w.teamTitle}
            </h1>
            <Badge variant="accent" className="font-mono text-xs font-medium">
              {w.teamBadge}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)] md:text-sm">
            {w.teamSubtitle}
          </p>
        </div>

        {isOwner && (
          <Button
            type="button"
            onClick={openInviteModal}
            disabled={isTeamQuotaFull}
            className="min-h-[44px] md:text-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span>{w.teamInviteCta}</span>
          </Button>
        )}
      </header>

      {/* Banner de Cuotas del Plan */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-[var(--dsn-accent)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                {w.teamQuotaLabel}
              </p>
              <p className="font-mono text-sm font-bold text-[var(--dsn-text)] md:text-base">
                {userQuota.mode === "UNLIMITED"
                  ? `${userQuota.totalConsumed} (${w.teamQuotaUnlimited})`
                  : `${userQuota.totalConsumed} ${w.teamQuotaOf} ${userQuota.limit ?? 0} ${w.teamQuotaAvailable}`}
              </p>
            </div>
          </div>
          {isTeamQuotaFull && isOwner && (
            <Button asChild variant="secondary" size="sm" className="shrink-0 text-[var(--dsn-accent)]">
              <Link href="/workspace/billing">{w.teamUpgradePlanCta}</Link>
            </Button>
          )}
        </Card>

        <Card className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                {w.teamChatwootQuotaLabel}
              </p>
              <p className="font-mono text-sm font-bold text-[var(--dsn-text)] md:text-base">
                {cwQuota.mode === "UNLIMITED"
                  ? `${cwQuota.totalConsumed} (${w.teamQuotaUnlimited})`
                  : `${cwQuota.totalConsumed} ${w.teamQuotaOf} ${cwQuota.limit ?? 0} ${w.teamQuotaAvailable}`}
              </p>
            </div>
          </div>
        </Card>
      </section>

      {isTeamQuotaFull && isOwner && (
        <Alert
          variant="warning"
          className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertDescription>{w.teamQuotaFullNotice}</AlertDescription>
          </div>
          <Link
            href="/workspace/billing"
            className="shrink-0 font-semibold text-amber-200 underline underline-offset-2"
          >
            {w.teamUpgradePlanCta}
          </Link>
        </Alert>
      )}

      {!isOwner && (
        <Alert className="border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)]">
          <Shield className="h-4 w-4 shrink-0 text-[var(--dsn-accent)]" />
          <AlertDescription>{w.teamReadOnlyBanner}</AlertDescription>
        </Alert>
      )}

      {feedback && (
        <Alert
          role="status"
          variant={feedback.type === "success" ? "success" : "error"}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <AlertDescription>{feedback.message}</AlertDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setFeedback(null)}
            className="h-6 w-6 rounded hover:bg-black/10"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Alert>
      )}

      {/* Tablas Estandarizadas de Miembros e Invitaciones */}
      {activeTab === "members" ? (
        <WorkspaceDataTable<TeamMemberProfileDto>
          testId="team-members-table"
          locale={locale}
          data={data.members}
          columns={memberColumns}
          getRowKey={(m) => m.id}
          page={data.pagination.page}
          pageSize={limit}
          totalItems={data.pagination.total}
          onPageChange={(next) => {
            setPage(next);
            void fetchTeam({ nextPage: next });
          }}
          onPageSizeChange={(nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
            void fetchTeam({ nextLimit, nextPage: 1 });
          }}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortServer}
          searchQuery={query}
          onSearchChange={(nextQuery) => {
            setQuery(nextQuery);
            setPage(1);
            void fetchTeam({ nextQuery, nextPage: 1 });
          }}
          searchPlaceholder={w.teamSearchPlaceholder}
          activeFiltersCount={statusFilter !== "all" ? 1 : 0}
          onResetFilters={() => {
            setQuery("");
            setStatusFilter("all");
            setSortBy("joined_at");
            setSortDir("desc");
            setPage(1);
            void fetchTeam({
              nextQuery: "",
              nextStatus: "all",
              nextSortBy: "joined_at",
              nextSortDir: "desc",
              nextPage: 1,
            });
          }}
          loading={loading}
          toolbarLeft={tabButtons}
          filterSlot={
            isOwner ? (
              <Select
                value={statusFilter}
                onChange={(e) => {
                  const nextSt = e.target.value as "all" | "active" | "suspended";
                  setStatusFilter(nextSt);
                  setPage(1);
                  void fetchTeam({ nextStatus: nextSt, nextPage: 1 });
                }}
                aria-label={w.teamColStatus}
                className="w-auto min-h-[40px] text-xs"
              >
                <option value="all">{w.teamFilterAll}</option>
                <option value="active">{w.teamFilterActive}</option>
                <option value="suspended">{w.teamFilterSuspended}</option>
              </Select>
            ) : null
          }
          emptyState={{
            icon: <Users className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto" />,
            title: w.teamEmptyMembers,
          }}
          renderMobileCard={(m) => (
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
                  <span className="text-[var(--dsn-text-secondary)] block">{w.teamColRole}</span>
                  <span className="font-medium text-[var(--dsn-text)]">
                    {m.role === "tenant_owner" ? w.teamRoleOwner : w.teamRoleAgent}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--dsn-text-secondary)] block">{w.teamColChatwoot}</span>
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
          )}
        />
      ) : (
        <WorkspaceDataTable<TeamInvitationViewDto>
          testId="team-invitations-table"
          locale={locale}
          data={data.invitations}
          columns={invitationColumns}
          getRowKey={(inv) => inv.id}
          defaultPageSize={10}
          searchKeys={["email", "displayName"]}
          searchPlaceholder={w.teamSearchPlaceholder}
          toolbarLeft={tabButtons}
          emptyState={{
            icon: <Mail className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto" />,
            title: w.teamEmptyInvitations,
          }}
          renderMobileCard={(inv) => (
            <article
              key={inv.id}
              className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--dsn-text)]">
                    {inv.displayName || inv.email}
                  </p>
                  <p className="text-xs font-mono text-[var(--dsn-text-secondary)]">{inv.email}</p>
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
          )}
        />
      )}

      {/* Modal de Invitación */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!open && !formSubmitting) setInviteOpen(false);
        }}
      >
        <DialogContent
          className="w-full max-w-md rounded-xl p-6"
          closeAriaLabel="Cerrar"
          aria-labelledby="invite-modal-title"
          disableEscapeKeyDown={formSubmitting}
          disableInteractOutside={formSubmitting}
        >
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 pr-8">
            <DialogTitle id="invite-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
              {w.teamInviteModalTitle}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
              {w.teamInviteModalSubtitle}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <Alert variant="error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-invite-email" className="block text-xs font-medium">
                {w.teamFieldEmail}
              </Label>
              <Input
                id="team-invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-invite-name" className="block text-xs font-medium">
                {w.teamFieldDisplayName}
              </Label>
              <Input
                id="team-invite-name"
                type="text"
                maxLength={160}
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-3">
              <Checkbox
                checked={inviteChatwoot}
                onCheckedChange={(checked) => setInviteChatwoot(checked === true)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="block font-medium text-[var(--dsn-text)]">
                  {w.teamFieldChatwootAccess}
                </span>
                <span className="text-[var(--dsn-text-secondary)]">
                  {w.teamFieldChatwootHint}
                </span>
              </span>
            </label>

            <DialogFooter className="border-t border-[var(--dsn-border)] pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={formSubmitting}
                onClick={() => setInviteOpen(false)}
              >
                {w.teamCancelCta}
              </Button>
              <Button
                type="submit"
                disabled={formSubmitting}
                loading={formSubmitting}
                loadingText={w.teamSendingInviteCta}
              >
                {w.teamSendInviteCta}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Edición de Colaborador */}
      <Dialog
        open={Boolean(editingMember)}
        onOpenChange={(open) => {
          if (!open && !formSubmitting) setEditingMember(null);
        }}
      >
        <DialogContent
          className="w-full max-w-md rounded-xl p-6"
          closeAriaLabel="Cerrar"
          aria-labelledby="edit-member-modal-title"
          disableEscapeKeyDown={formSubmitting}
          disableInteractOutside={formSubmitting}
        >
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 pr-8">
            <DialogTitle
              id="edit-member-modal-title"
              className="text-base font-bold text-[var(--dsn-text)]"
            >
              {w.teamEditModalTitle}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
              {w.teamEditModalSubtitle}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <Alert variant="error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-edit-name" className="block text-xs font-medium">
                {w.teamFieldDisplayName}
              </Label>
              <Input
                id="team-edit-name"
                type="text"
                required
                minLength={2}
                maxLength={160}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-3">
              <Checkbox
                checked={editChatwoot}
                onCheckedChange={(checked) => setEditChatwoot(checked === true)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="block font-medium text-[var(--dsn-text)]">
                  {w.teamFieldChatwootAccess}
                </span>
                <span className="text-[var(--dsn-text-secondary)]">
                  {w.teamFieldChatwootHint}
                </span>
              </span>
            </label>

            <DialogFooter className="border-t border-[var(--dsn-border)] pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={formSubmitting}
                onClick={() => setEditingMember(null)}
              >
                {w.teamCancelCta}
              </Button>
              <Button
                type="submit"
                disabled={formSubmitting}
                loading={formSubmitting}
                loadingText={w.teamSavingMemberCta}
              >
                {w.teamSaveMemberCta}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
