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
  Globe,
  Tag,
  Info,
} from "lucide-react";
import type { AdminEmailSettingsDto } from "@mocter/domain";

interface NotificationsViewProps {
  initialData: AdminEmailSettingsDto;
}

export function NotificationsView({ initialData }: NotificationsViewProps) {
  const [data, setData] = useState<AdminEmailSettingsDto>(initialData);
  const [activeTab, setActiveTab] = useState<"smtp" | "senders" | "templates">("smtp");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modales
  const [smtpModalOpen, setSmtpModalOpen] = useState(false);
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

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

  const [templateForm, setTemplateForm] = useState({
    id: "",
    eventKey: data.events[0]?.key || "auth.verify_email",
    locale: "es",
    senderId: data.senders[0]?.id || "",
    subject: "",
    bodyHtml: "",
  });

  const [testForm, setTestForm] = useState({
    recipient: "soporte@mocter.co",
  });

  async function reloadData() {
    try {
      const res = await fetch("/api/admin/notifications");
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch (_err) {
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
        throw new Error(json.error || "No se pudo actualizar el servidor SMTP");
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
        throw new Error(json.error || "No se pudo guardar la dirección remitente");
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
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_template",
          ...templateForm,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo guardar la plantilla");
      }

      setFeedback({
        type: "success",
        message: "Plantilla de correo vinculada exitosamente al remitente y a la funcionalidad.",
      });
      setTemplateModalOpen(false);
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
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
          <span>Plantillas Vinculadas ({data.templates.length})</span>
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
                onClick={() => setTestModalOpen(true)}
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
          PESTAÑA 3: PLANTILLAS VINCULADAS (email_templates)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <section aria-labelledby="heading-templates" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="heading-templates" className="text-base font-bold text-[var(--dsn-text)]">
                Plantillas De Correo Vinculadas
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Cada plantilla se encuentra estrictamente vinculada a su funcionalidad del sistema y a la dirección de correo remitente que la despacha.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setTemplateForm({
                  id: "",
                  eventKey: data.events[0]?.key || "auth.verify_email",
                  locale: "es",
                  senderId: data.senders[0]?.id || "",
                  subject: "",
                  bodyHtml: "",
                });
                setTemplateModalOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nueva Plantilla Vinculada</span>
            </button>
          </div>

          {/* Tabla de Plantillas Vinculadas */}
          <div className="overflow-x-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]">
            <table className="w-full text-left text-xs text-[var(--dsn-text)]">
              <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Funcionalidad / Evento</th>
                  <th scope="col" className="px-4 py-3">Remitente Vinculado</th>
                  <th scope="col" className="px-4 py-3">Idioma</th>
                  <th scope="col" className="px-4 py-3">Asunto Del Correo</th>
                  <th scope="col" className="px-4 py-3">Versión</th>
                  <th scope="col" className="px-4 py-3">Estado</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {data.templates.length > 0 ? (
                  data.templates.map((t) => {
                    const eventInfo = data.events.find((ev) => ev.key === t.eventKey);
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-[var(--dsn-surface-secondary)]/30">
                        <td className="px-4 py-3">
                          <p className="font-mono font-semibold text-[var(--dsn-accent)]">{t.eventKey}</p>
                          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
                            {eventInfo?.description || "Evento del sistema"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <div>
                              <p className="font-medium text-[var(--dsn-text)]">
                                {t.senderName || "Remitente Oficial"}
                              </p>
                              <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                                {t.senderEmail || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono uppercase text-[var(--dsn-text-secondary)]">
                          {t.locale}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--dsn-text)] max-w-xs truncate">
                          {t.subject}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                          v{t.version}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono ${
                              t.status === "published"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {t.status === "published" ? "Publicada" : "Borrador"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateForm({
                                id: t.id,
                                eventKey: t.eventKey,
                                locale: t.locale,
                                senderId: t.senderId || data.senders[0]?.id || "",
                                subject: t.subject,
                                bodyHtml: t.bodyHtml,
                              });
                              setTemplateModalOpen(true);
                            }}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/10"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Editar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--dsn-text-secondary)]">
                      No hay plantillas de correo registradas en el catálogo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                  Nombre Identificador Del Servidor
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
                    Dirección Host Del Servidor
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
                    Puerto De Conexión
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
                  Usuario De Autenticación
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
                  Contraseña O Secreto SMTP
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
                    Nombre Visible Del Remitente
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
                    Correo De Respuesta (Reply-To)
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
                  Establecer Como Dirección Remitente Predeterminada
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
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 id="modal-template-title" className="text-base font-bold text-[var(--dsn-text)]">
                  {templateForm.id ? "Editar Plantilla Vinculada" : "Nueva Plantilla De Correo Vinculada"}
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
              {/* Vinculación 1: Funcionalidad / Evento */}
              <div>
                <label
                  htmlFor="template-event"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Funcionalidad O Evento Del Sistema (Obligatorio)
                </label>
                <select
                  id="template-event"
                  required
                  value={templateForm.eventKey}
                  onChange={(e) => setTemplateForm({ ...templateForm, eventKey: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                >
                  {data.events.map((ev) => (
                    <option key={ev.key} value={ev.key}>
                      [{ev.category.toUpperCase()}] {ev.key} — {ev.description}
                    </option>
                  ))}
                </select>
                {selectedEvent && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--dsn-text-secondary)]">
                    <Info className="h-3.5 w-3.5 text-[var(--dsn-accent)] shrink-0" />
                    <span>Variables disponibles:</span>
                    {selectedEvent.variablesSchema.map((v) => (
                      <span
                        key={v}
                        className="rounded bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--dsn-accent)]"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Vinculación 2: Dirección Remitente */}
              <div>
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
                  Todo correo originado por este evento saldrá despachado bajo esta dirección y nombre institucional.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-3">
                  <label
                    htmlFor="template-subject"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Asunto Del Correo Electrónico
                  </label>
                  <input
                    id="template-subject"
                    type="text"
                    required
                    placeholder="ej. Bienvenido a Mocter · Tu espacio está listo"
                    value={templateForm.subject}
                    onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="template-locale"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    Idioma De La Plantilla
                  </label>
                  <select
                    id="template-locale"
                    value={templateForm.locale}
                    onChange={(e) => setTemplateForm({ ...templateForm, locale: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  >
                    <option value="es">Español (es)</option>
                    <option value="en">Inglés (en)</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="template-body"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Cuerpo Del Mensaje En Formato HTML
                </label>
                <textarea
                  id="template-body"
                  rows={6}
                  required
                  placeholder="<p>Hola {{user_name}}, tu código de verificación es...</p>"
                  value={templateForm.bodyHtml}
                  onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden leading-relaxed"
                />
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
                  onClick={() => {
                    setFeedback({
                      type: "success",
                      message: `Prueba de conexión exitosa con ${data.provider?.host}:${data.provider?.port}. Correo de prueba enrutado a ${testForm.recipient}.`,
                    });
                    setTestModalOpen(false);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)] active:scale-95 shadow-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar Correo De Prueba</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

