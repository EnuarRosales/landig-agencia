"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  Inbox,
  ExternalLink,
  Mail,
  Lock,
  Loader2,
  Save,
  Info,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import type {
  TenantInAppNotificationDto,
  TenantNotificationPreferenceDto,
  TenantNotificationsResponseDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

interface TenantNotificationsViewProps {
  initialData: TenantNotificationsResponseDto;
  locale?: AdminLocale;
}

interface EditablePreferenceRow {
  eventKey: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  customRecipientEmail: string;
}

function getSeverityBadge(severity: TenantInAppNotificationDto["severity"]) {
  switch (severity) {
    case "critical":
      return {
        label: "Crítica",
        className: "bg-rose-500/10 text-rose-500 border-rose-500/20",
        Icon: ShieldAlert,
      };
    case "warning":
      return {
        label: "Atención",
        className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        Icon: AlertTriangle,
      };
    case "success":
      return {
        label: "Confirmada",
        className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        Icon: CheckCircle2,
      };
    case "info":
    default:
      return {
        label: "Informativa",
        className: "bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] border-[var(--dsn-accent)]/20",
        Icon: Info,
      };
  }
}

function broadcastUnreadCount(unreadCount: number) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("mocter:notifications-updated", { detail: { unreadCount } }),
    );
  }
}

/**
 * Vista interactiva Mobile First del Centro De Notificaciones del comercio (`/workspace/notifications`).
 */
export function TenantNotificationsView({
  initialData,
  locale = "es",
}: TenantNotificationsViewProps) {
  const dict = getAdminDictionary(locale).workspace;
  const [data, setData] = useState<TenantNotificationsResponseDto>(initialData);
  const [activeTab, setActiveTab] = useState<"inbox" | "preferences">("inbox");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(initialData.page || 1);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const [draftPrefs, setDraftPrefs] = useState<Record<string, EditablePreferenceRow>>(() => {
    const initial: Record<string, EditablePreferenceRow> = {};
    for (const pref of initialData.preferences) {
      initial[pref.eventKey] = {
        eventKey: pref.eventKey,
        emailEnabled: pref.emailEnabled,
        inAppEnabled: pref.inAppEnabled,
        customRecipientEmail: pref.customRecipientEmail ?? "",
      };
    }
    return initial;
  });

  async function fetchInboxPage(nextPage: number, nextUnreadOnly: boolean) {
    setLoadingInbox(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/tenant/notifications?unreadOnly=${nextUnreadOnly}&page=${nextPage}&limit=${data.limit || 20}`,
      );
      const json = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.detail || json.error || "No se pudieron cargar las notificaciones.");
      }
      const nextData = json.data as TenantNotificationsResponseDto;
      setData(nextData);
      setPage(nextPage);
      setUnreadOnly(nextUnreadOnly);
      broadcastUnreadCount(nextData.unreadCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoadingInbox(false);
    }
  }

  async function handleMarkRead(id: string) {
    setMarkingId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/tenant/notifications/${encodeURIComponent(id)}/read`, {
        method: "PATCH",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo marcar como leída.");
      }

      const nowIso = new Date().toISOString();
      setData((prev) => {
        const nextNotifications = prev.notifications.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt ?? nowIso } : n,
        );
        const wasUnread = prev.notifications.some((n) => n.id === id && !n.readAt);
        const nextUnread = wasUnread ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount;
        broadcastUnreadCount(nextUnread);
        return {
          ...prev,
          unreadCount: nextUnread,
          notifications: unreadOnly
            ? nextNotifications.filter((n) => !n.readAt)
            : nextNotifications,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setMarkingId(null);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/tenant/notifications/read-all", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json.detail || json.error || "No se pudieron marcar todas como leídas.",
        );
      }

      const nowIso = new Date().toISOString();
      setData((prev) => ({
        ...prev,
        unreadCount: 0,
        notifications: unreadOnly
          ? []
          : prev.notifications.map((n) => ({ ...n, readAt: n.readAt ?? nowIso })),
      }));
      broadcastUnreadCount(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setMarkingAll(false);
    }
  }

  function updateDraftPreference(
    eventKey: string,
    patch: Partial<EditablePreferenceRow>,
  ) {
    setDraftPrefs((prev) => {
      const current = prev[eventKey] ?? {
        eventKey,
        emailEnabled: true,
        inAppEnabled: true,
        customRecipientEmail: "",
      };
      return {
        ...prev,
        [eventKey]: { ...current, ...patch },
      };
    });
  }

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    if (!data.canManagePreferences) return;
    setSavingPrefs(true);
    setFeedback(null);

    try {
      const items = data.preferences.map((pref) => {
        const draft = draftPrefs[pref.eventKey];
        const rawEmail = draft?.customRecipientEmail?.trim() || "";
        return {
          eventKey: pref.eventKey,
          emailEnabled: pref.tenantConfigurable ? (draft?.emailEnabled ?? pref.emailEnabled) : true,
          inAppEnabled: draft?.inAppEnabled ?? pref.inAppEnabled,
          customRecipientEmail: pref.tenantConfigurable ? rawEmail || null : null,
        };
      });

      const res = await fetch("/api/tenant/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json.detail || json.error || "No se pudieron guardar las preferencias.",
        );
      }

      const updatedPrefs = json.data as TenantNotificationPreferenceDto[];
      setData((prev) => ({ ...prev, preferences: updatedPrefs }));
      const refreshedDrafts: Record<string, EditablePreferenceRow> = {};
      for (const pref of updatedPrefs) {
        refreshedDrafts[pref.eventKey] = {
          eventKey: pref.eventKey,
          emailEnabled: pref.emailEnabled,
          inAppEnabled: pref.inAppEnabled,
          customRecipientEmail: pref.customRecipientEmail ?? "",
        };
      }
      setDraftPrefs(refreshedDrafts);
      setFeedback({ type: "success", message: dict.notificationsPrefSavedMsg });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setSavingPrefs(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.limit || 20)));

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Encabezado Principal */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[var(--dsn-accent)]/15 p-2.5 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/25">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
                {dict.notificationsPageTitle}
              </h1>
              {data.unreadCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-[var(--dsn-accent)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--dsn-accent)]">
                  {data.unreadCount > 99 ? "99+" : data.unreadCount}{" "}
                  {dict.notificationsUnreadBadgeLabel}
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-0.5">
              {dict.notificationsPageSubtitle}
            </p>
          </div>
        </div>

        {activeTab === "inbox" && data.unreadCount > 0 && (
          <button
            type="button"
            disabled={markingAll}
            onClick={() => void handleMarkAllRead()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface-secondary)] disabled:opacity-50"
          >
            {markingAll ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--dsn-accent)]" />
            ) : (
              <CheckCheck className="h-4 w-4 text-[var(--dsn-accent)]" />
            )}
            <span>{dict.notificationsMarkAllRead}</span>
          </button>
        )}
      </header>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border p-4 text-xs font-medium ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
              : "bg-rose-500/10 border-rose-500/20 text-rose-500"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Pestañas Mobile First */}
      <nav
        aria-label={dict.notificationsPageTitle}
        className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] pb-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab("inbox")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "inbox"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Inbox className="h-4 w-4" />
          <span>{dict.notificationsTabInbox}</span>
        </button>

        {data.canManagePreferences && (
          <button
            type="button"
            onClick={() => setActiveTab("preferences")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === "preferences"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{dict.notificationsTabPreferences}</span>
          </button>
        )}
      </nav>

      {/* PESTAÑA 1: CENTRO DE MENSAJES */}
      {activeTab === "inbox" && (
        <section aria-label={dict.notificationsTabInbox} className="space-y-4">
          {!data.canManagePreferences && (
            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-4 py-3 text-xs text-[var(--dsn-text-secondary)] flex items-center gap-2">
              <Info className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
              <span>{dict.notificationsAgentReadOnlyNotice}</span>
            </div>
          )}

          {/* Filtros de Lectura */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchInboxPage(1, false)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                !unreadOnly
                  ? "bg-[var(--dsn-accent)] text-white border-[var(--dsn-accent)]"
                  : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              {dict.notificationsAllMessages}
            </button>
            <button
              type="button"
              onClick={() => void fetchInboxPage(1, true)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                unreadOnly
                  ? "bg-[var(--dsn-accent)] text-white border-[var(--dsn-accent)]"
                  : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              {dict.notificationsUnreadOnly}
            </button>
          </div>

          {loadingInbox ? (
            <div className="flex items-center justify-center rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-xs text-[var(--dsn-text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--dsn-accent)] mr-2" />
              <span>Cargando...</span>
            </div>
          ) : data.notifications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-10 text-center space-y-2">
              <Bell className="h-8 w-8 mx-auto text-[var(--dsn-text-secondary)] opacity-60" />
              <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
                {dict.notificationsEmptyTitle}
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)] max-w-md mx-auto">
                {dict.notificationsEmptyDesc}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.notifications.map((item) => {
                const sev = getSeverityBadge(item.severity);
                const SevIcon = sev.Icon;
                const isUnread = !item.readAt;
                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isUnread
                        ? "border-[var(--dsn-accent)]/40 bg-[var(--dsn-surface)]"
                        : "border-[var(--dsn-border)] bg-[var(--dsn-surface)]/70 opacity-85"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isUnread && (
                            <span
                              aria-label={dict.notificationsStatusUnread}
                              className="h-2 w-2 rounded-full bg-[var(--dsn-accent)] shrink-0"
                            />
                          )}
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${sev.className}`}
                          >
                            <SevIcon className="h-3 w-3" />
                            <span>{sev.label}</span>
                          </span>
                          <span className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                            {new Date(item.createdAt).toLocaleString(locale === "en" ? "en-US" : "es-CO")}
                          </span>
                          <span className="rounded bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--dsn-text-secondary)]">
                            {isUnread ? dict.notificationsStatusUnread : dict.notificationsStatusRead}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[var(--dsn-text)]">{item.title}</h3>
                        <p className="text-xs text-[var(--dsn-text-secondary)] leading-relaxed">
                          {item.body}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {item.actionUrl && (
                          <Link
                            href={item.actionUrl}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                          >
                            <span>{dict.notificationsViewResource}</span>
                            <ExternalLink className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                          </Link>
                        )}
                        {isUnread && (
                          <button
                            type="button"
                            disabled={markingId === item.id}
                            onClick={() => void handleMarkRead(item.id)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] disabled:opacity-50"
                          >
                            {markingId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            <span>{dict.notificationsMarkRead}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loadingInbox}
                    onClick={() => void fetchInboxPage(page - 1, unreadOnly)}
                    className="inline-flex min-h-[36px] items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] disabled:opacity-40"
                  >
                    {dict.notificationsPrevPage}
                  </button>
                  <span className="text-xs font-mono text-[var(--dsn-text-secondary)]">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loadingInbox}
                    onClick={() => void fetchInboxPage(page + 1, unreadOnly)}
                    className="inline-flex min-h-[36px] items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] disabled:opacity-40"
                  >
                    {dict.notificationsNextPage}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA 2: PREFERENCIAS DE ALERTAS (SOLO TENANT_OWNER) */}
      {activeTab === "preferences" && data.canManagePreferences && (
        <form
          onSubmit={handleSavePreferences}
          aria-label={dict.notificationsTabPreferences}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3">
            {data.preferences.map((pref) => {
              const draft = draftPrefs[pref.eventKey] ?? {
                eventKey: pref.eventKey,
                emailEnabled: pref.emailEnabled,
                inAppEnabled: pref.inAppEnabled,
                customRecipientEmail: pref.customRecipientEmail ?? "",
              };

              return (
                <div
                  key={pref.eventKey}
                  className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[var(--dsn-accent)]">
                          {pref.eventKey}
                        </span>
                        {!pref.tenantConfigurable && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                            <Lock className="h-3 w-3" />
                            <span>{dict.notificationsPrefMandatoryBadge}</span>
                          </span>
                        )}
                        {!pref.isEnabledByPlatform && (
                          <span className="inline-flex items-center rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                            {dict.notificationsPrefPausedByPlatform}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--dsn-text-secondary)]">{pref.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 shrink-0">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--dsn-text)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.inAppEnabled}
                          onChange={(e) =>
                            updateDraftPreference(pref.eventKey, {
                              inAppEnabled: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span>{dict.notificationsPrefPlatformLabel}</span>
                      </label>

                      <label
                        className={`inline-flex items-center gap-2 text-xs font-medium ${
                          pref.tenantConfigurable
                            ? "text-[var(--dsn-text)] cursor-pointer"
                            : "text-[var(--dsn-text-secondary)] cursor-not-allowed opacity-75"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!pref.tenantConfigurable}
                          checked={pref.tenantConfigurable ? draft.emailEnabled : true}
                          onChange={(e) =>
                            updateDraftPreference(pref.eventKey, {
                              emailEnabled: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span>{dict.notificationsPrefEmailLabel}</span>
                      </label>
                    </div>
                  </div>

                  {pref.tenantConfigurable && (
                    <div className="pt-2 border-t border-[var(--dsn-border)]/60">
                      <label
                        htmlFor={`pref-recipient-${pref.eventKey}`}
                        className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                      >
                        {dict.notificationsPrefRecipientLabel}
                      </label>
                      <div className="relative max-w-md">
                        <Mail className="h-4 w-4 text-[var(--dsn-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          id={`pref-recipient-${pref.eventKey}`}
                          type="email"
                          placeholder={dict.notificationsPrefRecipientPlaceholder}
                          value={draft.customRecipientEmail}
                          onChange={(e) =>
                            updateDraftPreference(pref.eventKey, {
                              customRecipientEmail: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 py-2 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPrefs}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
            >
              {savingPrefs ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>
                {savingPrefs ? dict.notificationsPrefSavingCta : dict.notificationsPrefSaveCta}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
