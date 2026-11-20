"use client";

import React, { useState } from "react";
import {
  Award,
  Ban,
  Check,
  Copy,
  Globe,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  Send,
  Settings,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import type {
  CommunityInvitationDto,
  TenantCommunitiesOverviewDto,
  TenantCommunityDetailDto,
} from "@mocter/domain";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { formatCommunityDate, readApiError } from "./_types";

interface CommunityNetworkTabProps {
  overview: TenantCommunitiesOverviewDto;
  locale: AdminLocale;
  isOwner: boolean;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onDataMutated: () => Promise<void>;
}

/**
 * Pestaña 4 · Mis Comunidades, Directorio Descubrible, Invitaciones por Código/Slug y Gobernanza de Miembros (`SPEC-15`).
 */
export function CommunityNetworkTab({
  overview,
  locale,
  isOwner,
  onSuccessToast,
  onErrorToast,
  onDataMutated,
}: CommunityNetworkTabProps) {
  const dict = getAdminDictionary(locale).community;

  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [joiningCode, setJoiningCode] = useState(false);

  // Gestión por comunidad (Invitar / Ajustes)
  const [inviteForms, setInviteForms] = useState<
    Record<string, { target: string; role: "member" | "co_leader" }>
  >({});
  const [settingsModalOrg, setSettingsModalOrg] = useState<{
    id: string;
    name: string;
    description: string;
    category: string;
    visibility: "private_invite" | "request_to_join";
    sharePolicy: "leaders_only" | "collaborative";
    requireShareApproval: boolean;
    moderationMode: "pre" | "post" | "none";
  } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Confirmaciones destructivas y acciones sobre invitaciones enviadas
  const [leaveTarget, setLeaveTarget] = useState<TenantCommunityDetailDto | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    org: TenantCommunityDetailDto;
    clientId: string;
    displayName: string;
  } | null>(null);
  const [cancelInviteTarget, setCancelInviteTarget] = useState<{
    orgName: string;
    invitation: CommunityInvitationDto;
  } | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setJoiningCode(true);
    try {
      const res = await fetch("/api/tenant/community/organizations/join-by-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode: inviteCodeInput.trim() }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "Código de invitación inválido."));
        return;
      }
      setInviteCodeInput("");
      await onDataMutated();
      onSuccessToast(
        locale === "en" ? "Joined community successfully!" : "Te uniste a la comunidad correctamente.",
      );
    } catch {
      onErrorToast(dict.networkErrorValidateCode);
    } finally {
      setJoiningCode(false);
    }
  }

  async function handleRespondInvitation(id: string, decision: "accepted" | "rejected") {
    try {
      const res = await fetch(`/api/tenant/community/invitations/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo responder la invitación."));
        return;
      }
      await onDataMutated();
      onSuccessToast(decision === "accepted" ? dict.acceptCta : dict.rejectCta);
    } catch {
      onErrorToast(dict.networkErrorProcessInvite);
    }
  }

  async function handleRespondPromotion(id: string, decision: "accepted" | "rejected") {
    try {
      const res = await fetch(`/api/tenant/community/promotions/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo responder la promoción."));
        return;
      }
      await onDataMutated();
      onSuccessToast(
        decision === "accepted"
          ? locale === "en"
            ? "Promoted to Co-Leader!"
            : "Ahora eres Co-Líder de la comunidad."
          : dict.rejectCta,
      );
    } catch {
      onErrorToast(dict.networkErrorRespondPromotion);
    }
  }

  async function handleRequestJoin(orgId: string) {
    try {
      const res = await fetch(`/api/tenant/community/organizations/${orgId}/request-join`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo enviar la solicitud."));
        return;
      }
      await onDataMutated();
      onSuccessToast(dict.requestPendingBadge);
    } catch {
      onErrorToast(dict.networkErrorRequestJoin);
    }
  }

  async function handleSendInvite(orgId: string, e: React.FormEvent) {
    e.preventDefault();
    const form = inviteForms[orgId];
    if (!form?.target?.trim()) return;

    try {
      const res = await fetch(`/api/tenant/community/organizations/${orgId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetClientSlugOrEmail: form.target.trim(),
          role: form.role || "member",
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo enviar la invitación."));
        return;
      }
      const json = await res.json().catch(() => null);
      setInviteForms((prev) => ({
        ...prev,
        [orgId]: { target: "", role: prev[orgId]?.role ?? "member" },
      }));
      await onDataMutated();
      onSuccessToast(json?.data?.reusedExisting ? dict.inviteReusedToast : dict.inviteSentToast);
    } catch {
      onErrorToast(dict.networkErrorSendInvite);
    }
  }

  async function handleResendInvite(invitationId: string) {
    setResendingInviteId(invitationId);
    try {
      const res = await fetch(`/api/tenant/community/invitations/${invitationId}/resend`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, dict.networkErrorSendInvite));
        return;
      }
      await onDataMutated();
      onSuccessToast(dict.inviteResentToast);
    } catch {
      onErrorToast(dict.networkErrorSendInvite);
    } finally {
      setResendingInviteId(null);
    }
  }

  async function handleConfirmCancelInvite() {
    if (!cancelInviteTarget) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      const res = await fetch(
        `/api/tenant/community/invitations/${cancelInviteTarget.invitation.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) {
        setConfirmError(await readApiError(res, dict.networkErrorGeneric));
        return;
      }
      setCancelInviteTarget(null);
      await onDataMutated();
      onSuccessToast(dict.inviteCancelledToast);
    } catch {
      setConfirmError(dict.networkErrorGeneric);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleReviewRequest(requestId: string, decision: "accepted" | "rejected") {
    try {
      const res = await fetch(`/api/tenant/community/requests/${requestId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo procesar la solicitud."));
        return;
      }
      await onDataMutated();
      onSuccessToast(decision === "accepted" ? dict.acceptCta : dict.rejectCta);
    } catch {
      onErrorToast(dict.networkErrorReviewRequest);
    }
  }

  async function handlePromoteMember(orgId: string, clientId: string) {
    try {
      const res = await fetch(
        `/api/tenant/community/organizations/${orgId}/members/${clientId}/promote`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo enviar la promoción."));
        return;
      }
      await onDataMutated();
      onSuccessToast(
        locale === "en"
          ? "Co-leader promotion proposal sent."
          : "Propuesta de co-líder enviada para aceptación del comercio.",
      );
    } catch {
      onErrorToast(dict.networkErrorPromote);
    }
  }

  async function handleRegenerateCode(orgId: string) {
    try {
      const res = await fetch(`/api/tenant/community/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ regenerateInviteCode: true }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo regenerar el código."));
        return;
      }
      await onDataMutated();
      onSuccessToast(locale === "en" ? "Invite code regenerated." : "Código de invitación regenerado.");
    } catch {
      onErrorToast(dict.networkErrorRegenerateCode);
    }
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      onSuccessToast(`${dict.copyCodeCta}: ${code}`);
    } catch {
      onSuccessToast(code);
    }
  }

  async function handleSaveOrgSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settingsModalOrg) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/tenant/community/organizations/${settingsModalOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: settingsModalOrg.name.trim(),
          description: settingsModalOrg.description.trim() || null,
          category: settingsModalOrg.category.trim() || null,
          visibility: settingsModalOrg.visibility,
          sharePolicy: settingsModalOrg.sharePolicy,
          requireShareApproval: settingsModalOrg.requireShareApproval,
          moderationMode: settingsModalOrg.moderationMode,
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "Error al actualizar ajustes."));
        return;
      }
      setSettingsModalOrg(null);
      await onDataMutated();
      onSuccessToast(locale === "en" ? "Settings saved." : "Configuración guardada.");
    } catch {
      onErrorToast(dict.networkErrorSaveSettings);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleConfirmLeave() {
    if (!leaveTarget) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/tenant/community/organizations/${leaveTarget.id}/leave`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "No fue posible abandonar la comunidad."));
      }
      setLeaveTarget(null);
      await onDataMutated();
      onSuccessToast(
        locale === "en" ? "Left community cleanly." : "Desvinculación completada.",
      );
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleConfirmRemoveMember() {
    if (!removeTarget) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      const res = await fetch(
        `/api/tenant/community/organizations/${removeTarget.org.id}/members/${removeTarget.clientId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) {
        throw new Error(await readApiError(res, "No fue posible retirar al miembro."));
      }
      setRemoveTarget(null);
      await onDataMutated();
      onSuccessToast(locale === "en" ? "Member removed." : "Miembro retirado de la comunidad.");
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Fila superior: Unirse por Código + Bandeja de Invitaciones/Promociones */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {isOwner && (
          <form
            onSubmit={handleJoinByCode}
            className="lg:col-span-5 rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--dsn-accent)]" />
              <span>{dict.joinByCodeTitle}</span>
            </h3>
            <div className="flex gap-2">
              <Input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder={dict.joinByCodePlaceholder}
                className="flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={joiningCode || !inviteCodeInput.trim()}
                loading={joiningCode}
                className="shrink-0"
              >
                {dict.joinByCodeCta}
              </Button>
            </div>
          </form>
        )}

        <div className="lg:col-span-7 rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3">
          <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
            <Mail className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>
              {dict.invitationsTitle} (
              {overview.pendingInvitations.length + overview.pendingPromotions.length})
            </span>
          </h3>

          {overview.pendingInvitations.length === 0 && overview.pendingPromotions.length === 0 ? (
            <p className="text-xs text-[var(--dsn-text-secondary)]">
              {locale === "en"
                ? "No pending invitations or promotions right now."
                : "No tienes invitaciones ni promociones pendientes."}
            </p>
          ) : (
            <div className="space-y-2">
              {overview.pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[var(--dsn-text)]">
                      {inv.organizationName}
                    </span>
                    <span className="ml-2 text-[var(--dsn-text-secondary)]">
                      ({inv.role === "co_leader" ? dict.roleCoLeader : dict.roleMember})
                    </span>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRespondInvitation(inv.id, "accepted")}
                        className="rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        {dict.acceptCta}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRespondInvitation(inv.id, "rejected")}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                      >
                        {dict.rejectCta}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {overview.pendingPromotions.map((promo) => (
                <div
                  key={promo.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-amber-500" />
                    <span className="font-semibold text-[var(--dsn-text)]">
                      {promo.organizationName} — {dict.roleCoLeader}
                    </span>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRespondPromotion(promo.id, "accepted")}
                        className="rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        {dict.acceptCta}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRespondPromotion(promo.id, "rejected")}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                      >
                        {dict.rejectCta}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mis Comunidades Activas */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--dsn-accent)]" />
          <span>
            {dict.tabNetwork} ({overview.myCommunities.length})
          </span>
        </h3>

        {overview.myCommunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-8 text-center text-xs text-[var(--dsn-text-secondary)]">
            {locale === "en"
              ? "Join an existing community below or apply for leader authorization in Leader Studio."
              : "Únete a una comunidad abierta más abajo o solicita permiso para crear la tuya en Estudio del Líder."}
          </div>
        ) : (
          <div className="space-y-4">
            {overview.myCommunities.map((org) => {
              const isOriginator = org.myRole === "originator";
              const isLeadership = isOriginator || org.myRole === "co_leader";
              const invForm = inviteForms[org.id] ?? { target: "", role: "member" as const };

              return (
                <div
                  key={org.id}
                  className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 md:p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-[var(--dsn-text)]">{org.name}</h4>
                        <span className="rounded-full bg-[var(--dsn-accent)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--dsn-accent)]">
                          {org.myRole === "originator"
                            ? dict.roleOriginator
                            : org.myRole === "co_leader"
                              ? dict.roleCoLeader
                              : dict.roleMember}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">
                        {org.visibility === "request_to_join"
                          ? dict.visibilityDiscoverable
                          : dict.visibilityPrivate}{" "}
                        ·{" "}
                        {org.sharePolicy === "collaborative"
                          ? dict.sharePolicyCollaborative
                          : dict.sharePolicyLeaders}{" "}
                        · {org.membersCount} miembros · {org.sharesCount} compartidos
                      </p>
                      {org.description && (
                        <p className="mt-1.5 text-xs text-[var(--dsn-text)]">{org.description}</p>
                      )}
                    </div>

                    {isOwner && (
                      <div className="flex flex-wrap items-center gap-2">
                        {isOriginator && (
                          <button
                            type="button"
                            onClick={() =>
                              setSettingsModalOrg({
                                id: org.id,
                                name: org.name,
                                description: org.description ?? "",
                                category: org.category ?? "",
                                visibility: org.visibility,
                                sharePolicy: org.sharePolicy,
                                requireShareApproval: org.requireShareApproval,
                                moderationMode: org.moderationMode,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                          >
                            <Settings className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                            <span>{locale === "en" ? "Settings" : "Ajustes"}</span>
                          </button>
                        )}

                        {!isOriginator && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmError(null);
                              setLeaveTarget(org);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>{dict.leaveCommunityAction}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Herramientas exclusivas de liderazgo */}
                  {isOwner && isLeadership && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3.5">
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] block">
                          {dict.joinByCodeTitle}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-mono font-bold text-[var(--dsn-accent)]">
                            {org.inviteCode}
                          </code>
                          <button
                            type="button"
                            onClick={() => void handleCopyCode(org.inviteCode)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)]"
                          >
                            <Copy className="h-3 w-3 text-[var(--dsn-accent)]" />
                            <span>{dict.copyCodeCta}</span>
                          </button>
                          {isOriginator && (
                            <button
                              type="button"
                              onClick={() => void handleRegenerateCode(org.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)]"
                            >
                              <RefreshCw className="h-3 w-3 text-[var(--dsn-accent)]" />
                              <span>{dict.regenerateCodeCta}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isOriginator && (
                        <form onSubmit={(e) => handleSendInvite(org.id, e)} className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] block">
                            {dict.inviteMemberTitle}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={invForm.target}
                              onChange={(e) =>
                                setInviteForms((prev) => ({
                                  ...prev,
                                  [org.id]: { ...invForm, target: e.target.value },
                                }))
                              }
                              placeholder={dict.inviteMemberPlaceholder}
                              className="flex-1 min-w-[160px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                            />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--dsn-accent)] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>{dict.sendInviteCta}</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Solicitudes pendientes de admisión (solo originator) */}
                  {isOwner && isOriginator && org.joinRequests.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-200 block">
                        {locale === "en" ? "Pending Join Requests" : "Solicitudes de Ingreso Pendientes"} (
                        {org.joinRequests.length})
                      </span>
                      <div className="space-y-1.5">
                        {org.joinRequests.map((jr) => (
                          <div
                            key={jr.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--dsn-surface)] px-3 py-2 text-xs border border-[var(--dsn-border)]"
                          >
                            <span className="font-semibold text-[var(--dsn-text)]">
                              {jr.clientName} ({jr.clientSlug})
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleReviewRequest(jr.id, "accepted")}
                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1 text-[11px] font-semibold text-white"
                              >
                                <Check className="h-3 w-3" />
                                <span>{dict.acceptCta}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReviewRequest(jr.id, "rejected")}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                              >
                                <XCircle className="h-3 w-3" />
                                <span>{dict.rejectCta}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Registro de invitaciones enviadas (solo originator, RN-SPEC-15-13) */}
                  {isOwner && isOriginator && org.invitations.length > 0 && (
                    <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3 space-y-2">
                      <span className="text-xs font-semibold text-[var(--dsn-text-secondary)] block">
                        {dict.sentInvitationsTitle} ({org.invitations.length})
                      </span>
                      <div className="space-y-1.5">
                        {org.invitations.map((inv) => {
                          const statusLabel =
                            inv.status === "accepted"
                              ? dict.inviteStatusAccepted
                              : inv.status === "rejected"
                                ? dict.inviteStatusRejected
                                : inv.status === "revoked"
                                  ? dict.inviteStatusRevoked
                                  : inv.status === "expired"
                                    ? dict.inviteStatusExpired
                                    : dict.inviteStatusPending;
                          const statusClass =
                            inv.status === "accepted"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : inv.status === "rejected" || inv.status === "revoked"
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                : inv.status === "expired"
                                  ? "bg-slate-500/15 text-[var(--dsn-text-secondary)]"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300";

                          return (
                            <div
                              key={inv.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-[var(--dsn-text)] truncate">
                                    {inv.targetClientName
                                      ? `${inv.targetClientName} (${inv.email})`
                                      : inv.email}
                                  </span>
                                  <span className="rounded-full bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--dsn-text-secondary)]">
                                    {inv.role === "co_leader" ? dict.roleCoLeader : dict.roleMember}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                                  {dict.inviteExpiresLabel}: {formatCommunityDate(inv.expiresAt, locale)}
                                </p>
                              </div>

                              {inv.status === "pending" && (
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={resendingInviteId === inv.id}
                                    onClick={() => void handleResendInvite(inv.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--dsn-text)] disabled:opacity-50"
                                  >
                                    <Send className="h-3 w-3 text-[var(--dsn-accent)]" />
                                    <span>{dict.resendInviteCta}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCancelInviteTarget({ orgName: org.name, invitation: inv })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                                  >
                                    <Ban className="h-3 w-3" />
                                    <span>{dict.cancelInviteCta}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Directorio de Miembros */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[var(--dsn-text-secondary)] block">
                      {locale === "en" ? "Active Members" : "Miembros Activos"} ({org.members.length})
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {org.members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/25 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--dsn-text)] truncate">
                              {m.displayName}
                            </p>
                            <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                              {m.role === "originator"
                                ? dict.roleOriginator
                                : m.role === "co_leader"
                                  ? dict.roleCoLeader
                                  : dict.roleMember}
                            </p>
                          </div>

                          {isOwner && isOriginator && m.role !== "originator" && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {m.role === "member" && (
                                <button
                                  type="button"
                                  onClick={() => void handlePromoteMember(org.id, m.clientId)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2 py-1 text-[11px] font-medium text-[var(--dsn-text)]"
                                >
                                  <Award className="h-3 w-3 text-[var(--dsn-accent)]" />
                                  <span>{dict.promoteCoLeaderCta}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmError(null);
                                  setRemoveTarget({
                                    org,
                                    clientId: m.clientId,
                                    displayName: m.displayName,
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300"
                              >
                                <UserMinus className="h-3 w-3" />
                                <span>{dict.removeMemberCta}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Directorio de Comunidades Descubribles */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
          <Globe className="h-4 w-4 text-[var(--dsn-accent)]" />
          <span>{dict.directoryTitle}</span>
        </h3>

        {overview.directoryCommunities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 text-center text-xs text-[var(--dsn-text-secondary)]">
            {locale === "en"
              ? "No additional public communities available right now."
              : "No hay comunidades descubribles adicionales disponibles en este momento."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {overview.directoryCommunities.map((dir) => (
              <div
                key={dir.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
              >
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[var(--dsn-text)]">{dir.name}</h4>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {dir.originatorName} · {dir.membersCount} miembros · {dir.sharesCount} compartidos
                  </p>
                  {dir.description && (
                    <p className="text-xs text-[var(--dsn-text-secondary)] line-clamp-2 pt-1">
                      {dir.description}
                    </p>
                  )}
                </div>

                {dir.myRequestStatus === "pending" ? (
                  <span className="inline-flex justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {dict.requestPendingBadge}
                  </span>
                ) : (
                  isOwner && (
                    <button
                      type="button"
                      onClick={() => void handleRequestJoin(dir.id)}
                      className="rounded-lg bg-[var(--dsn-accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                    >
                      {dict.requestJoinCta}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal de Ajustes de Comunidad (cierra automáticamente al guardar) */}
      <Dialog
        open={Boolean(settingsModalOrg)}
        onOpenChange={(open) => {
          if (!open && !savingSettings) setSettingsModalOrg(null);
        }}
      >
        <DialogContent
          className="w-full max-w-lg p-5"
          closeAriaLabel={locale === "en" ? "Cancel" : "Cancelar"}
          disableEscapeKeyDown={savingSettings}
          disableInteractOutside={savingSettings}
        >
          {settingsModalOrg && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                  {dict.saveSettingsCta}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSaveOrgSettings} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="block font-medium">{dict.communityNameLabel}</Label>
                  <Input
                    type="text"
                    required
                    value={settingsModalOrg.name}
                    onChange={(e) =>
                      setSettingsModalOrg((prev) => (prev ? { ...prev, name: e.target.value } : null))
                    }
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="block font-medium">{dict.communityDescLabel}</Label>
                  <Textarea
                    rows={2}
                    value={settingsModalOrg.description}
                    onChange={(e) =>
                      setSettingsModalOrg((prev) =>
                        prev ? { ...prev, description: e.target.value } : null,
                      )
                    }
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="block font-medium">{dict.communityVisibilityLabel}</Label>
                    <Select
                      value={settingsModalOrg.visibility}
                      onChange={(e) =>
                        setSettingsModalOrg((prev) =>
                          prev
                            ? {
                                ...prev,
                                visibility: e.target.value as "private_invite" | "request_to_join",
                              }
                            : null,
                        )
                      }
                      className="text-xs"
                    >
                      <option value="private_invite">{dict.visibilityPrivate}</option>
                      <option value="request_to_join">{dict.visibilityDiscoverable}</option>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="block font-medium">{dict.communitySharePolicyLabel}</Label>
                    <Select
                      value={settingsModalOrg.sharePolicy}
                      onChange={(e) =>
                        setSettingsModalOrg((prev) =>
                          prev
                            ? {
                                ...prev,
                                sharePolicy: e.target.value as "leaders_only" | "collaborative",
                              }
                            : null,
                        )
                      }
                      className="text-xs"
                    >
                      <option value="leaders_only">{dict.sharePolicyLeaders}</option>
                      <option value="collaborative">{dict.sharePolicyCollaborative}</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="block font-medium">{dict.communityModerationLabel}</Label>
                  <Select
                    value={settingsModalOrg.moderationMode}
                    onChange={(e) =>
                      setSettingsModalOrg((prev) =>
                        prev
                          ? { ...prev, moderationMode: e.target.value as "pre" | "post" | "none" }
                          : null,
                      )
                    }
                    className="text-xs"
                  >
                    <option value="pre">{dict.moderationPre}</option>
                    <option value="post">{dict.moderationPost}</option>
                    <option value="none">{dict.moderationNone}</option>
                  </Select>
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSettingsModalOrg(null)}
                  >
                    {locale === "en" ? "Cancel" : "Cancelar"}
                  </Button>
                  <Button type="submit" disabled={savingSettings} loading={savingSettings}>
                    {dict.saveSettingsCta}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Confirmación Salir de Comunidad */}
      <ConfirmationModal
        isOpen={Boolean(leaveTarget)}
        onClose={() => !confirmBusy && setLeaveTarget(null)}
        onConfirm={() => void handleConfirmLeave()}
        title={dict.confirmLeaveTitle}
        subtitle={leaveTarget?.name || ""}
        variant="warning"
        details={
          leaveTarget
            ? [
                { label: dict.communityLabel, value: leaveTarget.name },
                { label: dict.communitySharePolicyLabel, value: leaveTarget.originatorName },
              ]
            : []
        }
        warningTitle={dict.confirmLeaveTitle}
        warningMessage={dict.confirmLeaveDesc}
        confirmText={dict.leaveCommunityAction}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={confirmBusy}
        error={confirmError}
      />

      {/* Modal Confirmación Retirar Miembro */}
      <ConfirmationModal
        isOpen={Boolean(removeTarget)}
        onClose={() => !confirmBusy && setRemoveTarget(null)}
        onConfirm={() => void handleConfirmRemoveMember()}
        title={dict.confirmRemoveMemberTitle}
        subtitle={removeTarget?.displayName || ""}
        variant="danger"
        details={
          removeTarget
            ? [
                { label: dict.communityLabel, value: removeTarget.org.name },
                { label: dict.roleMember, value: removeTarget.displayName },
              ]
            : []
        }
        warningTitle={dict.confirmRemoveMemberTitle}
        warningMessage={dict.confirmRemoveMemberDesc}
        confirmText={dict.removeMemberCta}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={confirmBusy}
        error={confirmError}
      />

      {/* Modal Confirmación Cancelar Invitación Enviada */}
      <ConfirmationModal
        isOpen={Boolean(cancelInviteTarget)}
        onClose={() => {
          if (!confirmBusy) {
            setCancelInviteTarget(null);
            setConfirmError(null);
          }
        }}
        onConfirm={() => void handleConfirmCancelInvite()}
        title={dict.confirmCancelInviteTitle}
        subtitle={
          cancelInviteTarget
            ? cancelInviteTarget.invitation.targetClientName || cancelInviteTarget.invitation.email
            : ""
        }
        variant="warning"
        details={
          cancelInviteTarget
            ? [
                { label: dict.communityLabel, value: cancelInviteTarget.orgName },
                { label: dict.inviteExpiresLabel, value: formatCommunityDate(cancelInviteTarget.invitation.expiresAt, locale) },
              ]
            : []
        }
        warningTitle={dict.confirmCancelInviteTitle}
        warningMessage={dict.confirmCancelInviteDesc}
        confirmText={dict.cancelInviteCta}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={confirmBusy}
        error={confirmError}
      />
    </div>
  );
}
