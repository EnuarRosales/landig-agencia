"use client";

import React, { useEffect, useRef, useState } from "react";
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
import { Alert, AlertDescription, Badge, Button, Card, Checkbox, Input, Label } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import {
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@/components/ui/workspace-data-table";

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

function getSeverityBadge(
  severity: TenantInAppNotificationDto["severity"],
  labels: {
    notificationsSeverityCritical: string;
    notificationsSeverityWarning: string;
    notificationsSeveritySuccess: string;
    notificationsSeverityInfo: string;
  },
) {
  switch (severity) {
    case "critical":
      return {
        label: labels.notificationsSeverityCritical,
        className: "bg-rose-500/10 text-rose-500 border-rose-500/20",
        Icon: ShieldAlert,
      };
    case "warning":
      return {
        label: labels.notificationsSeverityWarning,
        className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        Icon: AlertTriangle,
      };
    case "success":
      return {
        label: labels.notificationsSeveritySuccess,
        className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        Icon: CheckCircle2,
      };
    case "info":
    default:
      return {
        label: labels.notificationsSeverityInfo,
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
  const [pageSize, setPageSize] = useState<number>(initialData.limit || 20);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const lastBroadcastedUnreadRef = useRef(initialData.unreadCount);

  useEffect(() => {
    if (lastBroadcastedUnreadRef.current !== data.unreadCount) {
      lastBroadcastedUnreadRef.current = data.unreadCount;
      broadcastUnreadCount(data.unreadCount);
    }
  }, [data.unreadCount]);

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

  async function fetchInboxPage(
    nextPage: number,
    nextUnreadOnly: boolean,
    nextLimit: number = pageSize,
  ) {
    setLoadingInbox(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/tenant/notifications?unreadOnly=${nextUnreadOnly}&page=${nextPage}&limit=${nextLimit}`,
      );
      const json = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.detail || json.error || "No se pudieron cargar las notificaciones.");
      }
      const nextData = json.data as TenantNotificationsResponseDto;
      setData(nextData);
      setPage(nextPage);
      setPageSize(nextData.limit || nextLimit);
      setUnreadOnly(nextUnreadOnly);
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

  const filteredNotifications = data.notifications.filter((item) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q) ||
      item.eventKey.toLowerCase().includes(q)
    );
  });

  const inboxColumns: WorkspaceTableColumn<TenantInAppNotificationDto>[] = [
    {
      key: "title",
      header: dict.notificationsColMessage,
      sortable: true,
      sortValue: (item) => item.title,
      renderCell: (item) => {
        const isUnread = !item.readAt;
        return (
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              {isUnread && (
                <span
                  aria-label={dict.notificationsStatusUnread}
                  className="h-2 w-2 rounded-full bg-[var(--dsn-accent)] shrink-0"
                />
              )}
              <span className="font-semibold text-[var(--dsn-text)]">{item.title}</span>
            </div>
            <p className="text-xs text-[var(--dsn-text-secondary)] line-clamp-2">{item.body}</p>
          </div>
        );
      },
    },
    {
      key: "severity",
      header: dict.notificationsColSeverity,
      sortable: true,
      sortValue: (item) => item.severity,
      renderCell: (item) => {
        const sev = getSeverityBadge(item.severity, dict);
        const SevIcon = sev.Icon;
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${sev.className}`}
          >
            <SevIcon className="h-3 w-3" />
            <span>{sev.label}</span>
          </span>
        );
      },
    },
    {
      key: "createdAt",
      header: dict.notificationsColDate,
      sortable: true,
      sortValue: (item) => item.createdAt,
      renderCell: (item) => (
        <span className="font-mono text-xs text-[var(--dsn-text-secondary)] whitespace-nowrap">
          {new Date(item.createdAt).toLocaleString(locale === "en" ? "en-US" : "es-CO")}
        </span>
      ),
    },
    {
      key: "status",
      header: dict.notificationsColStatus,
      renderCell: (item) => (
        <span className="rounded bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--dsn-text-secondary)] whitespace-nowrap">
          {!item.readAt ? dict.notificationsStatusUnread : dict.notificationsStatusRead}
        </span>
      ),
    },
    {
      key: "actions",
      header: dict.notificationsColActions,
      align: "right",
      renderCell: (item) => {
        const isUnread = !item.readAt;
        return (
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            {item.actionUrl && (
              <Link
                href={item.actionUrl}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
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
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] disabled:opacity-50"
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
        );
      },
    },
  ];

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
                <Badge variant="accent">
                  {data.unreadCount > 99 ? "99+" : data.unreadCount}{" "}
                  {dict.notificationsUnreadBadgeLabel}
                </Badge>
              )}
            </div>
            <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-0.5">
              {dict.notificationsPageSubtitle}
            </p>
          </div>
        </div>

        {activeTab === "inbox" && data.unreadCount > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={markingAll}
            onClick={() => void handleMarkAllRead()}
            className="min-h-[44px]"
          >
            {markingAll ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--dsn-accent)]" />
            ) : (
              <CheckCheck className="h-4 w-4 text-[var(--dsn-accent)]" />
            )}
            <span>{dict.notificationsMarkAllRead}</span>
          </Button>
        )}
      </header>

      {/* Feedback Banner */}
      {feedback && (
        <Alert role="status" variant={feedback.type === "success" ? "success" : "error"}>
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <AlertDescription className="font-medium">{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Pestañas Mobile First */}
      <nav
        aria-label={dict.notificationsPageTitle}
        className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] pb-2"
      >
        <Button
          type="button"
          variant={activeTab === "inbox" ? "secondary" : "ghost"}
          onClick={() => setActiveTab("inbox")}
          className={`min-h-[44px] text-sm ${
            activeTab === "inbox"
              ? "border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]"
              : "text-[var(--dsn-text-secondary)]"
          }`}
        >
          <Inbox className="h-4 w-4" />
          <span>{dict.notificationsTabInbox}</span>
        </Button>

        {data.canManagePreferences && (
          <Button
            type="button"
            variant={activeTab === "preferences" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("preferences")}
            className={`min-h-[44px] text-sm ${
              activeTab === "preferences"
                ? "border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]"
                : "text-[var(--dsn-text-secondary)]"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{dict.notificationsTabPreferences}</span>
          </Button>
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
          <WorkspaceDataTable<TenantInAppNotificationDto>
            testId="notifications-inbox-table"
            locale={locale}
            data={filteredNotifications}
            columns={inboxColumns}
            getRowKey={(item) => item.id}
            page={page}
            pageSize={pageSize}
            totalItems={searchTerm.trim() ? filteredNotifications.length : data.total}
            onPageChange={(nextPage) => void fetchInboxPage(nextPage, unreadOnly, pageSize)}
            onPageSizeChange={(nextLimit) => {
              setPageSize(nextLimit);
              void fetchInboxPage(1, unreadOnly, nextLimit);
            }}
            searchQuery={searchTerm}
            onSearchChange={(q) => setSearchTerm(q)}
            activeFiltersCount={unreadOnly ? 1 : 0}
            onResetFilters={() => {
              setSearchTerm("");
              if (unreadOnly) {
                void fetchInboxPage(1, false, pageSize);
              }
            }}
            loading={loadingInbox}
            emptyState={{
              icon: <Bell className="h-8 w-8 mx-auto text-[var(--dsn-text-secondary)] opacity-60" />,
              title: dict.notificationsEmptyTitle,
              description: dict.notificationsEmptyDesc,
            }}
            toolbarLeft={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!unreadOnly ? "primary" : "outline"}
                  onClick={() => void fetchInboxPage(1, false, pageSize)}
                >
                  {dict.notificationsAllMessages}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={unreadOnly ? "primary" : "outline"}
                  onClick={() => void fetchInboxPage(1, true, pageSize)}
                >
                  {dict.notificationsUnreadOnly}
                </Button>
              </div>
            }
            renderMobileCard={(item) => {
              const sev = getSeverityBadge(item.severity, dict);
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
                  <div className="flex flex-col gap-3">
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
                        <Button
                          type="button"
                          size="sm"
                          disabled={markingId === item.id}
                          onClick={() => void handleMarkRead(item.id)}
                          className="min-h-[36px]"
                        >
                          {markingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          <span>{dict.notificationsMarkRead}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            }}
          />
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

                    <div className="flex shrink-0 flex-wrap items-center gap-5">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--dsn-text)]">
                        <Checkbox
                          checked={draft.inAppEnabled}
                          onCheckedChange={(checked) =>
                            updateDraftPreference(pref.eventKey, {
                              inAppEnabled: checked === true,
                            })
                          }
                        />
                        <span>{dict.notificationsPrefPlatformLabel}</span>
                      </label>

                      <label
                        className={`inline-flex items-center gap-2 text-xs font-medium ${
                          pref.tenantConfigurable
                            ? "cursor-pointer text-[var(--dsn-text)]"
                            : "cursor-not-allowed text-[var(--dsn-text-secondary)] opacity-75"
                        }`}
                      >
                        <Checkbox
                          disabled={!pref.tenantConfigurable}
                          checked={pref.tenantConfigurable ? draft.emailEnabled : true}
                          onCheckedChange={(checked) =>
                            updateDraftPreference(pref.eventKey, {
                              emailEnabled: checked === true,
                            })
                          }
                        />
                        <span>{dict.notificationsPrefEmailLabel}</span>
                      </label>
                    </div>
                  </div>

                  {pref.tenantConfigurable && (
                    <div className="border-t border-[var(--dsn-border)]/60 pt-2">
                      <Label
                        htmlFor={`pref-recipient-${pref.eventKey}`}
                        className="mb-1 block text-xs font-semibold"
                      >
                        {dict.notificationsPrefRecipientLabel}
                      </Label>
                      <div className="relative max-w-md">
                        <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dsn-text-secondary)]" />
                        <Input
                          id={`pref-recipient-${pref.eventKey}`}
                          type="email"
                          placeholder={dict.notificationsPrefRecipientPlaceholder}
                          value={draft.customRecipientEmail}
                          onChange={(e) =>
                            updateDraftPreference(pref.eventKey, {
                              customRecipientEmail: e.target.value,
                            })
                          }
                          className="h-9 py-2 pr-3 pl-9 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={savingPrefs}
              loading={savingPrefs}
              loadingText={dict.notificationsPrefSavingCta}
              className="min-h-[44px] px-5"
            >
              <Save className="h-4 w-4" />
              <span>{dict.notificationsPrefSaveCta}</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
