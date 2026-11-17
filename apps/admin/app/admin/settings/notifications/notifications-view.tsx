"use client";

import React, { useState } from "react";
import {
  Mail,
  Server,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit3,
  ShieldCheck,
  Send,
  Loader2,
  X,
  Lock,
  Eye,
  BellRing,
  LayoutTemplate,
  Save,
} from "lucide-react";
import type { AdminEmailSettingsDto } from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { EmailRichTextEditor } from "@/components/email-rich-text-editor";

type AdminEmailEventDto = AdminEmailSettingsDto["events"][number];
type AdminEmailTemplateDto = AdminEmailSettingsDto["templates"][number];
type AdminEmailSenderDto = AdminEmailSettingsDto["senders"][number];
type EmailLocaleCode = "es" | "en";

interface BilingualLocaleDraftState {
  id: string;
  subject: string;
  bodyHtml: string;
}

interface BilingualTemplateFormState {
  eventKey: string;
  senderId: string;
  status: "published" | "draft";
  translations: Record<EmailLocaleCode, BilingualLocaleDraftState>;
}

function isEditorContentEmpty(rawHtml: string): boolean {
  const trimmed = rawHtml.trim();
  if (!trimmed) return true;
  if (/<(img|a|hr|table|button)\b/i.test(trimmed)) return false;
  return trimmed.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").trim().length === 0;
}

function resolveLatestTemplateForLocale(
  templates: AdminEmailTemplateDto[],
  eventKey: string,
  locale: EmailLocaleCode,
): AdminEmailTemplateDto | undefined {
  const matches = templates.filter((t) => t.eventKey === eventKey && t.locale === locale);
  if (matches.length === 0) return undefined;
  return (
    matches.find((t) => t.status === "published") ||
    [...matches].sort((a, b) => b.version - a.version)[0]
  );
}

function resolveEventTemplateSummary(
  ev: AdminEmailEventDto,
  templates: AdminEmailTemplateDto[],
  senders: AdminEmailSenderDto[],
) {
  const esTpl = resolveLatestTemplateForLocale(templates, ev.key, "es");
  const enTpl = resolveLatestTemplateForLocale(templates, ev.key, "en");
  const primaryTpl = esTpl || enTpl;
  const matchedSender =
    senders.find((s) => s.id === primaryTpl?.senderId) ||
    senders.find((s) => s.key === ev.defaultSenderKey) ||
    senders[0];

  return {
    esTpl,
    enTpl,
    senderId: primaryTpl?.senderId || matchedSender?.id || "",
    senderName: primaryTpl?.senderName || matchedSender?.fromName || "Remitente Oficial",
    senderEmail: primaryTpl?.senderEmail || matchedSender?.fromEmail || "—",
    esSubject: esTpl?.subject || "",
    enSubject: enTpl?.subject || "",
  };
}

function buildBilingualFormForEvent(
  eventKey: string,
  settings: AdminEmailSettingsDto,
): BilingualTemplateFormState {
  const evMeta = settings.events.find((e) => e.key === eventKey);
  const summary = evMeta
    ? resolveEventTemplateSummary(evMeta, settings.templates, settings.senders)
    : null;
  const hasPublished =
    summary?.esTpl?.status === "published" || summary?.enTpl?.status === "published";
  const hasAny = Boolean(summary?.esTpl || summary?.enTpl);

  return {
    eventKey,
    senderId: summary?.senderId || settings.senders[0]?.id || "",
    status: !hasAny || hasPublished ? "published" : "draft",
    translations: {
      es: {
        id: summary?.esTpl?.id || "",
        subject: summary?.esTpl?.subject || "",
        bodyHtml: summary?.esTpl?.bodyHtml || "",
      },
      en: {
        id: summary?.enTpl?.id || "",
        subject: summary?.enTpl?.subject || "",
        bodyHtml: summary?.enTpl?.bodyHtml || "",
      },
    },
  };
}

interface EventGroupConfig {
  id: string;
  title: string;
  events: AdminEmailEventDto[];
}

function groupAdminEvents(events: AdminEmailEventDto[]): EventGroupConfig[] {
  const inventoryGroup: AdminEmailEventDto[] = [];
  const billingGroup: AdminEmailEventDto[] = [];
  const teamCommunityGroup: AdminEmailEventDto[] = [];
  const authPlatformGroup: AdminEmailEventDto[] = [];

  for (const ev of events) {
    if (ev.key.includes("inventory") || ev.key.includes("stock")) {
      inventoryGroup.push(ev);
    } else if (ev.category === "billing") {
      billingGroup.push(ev);
    } else if (
      ev.category === "community" ||
      ev.category === "referral" ||
      ev.key.startsWith("team.") ||
      ev.key === "tenant.welcome"
    ) {
      teamCommunityGroup.push(ev);
    } else {
      authPlatformGroup.push(ev);
    }
  }

  return [
    { id: "inventory", title: "Inventario y Productos", events: inventoryGroup },
    { id: "billing", title: "Facturación y Bre-B", events: billingGroup },
    { id: "team_community", title: "Equipo, Comercios y Comunidad", events: teamCommunityGroup },
    { id: "auth_platform", title: "Autenticación y Plataforma", events: authPlatformGroup },
  ].filter((g) => g.events.length > 0);
}

function sanitizePreviewFragment(rawHtml: string): string {
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function renderSafeTemplatePreviewHtml(
  rawHtml: string,
  variablesSchema: string[],
  layout?: { headerHtml: string; footerHtml: string; isEnabled: boolean } | null,
): string {
  const sanitizedBody = sanitizePreviewFragment(rawHtml).replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key: string) => {
      const label = variablesSchema.includes(key) ? key : `${key}`;
      return `<span style="background:rgba(99,102,241,0.14);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12px;">[${label}]</span>`;
    },
  );

  if (!layout || !layout.isEnabled) {
    return sanitizedBody;
  }

  const currentYear = String(new Date().getFullYear());
  const interpolateLayout = (raw: string) =>
    sanitizePreviewFragment(raw)
      .replace(/\{\{\s*brand_name\s*\}\}/g, "Mocter")
      .replace(/\{\{\s*year\s*\}\}/g, currentYear);

  const safeHeader = layout.headerHtml.trim() ? interpolateLayout(layout.headerHtml) : "";
  const safeFooter = layout.footerHtml.trim() ? interpolateLayout(layout.footerHtml) : "";

  return [
    '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">',
    safeHeader ? `<div>${safeHeader}</div>` : "",
    `<div style="padding:24px;line-height:1.6;">${sanitizedBody}</div>`,
    safeFooter ? `<div>${safeFooter}</div>` : "",
    "</div>",
  ]
    .filter(Boolean)
    .join("");
}

interface NotificationsViewProps {
  initialData: AdminEmailSettingsDto;
}

export function NotificationsView({ initialData }: NotificationsViewProps) {
  const [data, setData] = useState<AdminEmailSettingsDto>(initialData);
  const [activeTab, setActiveTab] = useState<"smtp" | "senders" | "templates" | "layout">("smtp");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modales
  const [smtpModalOpen, setSmtpModalOpen] = useState(false);
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templatePreviewMode, setTemplatePreviewMode] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [pendingDisableEvent, setPendingDisableEvent] = useState<AdminEmailEventDto | null>(null);
  const [toggleLoadingKey, setToggleLoadingKey] = useState<string | null>(null);

  const initialEsLayout = initialData.layoutConfigs?.find((l) => l.locale === "es") ?? {
    id: "",
    locale: "es" as const,
    headerHtml: "",
    footerHtml: "",
    isEnabled: true,
  };
  const [layoutLocale, setLayoutLocale] = useState<"es" | "en">("es");
  const [layoutForm, setLayoutForm] = useState({
    headerHtml: initialEsLayout.headerHtml,
    footerHtml: initialEsLayout.footerHtml,
    isEnabled: initialEsLayout.isEnabled,
  });
  const [savingLayout, setSavingLayout] = useState(false);

  // Formularios
  const [smtpForm, setSmtpForm] = useState({
    id: data.provider?.id || "",
    name: data.provider?.name || "Pasarela SMTP Principal Mocter",
    host: data.provider?.host || "smtp.hostinger.com",
    port: data.provider?.port || 587,
    secure: data.provider?.secure || false,
    username: data.provider?.username || "soporte@mocter.co",
    password: "",
  });

  const [senderForm, setSenderForm] = useState({
    id: "",
    key: "",
    fromName: "",
    fromEmail: "",
    replyTo: "",
    providerId: data.provider?.id || "",
    isDefault: false,
  });

  const [templateForm, setTemplateForm] = useState<BilingualTemplateFormState>(() =>
    buildBilingualFormForEvent(data.events[0]?.key || "auth.verify_email", data),
  );
  const [templateModalLocale, setTemplateModalLocale] = useState<EmailLocaleCode>("es");
  const [templateModalError, setTemplateModalError] = useState<string | null>(null);

  const [testForm, setTestForm] = useState({
    recipient: "soporte@mocter.co",
  });
  const [testError, setTestError] = useState<string | null>(null);

  async function reloadData() {
    try {
      const res = await fetch("/api/admin/notifications");
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch {
      // Ignorar fallo secundario de recarga
    }
  }

  async function handleSaveSmtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_provider",
          ...smtpForm,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo actualizar el servidor SMTP");
      }

      setFeedback({ type: "success", message: "Servidor SMTP guardado y cifrado con éxito (AES-256-GCM)." });
      setSmtpModalOpen(false);
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSender(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_sender",
          ...senderForm,
          providerId: senderForm.providerId || data.provider?.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar la dirección remitente");
      }

      setFeedback({ type: "success", message: "Dirección remitente institucional registrada con éxito." });
      setSenderModalOpen(false);
      setSenderForm({
        id: "",
        key: "",
        fromName: "",
        fromEmail: "",
        replyTo: "",
        providerId: data.provider?.id || "",
        isDefault: false,
      });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setTemplateModalError(null);
    setFeedback(null);

    if (!templateForm.eventKey || !templateForm.senderId) {
      setTemplateModalError("El evento del sistema y el remitente vinculado son obligatorios.");
      return;
    }

    let completedCount = 0;
    for (const loc of ["es", "en"] as const) {
      const draft = templateForm.translations[loc];
      const hasSubj = draft.subject.trim().length > 0;
      const hasBody = !isEditorContentEmpty(draft.bodyHtml);
      if (hasSubj !== hasBody) {
        const label = loc === "es" ? "Español (ES)" : "Inglés (EN)";
        setTemplateModalError(
          `En ${label} debes completar tanto el Asunto como el Cuerpo del correo, o dejar ambos vacíos.`,
        );
        return;
      }
      if (hasSubj && hasBody) {
        completedCount += 1;
      }
    }

    if (completedCount === 0) {
      setTemplateModalError(
        "Debes completar el Asunto y el Cuerpo del correo en al menos un idioma (ES o EN).",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_bilingual_template",
          eventKey: templateForm.eventKey,
          senderId: templateForm.senderId,
          status: templateForm.status,
          translations: templateForm.translations,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar la plantilla");
      }

      const savedLocales: string[] = Array.isArray(json.data?.savedLocales)
        ? json.data.savedLocales.map((l: string) => l.toUpperCase())
        : [];
      setFeedback({
        type: "success",
        message:
          savedLocales.length > 0
            ? `Plantilla bilingüe de ${templateForm.eventKey} guardada (${savedLocales.join(", ")}) con remitente sincronizado.`
            : "Plantilla de correo vinculada exitosamente al remitente y a la funcionalidad.",
      });
      setTemplateModalOpen(false);
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTemplateModalError(msg);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  async function executeToggleEvent(eventKey: string, nextEnabled: boolean) {
    setToggleLoadingKey(eventKey);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_event",
          eventKey,
          isEnabled: nextEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo cambiar el estado del evento");
      }

      setData((prev) => ({
        ...prev,
        events: prev.events.map((ev) =>
          ev.key === eventKey ? { ...ev, isEnabled: nextEnabled } : ev,
        ),
      }));
      setFeedback({
        type: "success",
        message: nextEnabled
          ? `Evento ${eventKey} activado correctamente.`
          : `Evento ${eventKey} desactivado correctamente.`,
      });
      setPendingDisableEvent(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setToggleLoadingKey(null);
    }
  }

  function handleRequestToggleEvent(ev: AdminEmailEventDto) {
    if (ev.isSystem) return;
    const nextEnabled = !ev.isEnabled;
    if (!nextEnabled && (!ev.tenantConfigurable || ev.category === "billing")) {
      setPendingDisableEvent(ev);
      return;
    }
    void executeToggleEvent(ev.key, nextEnabled);
  }

  function openEditTemplateForEvent(eventKey: string, initialLocale: EmailLocaleCode = "es") {
    setTemplatePreviewMode(false);
    setTemplateModalError(null);
    setTemplateModalLocale(initialLocale);
    setTemplateForm(buildBilingualFormForEvent(eventKey, data));
    setTemplateModalOpen(true);
  }

  const eventGroups = groupAdminEvents(data.events);

  function handleSelectLayoutLocale(nextLocale: "es" | "en") {
    setLayoutLocale(nextLocale);
    const match = data.layoutConfigs?.find((l) => l.locale === nextLocale);
    setLayoutForm({
      headerHtml: match?.headerHtml ?? "",
      footerHtml: match?.footerHtml ?? "",
      isEnabled: match?.isEnabled ?? true,
    });
  }

  async function handleSaveGlobalLayout(e: React.FormEvent) {
    e.preventDefault();
    setSavingLayout(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_layout",
          locale: layoutLocale,
          headerHtml: layoutForm.headerHtml,
          footerHtml: layoutForm.footerHtml,
          isEnabled: layoutForm.isEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar el encabezado y pie global.");
      }

      setFeedback({
        type: "success",
        message: `Encabezado y pie institucional (${layoutLocale.toUpperCase()}) actualizados correctamente.`,
      });
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setSavingLayout(false);
    }
  }

  const selectedEvent = data.events.find((ev) => ev.key === templateForm.eventKey);

  return (
    <div className="space-y-6">
      {/* Banner de Feedback */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl p-4 text-xs font-medium border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-inherit opacity-70 hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Selector de Pestañas Mobile First */}
      <nav
        aria-label="Pestañas de Configuración de Correo"
        className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] pb-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab("smtp")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "smtp"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Server className="h-4 w-4" />
          <span>Servidores SMTP</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("senders")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "senders"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Mail className="h-4 w-4" />
          <span>Direcciones Remitentes ({data.senders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "templates"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Plantillas y Eventos ({data.events.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("layout")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "layout"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <LayoutTemplate className="h-4 w-4" />
          <span>Encabezado y Pie Global</span>
        </button>
      </nav>

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 1: SERVIDORES SMTP (email_provider_configs)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "smtp" && (
        <section aria-labelledby="heading-smtp" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-smtp" className="text-base font-bold text-[var(--dsn-text)]">
                Pasarela de Envío SMTP Corporativa
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Servidor de transporte transaccional con cifrado simétrico AES-256-GCM para credenciales de acceso.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { setTestError(null); setTestModalOpen(true); }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface-secondary)]"
              >
                <Send className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>Probar Envío</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmtpForm({
                    id: data.provider?.id || "",
                    name: data.provider?.name || "Pasarela SMTP Principal Mocter",
                    host: data.provider?.host || "smtp.hostinger.com",
                    port: data.provider?.port || 587,
                    secure: data.provider?.secure || false,
                    username: data.provider?.username || "soporte@mocter.co",
                    password: "",
                  });
                  setSmtpModalOpen(true);
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Configurar Servidor SMTP</span>
              </button>
            </div>
          </div>

          {/* Tarjeta del Servidor Activo */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
            {data.provider ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                    Nombre Del Proveedor
                  </span>
                  <p className="text-sm font-semibold text-[var(--dsn-text)]">{data.provider.name}</p>
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Estado: {data.provider.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                    Servidor Host y Puerto
                  </span>
                  <p className="text-sm font-mono text-[var(--dsn-text)]">
                    {data.provider.host}:{data.provider.port}
                  </p>
                  <span className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">
                    {data.provider.secure ? "Cifrado SSL Directo" : "STARTTLS Estándar"}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                    Usuario De Autenticación
                  </span>
                  <p className="text-sm font-mono text-[var(--dsn-text)] truncate">
                    {data.provider.username || "—"}
                  </p>
                  <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                    Conductor: {data.provider.driver.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                    Contraseña De Servidor
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm tracking-widest text-[var(--dsn-text)]">
                      ••••••••
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> AES-256-GCM
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
                    Protegido por AAD y llave k1
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-[var(--dsn-text)]">
                  No hay servidor SMTP configurado
                </p>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Haz clic en &quot;Configurar Servidor SMTP&quot; para ingresar las credenciales oficiales de la SaaS.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 2: DIRECCIONES REMITENTES (email_senders)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "senders" && (
        <section aria-labelledby="heading-senders" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-senders" className="text-base font-bold text-[var(--dsn-text)]">
                Direcciones De Correo Electrónico Oficiales
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Cuentas remitentes autorizadas de la SaaS vinculadas al servidor SMTP para envío y respuesta.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSenderForm({
                  id: "",
                  key: "",
                  fromName: "",
                  fromEmail: "",
                  replyTo: "soporte@mocter.co",
                  providerId: data.provider?.id || "",
                  isDefault: false,
                });
                setSenderModalOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Registrar Nueva Dirección Remitente</span>
            </button>
          </div>

          {/* Tabla de Remitentes */}
          <div className="overflow-x-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]">
            <table className="w-full text-left text-xs text-[var(--dsn-text)]">
              <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Identificador Clave</th>
                  <th scope="col" className="px-4 py-3">Nombre Visible</th>
                  <th scope="col" className="px-4 py-3">Correo Remitente</th>
                  <th scope="col" className="px-4 py-3">Correo De Respuesta</th>
                  <th scope="col" className="px-4 py-3">Servidor SMTP</th>
                  <th scope="col" className="px-4 py-3">Predeterminado</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {data.senders.length > 0 ? (
                  data.senders.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-[var(--dsn-surface-secondary)]/30">
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--dsn-accent)]">
                        {s.key}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--dsn-text)]">{s.fromName}</td>
                      <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                        {s.fromEmail}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                        {s.replyTo || "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--dsn-text-secondary)]">{s.providerName}</td>
                      <td className="px-4 py-3">
                        {s.isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Principal
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
                            Secundario
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSenderForm({
                              id: s.id,
                              key: s.key,
                              fromName: s.fromName,
                              fromEmail: s.fromEmail,
                              replyTo: s.replyTo || "",
                              providerId: s.providerId,
                              isDefault: s.isDefault,
                            });
                            setSenderModalOpen(true);
                          }}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/10"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--dsn-text-secondary)]">
                      No hay direcciones remitentes registradas aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 3: PLANTILLAS Y EVENTOS (email_events + email_templates)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <section aria-labelledby="heading-templates" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-templates" className="text-base font-bold text-[var(--dsn-text)]">
                Eventos del Sistema y Plantillas Vinculadas
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Activa o desactiva eventos globalmente y gestiona remitente, asuntos y cuerpo en español e inglés desde una única fila por funcionalidad.
              </p>
            </div>

            <button
              type="button"
              onClick={() => openEditTemplateForEvent(data.events[0]?.key || "auth.verify_email", "es")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nueva Plantilla Vinculada</span>
            </button>
          </div>

          {/* Catálogo Unificado por Secciones Funcionales (sin duplicar filas por idioma) */}
          <div className="space-y-4">
            {eventGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <h3 className="text-xs font-bold text-[var(--dsn-text)]">{group.title}</h3>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                    {group.events.length} {group.events.length === 1 ? "evento" : "eventos"}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-[var(--dsn-text)]">
                    <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Funcionalidad / Evento</th>
                        <th scope="col" className="px-4 py-2.5">Remitente Vinculado</th>
                        <th scope="col" className="px-4 py-2.5">Idiomas y Versión</th>
                        <th scope="col" className="px-4 py-2.5">Asunto del Correo</th>
                        <th scope="col" className="px-4 py-2.5">Notificación Activa</th>
                        <th scope="col" className="px-4 py-2.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--dsn-border)]">
                      {group.events.map((ev) => {
                        const isBusy = toggleLoadingKey === ev.key;
                        const summary = resolveEventTemplateSummary(ev, data.templates, data.senders);
                        const localeEntries: Array<{ code: EmailLocaleCode; tpl?: AdminEmailTemplateDto }> = [
                          { code: "es", tpl: summary.esTpl },
                          { code: "en", tpl: summary.enTpl },
                        ];

                        return (
                          <tr
                            key={ev.key}
                            className="transition-colors hover:bg-[var(--dsn-surface-secondary)]/20"
                          >
                            <td className="px-4 py-3 align-top min-w-[220px]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-semibold text-[var(--dsn-accent)]">
                                  {ev.key}
                                </span>
                                {ev.isSystem ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-slate-500/15 px-2 py-0.5 text-[10px] font-medium text-[var(--dsn-text-secondary)]">
                                    <Lock className="h-3 w-3" />
                                    Sistema
                                  </span>
                                ) : !ev.tenantConfigurable ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                                    Obligatoria
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                                    Configurable
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                                {ev.description}
                              </p>
                            </td>

                            <td className="px-4 py-3 align-top whitespace-nowrap">
                              <div className="flex items-start gap-1.5">
                                <Mail className="h-3.5 w-3.5 mt-0.5 text-emerald-400 shrink-0" />
                                <div>
                                  <p className="font-medium text-[var(--dsn-text)]">
                                    {summary.senderName}
                                  </p>
                                  <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                                    {summary.senderEmail}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top whitespace-nowrap">
                              <div className="flex flex-col gap-1.5">
                                {localeEntries.map(({ code, tpl }) => {
                                  if (!tpl) {
                                    return (
                                      <span
                                        key={code}
                                        className="inline-flex w-fit items-center gap-1.5 rounded bg-slate-500/10 px-2 py-0.5 text-[10px] font-mono text-[var(--dsn-text-secondary)]"
                                      >
                                        <span className="uppercase font-semibold">{code}</span>
                                        <span>· Pendiente</span>
                                      </span>
                                    );
                                  }
                                  const isPublished = tpl.status === "published";
                                  return (
                                    <span
                                      key={code}
                                      className={`inline-flex w-fit items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-mono ${
                                        isPublished
                                          ? "bg-emerald-500/10 text-emerald-400"
                                          : "bg-amber-500/10 text-amber-400"
                                      }`}
                                    >
                                      <span className="uppercase font-semibold">{code}</span>
                                      <span>· v{tpl.version}</span>
                                      <span>· {isPublished ? "Publicada" : "Borrador"}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top max-w-xs">
                              {summary.esSubject ? (
                                <p className="font-medium text-[var(--dsn-text)] truncate" title={summary.esSubject}>
                                  <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)] mr-1">
                                    ES:
                                  </span>
                                  {summary.esSubject}
                                </p>
                              ) : null}
                              {summary.enSubject ? (
                                <p
                                  className="text-[11px] text-[var(--dsn-text-secondary)] truncate mt-0.5"
                                  title={summary.enSubject}
                                >
                                  <span className="font-mono text-[10px] mr-1">EN:</span>
                                  {summary.enSubject}
                                </p>
                              ) : null}
                              {!summary.esSubject && !summary.enSubject && (
                                <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                                  Sin asunto configurado
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 align-top whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={ev.isEnabled}
                                  aria-label={`Notificación Activa para ${ev.key}`}
                                  disabled={ev.isSystem || isBusy}
                                  onClick={() => handleRequestToggleEvent(ev)}
                                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-[var(--dsn-accent)] disabled:opacity-50 disabled:cursor-not-allowed ${
                                    ev.isEnabled
                                      ? "bg-[var(--dsn-accent)] border-[var(--dsn-accent)]"
                                      : "bg-[var(--dsn-surface-secondary)] border-[var(--dsn-border)]"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                      ev.isEnabled ? "translate-x-6" : "translate-x-1"
                                    }`}
                                  />
                                </button>
                                <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                                  {ev.isEnabled ? "Activa" : "Desactivada"}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditTemplateForEvent(ev.key, "es")}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                              >
                                <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                                <span>Editar Plantilla</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 4: ENCABEZADO Y PIE GLOBAL (email_layout_configs)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "layout" && (
        <section aria-labelledby="heading-layout" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-layout" className="text-base font-bold text-[var(--dsn-text)]">
                Encabezado y Pie de Página Institucional
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Configura por única vez el encabezado y pie global que heredan automáticamente todas las notificaciones del sistema.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectLayoutLocale("es")}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                  layoutLocale === "es"
                    ? "bg-[var(--dsn-accent)] text-white border-[var(--dsn-accent)]"
                    : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
                }`}
              >
                Español (es)
              </button>
              <button
                type="button"
                onClick={() => handleSelectLayoutLocale("en")}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                  layoutLocale === "en"
                    ? "bg-[var(--dsn-accent)] text-white border-[var(--dsn-accent)]"
                    : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
                }`}
              >
                Inglés (en)
              </button>
            </div>
          </div>

          <form
            onSubmit={handleSaveGlobalLayout}
            className="space-y-5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5"
          >
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div>
                <p className="text-xs font-semibold text-[var(--dsn-text)]">
                  Herencia Automática en Plantillas
                </p>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  Envuelve automáticamente el cuerpo específico de cada correo con este encabezado y pie institucional.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--dsn-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={layoutForm.isEnabled}
                  onChange={(e) =>
                    setLayoutForm((prev) => ({ ...prev, isEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                />
                <span>{layoutForm.isEnabled ? "Activo" : "Inactivo"}</span>
              </label>
            </div>

            <EmailRichTextEditor
              id="layout-header-editor"
              label="Encabezado Global del Correo (body.header)"
              fieldKey="email.layout_header"
              value={layoutForm.headerHtml}
              onChange={(html) => setLayoutForm((prev) => ({ ...prev, headerHtml: html }))}
              locale={layoutLocale}
              availableVariables={["brand_name"]}
              minHeightClass="min-h-[120px]"
            />

            <EmailRichTextEditor
              id="layout-footer-editor"
              label="Pie de Página Global del Correo (body.footer)"
              fieldKey="email.layout_footer"
              value={layoutForm.footerHtml}
              onChange={(html) => setLayoutForm((prev) => ({ ...prev, footerHtml: html }))}
              locale={layoutLocale}
              availableVariables={["brand_name", "year"]}
              minHeightClass="min-h-[120px]"
            />

            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-[var(--dsn-text)]">
                Vista Previa de Identidad Completa
              </p>
              <div
                className="rounded-xl border border-[var(--dsn-border)] bg-slate-100 p-4 overflow-x-auto"
                dangerouslySetInnerHTML={{
                  __html: renderSafeTemplatePreviewHtml(
                    layoutLocale === "en"
                      ? "<p>Hello <strong>Customer</strong>,</p><p>This area renders each template's specific notification body while automatically inheriting your global header and footer.</p>"
                      : "<p>Hola <strong>Cliente</strong>,</p><p>En esta sección central se renderiza el cuerpo específico de cada notificación heredando automáticamente el encabezado y pie institucional.</p>",
                    [],
                    layoutForm,
                  ),
                }}
              />
            </div>

            <div className="flex justify-end border-t border-[var(--dsn-border)] pt-4">
              <button
                type="submit"
                disabled={savingLayout}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
              >
                {savingLayout ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>Guardar Encabezado y Pie Global</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: CONFIGURAR SERVIDOR SMTP (Title Case estricto)
         ───────────────────────────────────────────────────────────── */}
      {smtpModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-smtp-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-smtp-title" className="text-base font-bold text-[var(--dsn-text)]">
                  Configurar Servidor SMTP
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSmtpModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSmtp} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="smtp-name"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Nombre Identificador del Servidor
                </label>
                <input
                  id="smtp-name"
                  type="text"
                  required
                  value={smtpForm.name}
                  onChange={(e) => setSmtpForm({ ...smtpForm, name: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="smtp-host"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Dirección Host del Servidor
                  </label>
                  <input
                    id="smtp-host"
                    type="text"
                    required
                    value={smtpForm.host}
                    onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="smtp-port"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Puerto de Conexión
                  </label>
                  <input
                    id="smtp-port"
                    type="number"
                    required
                    value={smtpForm.port}
                    onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="smtp-secure"
                  type="checkbox"
                  checked={smtpForm.secure}
                  onChange={(e) => setSmtpForm({ ...smtpForm, secure: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                />
                <label
                  htmlFor="smtp-secure"
                  className="text-xs font-semibold text-[var(--dsn-text)]"
                >
                  Conexión Segura SSL Directa (Puerto 465)
                </label>
              </div>

              <div>
                <label
                  htmlFor="smtp-user"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Usuario de Autenticación
                </label>
                <input
                  id="smtp-user"
                  type="text"
                  value={smtpForm.username}
                  onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="smtp-password"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Contraseña o Secreto SMTP
                </label>
                <input
                  id="smtp-password"
                  type="password"
                  placeholder={data.provider?.hasPassword ? "•••••••• (Sin cambios)" : "Ingresa contraseña"}
                  value={smtpForm.password}
                  onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
                <p className="mt-1 text-[10px] text-[var(--dsn-text-secondary)]">
                  Se cifrará inmediatamente con AES-256-GCM y nunca se enviará en texto plano al navegador.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setSmtpModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Configuración SMTP</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: REGISTRAR / EDITAR DIRECCIÓN REMITENTE
         ───────────────────────────────────────────────────────────── */}
      {senderModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-sender-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-sender-title" className="text-base font-bold text-[var(--dsn-text)]">
                  {senderForm.id ? "Editar Dirección Remitente" : "Registrar Dirección Remitente"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSenderModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSender} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sender-key"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Identificador Clave
                  </label>
                  <input
                    id="sender-key"
                    type="text"
                    required
                    placeholder="ej. facturacion, soporte"
                    value={senderForm.key}
                    onChange={(e) => setSenderForm({ ...senderForm, key: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sender-name"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Nombre Visible del Remitente
                  </label>
                  <input
                    id="sender-name"
                    type="text"
                    required
                    placeholder="ej. Facturación Mocter"
                    value={senderForm.fromName}
                    onChange={(e) => setSenderForm({ ...senderForm, fromName: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sender-email"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Correo Electrónico Remitente
                  </label>
                  <input
                    id="sender-email"
                    type="email"
                    required
                    placeholder="ej. facturacion@mocter.co"
                    value={senderForm.fromEmail}
                    onChange={(e) => setSenderForm({ ...senderForm, fromEmail: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sender-replyto"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Correo de Respuesta (Reply-To)
                  </label>
                  <input
                    id="sender-replyto"
                    type="email"
                    placeholder="ej. soporte@mocter.co"
                    value={senderForm.replyTo}
                    onChange={(e) => setSenderForm({ ...senderForm, replyTo: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="sender-provider"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Servidor SMTP Vinculado
                </label>
                <select
                  id="sender-provider"
                  required
                  value={senderForm.providerId}
                  onChange={(e) => setSenderForm({ ...senderForm, providerId: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                >
                  {data.provider && (
                    <option value={data.provider.id}>
                      {data.provider.name} ({data.provider.host}:{data.provider.port})
                    </option>
                  )}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="sender-default"
                  type="checkbox"
                  checked={senderForm.isDefault}
                  onChange={(e) => setSenderForm({ ...senderForm, isDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                />
                <label
                  htmlFor="sender-default"
                  className="text-xs font-semibold text-[var(--dsn-text)]"
                >
                  Establecer como Dirección Remitente Predeterminada
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setSenderModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Dirección Remitente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: CREAR / EDITAR PLANTILLA VINCULADA (REGLA OBLIGATORIA)
         ───────────────────────────────────────────────────────────── */}
      {templateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-template-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-template-title" className="text-base font-bold text-[var(--dsn-text)]">
                  {templateForm.translations.es.id || templateForm.translations.en.id
                    ? "Editar Plantilla Vinculada"
                    : "Nueva Plantilla de Correo Vinculada"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="mt-4 space-y-4">
              {templateModalError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{templateModalError}</span>
                </div>
              )}

              {/* Cabecera compartida para la funcionalidad */}
              <div>
                <label
                  htmlFor="template-event"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Funcionalidad o Evento del Sistema (Obligatorio)
                </label>
                <select
                  id="template-event"
                  required
                  value={templateForm.eventKey}
                  onChange={(e) => {
                    setTemplateModalError(null);
                    setTemplatePreviewMode(false);
                    setTemplateForm(buildBilingualFormForEvent(e.target.value, data));
                  }}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                >
                  {data.events.map((ev) => (
                    <option key={ev.key} value={ev.key}>
                      [{ev.category.toUpperCase()}] {ev.key} — {ev.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="template-sender"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Dirección Remitente Vinculada (Obligatorio)
                  </label>
                  <select
                    id="template-sender"
                    required
                    value={templateForm.senderId}
                    onChange={(e) => setTemplateForm({ ...templateForm, senderId: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  >
                    {data.senders.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fromName} &lt;{s.fromEmail}&gt; ({s.key}) {s.isDefault ? "★ Predeterminada" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-[var(--dsn-text-secondary)]">
                    Compartida automáticamente entre todos los idiomas configurados para este evento.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="template-status"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Estado de Publicación
                  </label>
                  <select
                    id="template-status"
                    value={templateForm.status}
                    onChange={(e) =>
                      setTemplateForm({
                        ...templateForm,
                        status: e.target.value === "draft" ? "draft" : "published",
                      })
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  >
                    <option value="published">Publicada</option>
                    <option value="draft">Borrador</option>
                  </select>
                </div>
              </div>

              {/* Bloque Bilingüe en una Misma Vista (Español / Inglés) */}
              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dsn-border)] pb-3">
                  <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Idiomas de la Plantilla">
                    {(["es", "en"] as const).map((loc) => {
                      const draft = templateForm.translations[loc];
                      const hasSubj = draft.subject.trim().length > 0;
                      const hasBody = !isEditorContentEmpty(draft.bodyHtml);
                      const statusBadge =
                        hasSubj && hasBody
                          ? "Listo"
                          : hasSubj || hasBody
                            ? "Incompleto"
                            : "Pendiente";
                      const badgeTone =
                        hasSubj && hasBody
                          ? "bg-emerald-500/15 text-emerald-400"
                          : hasSubj || hasBody
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-slate-500/15 text-[var(--dsn-text-secondary)]";
                      const isActive = templateModalLocale === loc;

                      return (
                        <button
                          key={loc}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => {
                            setTemplateModalLocale(loc);
                            setTemplateModalError(null);
                          }}
                          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                            isActive
                              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]"
                              : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                          }`}
                        >
                          <span>{loc === "es" ? "Español (ES)" : "Inglés (EN)"}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${badgeTone}`}>
                            {statusBadge}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setTemplatePreviewMode((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                  >
                    <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    <span>{templatePreviewMode ? "Volver al Editor" : "Vista Previa Completa"}</span>
                  </button>
                </div>

                <div>
                  <label
                    htmlFor={`template-subject-${templateModalLocale}`}
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Asunto del Correo Electrónico ({templateModalLocale === "es" ? "Español" : "Inglés"})
                  </label>
                  <input
                    id={`template-subject-${templateModalLocale}`}
                    type="text"
                    placeholder={
                      templateModalLocale === "es"
                        ? "ej. Bienvenido a Mocter · Tu espacio está listo"
                        : "e.g. Welcome to Mocter · Your workspace is ready"
                    }
                    value={templateForm.translations[templateModalLocale].subject}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        translations: {
                          ...prev.translations,
                          [templateModalLocale]: {
                            ...prev.translations[templateModalLocale],
                            subject: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>

                <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)]/70 px-3 py-2 text-[11px] text-[var(--dsn-text-secondary)] flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
                  <span>
                    Este idioma define únicamente el asunto y el cuerpo específico; al previsualizar o enviar hereda el Encabezado y Pie Global ({templateModalLocale.toUpperCase()}).
                  </span>
                </div>

                {templatePreviewMode ? (
                  <div className="rounded-lg border border-[var(--dsn-border)] bg-slate-100 p-4 text-sm text-slate-900 space-y-2 min-h-[200px] overflow-x-auto">
                    <p className="text-xs font-semibold text-slate-600 border-b border-slate-200 pb-2">
                      Asunto ({templateModalLocale.toUpperCase()}):{" "}
                      {templateForm.translations[templateModalLocale].subject || "(Sin asunto)"}
                    </p>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderSafeTemplatePreviewHtml(
                          templateForm.translations[templateModalLocale].bodyHtml,
                          selectedEvent?.variablesSchema || [],
                          data.layoutConfigs?.find((l) => l.locale === templateModalLocale) ||
                            data.layoutConfigs?.find((l) => l.locale === "es") ||
                            null,
                        ),
                      }}
                    />
                  </div>
                ) : (
                  <EmailRichTextEditor
                    key={`${templateForm.eventKey}-${templateModalLocale}`}
                    id={`template-body-${templateModalLocale}`}
                    label="Cuerpo Específico de la Plantilla"
                    fieldKey="email.template_body"
                    value={templateForm.translations[templateModalLocale].bodyHtml}
                    onChange={(html) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        translations: {
                          ...prev.translations,
                          [templateModalLocale]: {
                            ...prev.translations[templateModalLocale],
                            bodyHtml: html,
                          },
                        },
                      }))
                    }
                    locale={templateModalLocale}
                    availableVariables={selectedEvent?.variablesSchema || []}
                    context={{
                      eventKey: templateForm.eventKey,
                      subject: templateForm.translations[templateModalLocale].subject,
                      variablesSchema: selectedEvent?.variablesSchema || [],
                    }}
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setTemplateModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Plantilla Vinculada</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: PROBAR CONEXIÓN / ENVÍO
         ───────────────────────────────────────────────────────────── */}
      {testModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-test-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-test-title" className="text-base font-bold text-[var(--dsn-text)]">
                  Probar Pasarela SMTP
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label
                  htmlFor="test-recipient"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Correo Electrónico Destinatario
                </label>
                <input
                  id="test-recipient"
                  type="email"
                  value={testForm.recipient}
                  onChange={(e) => setTestForm({ recipient: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="rounded-lg bg-[var(--dsn-surface-secondary)]/50 p-3 space-y-1">
                <p className="font-semibold text-[var(--dsn-text)]">Parámetros de prueba:</p>
                <p className="text-[var(--dsn-text-secondary)] font-mono">
                  Servidor: {data.provider?.host}:{data.provider?.port}
                </p>
                <p className="text-[var(--dsn-text-secondary)] font-mono">
                  Remitente: {data.senders[0]?.fromEmail || "no-reply@mocter.co"}
                </p>
              </div>

              {testError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs mb-2">
                  {testError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setFeedback(null);
                    setTestError(null);
                    try {
                      const res = await fetch("/api/admin/notifications/test-send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: testForm.recipient }),
                      });
                      const json = await res.json();
                      if (!res.ok || !json.ok) {
                        throw new Error(json.detail || json.error || "Falló el envío de prueba");
                      }
                      setFeedback({
                        type: "success",
                        message: `Correo de prueba enviado a ${testForm.recipient} (id: ${json.messageId}).`,
                      });
                      setTestModalOpen(false);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      setTestError(msg);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar Correo de Prueba</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmación para Desactivar Eventos Críticos / Obligatorios (Regla 4.17) */}
      <ConfirmationModal
        isOpen={Boolean(pendingDisableEvent)}
        onClose={() => setPendingDisableEvent(null)}
        onConfirm={async () => {
          if (pendingDisableEvent) {
            await executeToggleEvent(pendingDisableEvent.key, false);
          }
        }}
        variant="warning"
        title="Desactivar Evento de Notificación"
        subtitle="Esta acción detendrá el despacho global de alertas para este evento en todos los comercios."
        details={
          pendingDisableEvent
            ? [
                { label: "Evento", value: pendingDisableEvent.key, mono: true },
                { label: "Categoría", value: pendingDisableEvent.category },
                {
                  label: "Clasificación",
                  value: pendingDisableEvent.tenantConfigurable ? "Configurable" : "Obligatoria",
                },
              ]
            : []
        }
        warningTitle="Impacto Operativo"
        warningMessage="Al desactivar este evento, los comercios dejarán de recibir avisos críticos por correo y en plataforma hasta que vuelva a activarse."
        confirmText="Confirmar Desactivación"
        confirmLoadingText="Desactivando..."
        loading={Boolean(pendingDisableEvent && toggleLoadingKey === pendingDisableEvent.key)}
      />
    </div>
  );
}

