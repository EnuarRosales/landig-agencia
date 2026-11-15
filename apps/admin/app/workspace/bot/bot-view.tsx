"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Sparkles,
  Tag,
  ShieldAlert,
} from "lucide-react";
import type { WorkspaceBotConfigDto } from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import {
  FUNCTIONAL_CLASSIFIER_LABELS_UI,
  OPERATIONAL_CLASSIFIER_LABELS_UI,
  applyRecommendedClientGeneralPromptTemplate,
  applyRecommendedClassifierPromptTemplate,
  buildRecommendedClientGeneralPromptTemplate,
  buildRecommendedClassifierPromptTemplate,
  type ClassifierLabelUiItem,
} from "./bot-ui-helpers";

interface BotViewProps {
  initialConfig: WorkspaceBotConfigDto | null;
}

const PRESETS = [
  {
    id: "natural_rhythm",
    name: "Ritmo Natural",
    description: "Tono cálido y conversacional que responde con cercanía y fluidez comercial.",
  },
  {
    id: "direct_seller",
    name: "Vendedor Directo",
    description: "Enfoque ágil orientado al cierre de ventas y resolución rápida de dudas de catálogo.",
  },
  {
    id: "technical_advisor",
    name: "Asesor Técnico",
    description: "Explicaciones detalladas sobre especificaciones de producto, materiales y garantías.",
  },
  {
    id: "empathetic_support",
    name: "Soporte Empático",
    description: "Prioriza la atención cuidadosa, aclaración de inquietudes y seguimiento postventa.",
  },
];

export function BotView({ initialConfig }: BotViewProps) {
  const [preset, setPreset] = useState(initialConfig?.botPreset || "natural_rhythm");
  const [reminders, setReminders] = useState(initialConfig?.remindersEnabled ?? false);
  const [returnsPolicy, setReturnsPolicy] = useState(initialConfig?.returnsPolicy || "");
  const [warrantyPolicy, setWarrantyPolicy] = useState(initialConfig?.warrantyPolicy || "");
  const [orderMessage, setOrderMessage] = useState(initialConfig?.orderMessage || "");
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>(
    initialConfig?.faqs || [],
  );

  const selectedPresetMeta = useMemo(
    () => PRESETS.find((item) => item.id === preset) ?? PRESETS[0],
    [preset],
  );

  const clientPromptContext = useMemo(
    () => ({
      botPreset: preset,
      presetName: selectedPresetMeta?.name,
      presetDescription: selectedPresetMeta?.description,
      warrantyPolicy,
      returnsPolicy,
      orderMessage,
      faqsCount: faqs.length,
    }),
    [preset, selectedPresetMeta, warrantyPolicy, returnsPolicy, orderMessage, faqs.length],
  );

  const [clientGeneralPrompt, setClientGeneralPrompt] = useState(() =>
    buildRecommendedClientGeneralPromptTemplate({
      botPreset: initialConfig?.botPreset || "natural_rhythm",
      presetName:
        PRESETS.find((p) => p.id === (initialConfig?.botPreset || "natural_rhythm"))?.name ||
        "Ritmo Natural",
      presetDescription:
        PRESETS.find((p) => p.id === (initialConfig?.botPreset || "natural_rhythm"))?.description ||
        "",
      warrantyPolicy: initialConfig?.warrantyPolicy || "",
      returnsPolicy: initialConfig?.returnsPolicy || "",
      orderMessage: initialConfig?.orderMessage || "",
      faqsCount: initialConfig?.faqs?.length || 0,
    }),
  );

  const [customClassifierLabels, setCustomClassifierLabels] = useState<ClassifierLabelUiItem[]>([]);
  const [newLabelCode, setNewLabelCode] = useState("");
  const [newLabelTitle, setNewLabelTitle] = useState("");
  const [newLabelCategory, setNewLabelCategory] = useState<"functional" | "operational">(
    "functional",
  );
  const [newLabelColor, setNewLabelColor] = useState("#06B6D4");
  const [newLabelCriterion, setNewLabelCriterion] = useState("");
  const [newLabelHandoff, setNewLabelHandoff] = useState(false);
  const [newLabelPauseBot, setNewLabelPauseBot] = useState(false);
  const [newLabelSendEmail, setNewLabelSendEmail] = useState(false);

  const [classifierPrompt, setClassifierPrompt] = useState(() =>
    buildRecommendedClassifierPromptTemplate([]),
  );

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddFaq = () => {
    setFaqs((prev) => [...prev, { question: "", answer: "" }]);
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", val: string) => {
    setFaqs((prev) =>
      prev.map((faq, i) => (i === index ? { ...faq, [field]: val } : faq)),
    );
  };

  const handleRemoveFaq = (index: number) => {
    setFaqs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInsertClientGeneralTemplate = () => {
    setClientGeneralPrompt((prev) =>
      applyRecommendedClientGeneralPromptTemplate(prev, clientPromptContext),
    );
  };

  const handleCompileClassifierTemplate = () => {
    setClassifierPrompt((prev) =>
      applyRecommendedClassifierPromptTemplate(prev, customClassifierLabels),
    );
  };

  const handleAddCustomClassifierLabel = () => {
    const cleanCode = newLabelCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    const cleanTitle = newLabelTitle.trim();
    const cleanCriterion = newLabelCriterion.trim();
    if (!cleanCode || !cleanTitle || !cleanCriterion) {
      return;
    }

    const sideEffectLabels: string[] = [];
    if (newLabelCategory === "functional") {
      sideEffectLabels.push(`Color en Chatwoot (${newLabelColor})`);
    } else {
      if (newLabelHandoff) sideEffectLabels.push("Dirigir a Agente Humano");
      if (newLabelPauseBot) sideEffectLabels.push("Pausar Bot");
      if (newLabelSendEmail) sideEffectLabels.push("Enviar Correo");
      if (sideEffectLabels.length === 0) {
        sideEffectLabels.push("Etiqueta Operativa en Chatwoot");
      }
    }

    const nextCustom: ClassifierLabelUiItem = {
      code: cleanCode,
      title: cleanTitle,
      category: newLabelCategory,
      chatwootColor: newLabelColor,
      criterion: cleanCriterion,
      sideEffectLabels,
    };

    const updated = [
      ...customClassifierLabels.filter((item) => item.code !== cleanCode),
      nextCustom,
    ];
    setCustomClassifierLabels(updated);
    setClassifierPrompt((prev) => applyRecommendedClassifierPromptTemplate(prev, updated));
    setNewLabelCode("");
    setNewLabelTitle("");
    setNewLabelCriterion("");
    setNewLabelHandoff(false);
    setNewLabelPauseBot(false);
    setNewLabelSendEmail(false);
  };

  const handleRemoveCustomClassifierLabel = (code: string) => {
    const updated = customClassifierLabels.filter((item) => item.code !== code);
    setCustomClassifierLabels(updated);
    setClassifierPrompt((prev) => applyRecommendedClassifierPromptTemplate(prev, updated));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await workspaceFetch<WorkspaceBotConfigDto>("/api/tenant/bot", {
        method: "PUT",
        body: JSON.stringify({
          botPreset: preset,
          remindersEnabled: reminders,
          returnsPolicy: returnsPolicy.trim() || null,
          warrantyPolicy: warrantyPolicy.trim() || null,
          orderMessage: orderMessage.trim() || null,
          faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
        }),
      });

      if (!res.ok) {
        setError(res.error || "Error al guardar la configuración.");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Error de conexión al guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Asistente AI y Políticas de Atención
            </h1>
            <span className="rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
              Personalidad Comercial
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Personalidad, tono de respuesta, Prompt General de Operación del Cliente y Clasificador Dinámico bajo metodología IDEAL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/workspace/ai"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
          >
            <KeyRound className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>Proveedores y Llaves AI</span>
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? "Guardando..." : "Guardar Cambios"}</span>
          </button>
        </div>
      </header>

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Configuración del asistente actualizada exitosamente.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Preset de Personalidad */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
          <h2 className="text-sm font-bold text-[var(--dsn-text)] mb-1">
            Preset de Personalidad y Tono
          </h2>
          <p className="text-xs text-[var(--dsn-text-secondary)] mb-4">
            Selecciona el estilo con el que tu bot atenderá las conversaciones con tus clientes.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRESETS.map((p) => {
              const selected = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 text-[var(--dsn-text)]"
                      : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-border-strong)]"
                  }`}
                >
                  <span className={`text-xs font-bold ${selected ? "text-[var(--dsn-accent)]" : "text-[var(--dsn-text)]"}`}>
                    {p.name}
                  </span>
                  <span className="text-[11px] mt-1 text-[var(--dsn-text-secondary)]">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--dsn-border)] flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--dsn-text)]">
                Recordatorios Automáticos de Seguimiento
              </p>
              <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                Reconectar con prospectos inactivos tras un período de silencio.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[var(--dsn-surface-secondary)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--dsn-accent)]" />
            </label>
          </div>
        </section>

        {/* Políticas Comerciales */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[var(--dsn-text)]">
            Políticas Comerciales y de Garantía
          </h2>

          <AiEnhanceTextarea
            id="bot-warranty-policy"
            fieldKey="policy.warranty"
            label="Política de Garantías"
            rows={2}
            value={warrantyPolicy}
            onChange={setWarrantyPolicy}
            context={{ botPreset: preset }}
            placeholder="Ej. Todos nuestros productos cuentan con 6 meses de garantía por defectos de fábrica."
          />

          <AiEnhanceTextarea
            id="bot-returns-policy"
            fieldKey="policy.returns"
            label="Política de Cambios y Devoluciones"
            rows={2}
            value={returnsPolicy}
            onChange={setReturnsPolicy}
            context={{ botPreset: preset }}
            placeholder="Ej. Tienes hasta 15 días calendario para solicitar cambios en productos sin uso."
          />

          <AiEnhanceTextarea
            id="bot-order-confirmation"
            fieldKey="bot.order_confirmation_message"
            label="Mensaje de Confirmación de Pedido"
            rows={2}
            value={orderMessage}
            onChange={setOrderMessage}
            context={{ botPreset: preset }}
            placeholder="Ej. ¡Gracias por tu compra! Tu pedido fue registrado y te notificaremos el despacho."
          />
        </section>

        {/* Prompt General de Operación del Cliente (Metodología IDEAL — Plano 2) */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--dsn-border)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                  Prompt General de Operación del Cliente (Metodología IDEAL)
                </h2>
                <span className="rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-[var(--dsn-accent)]">
                  Plano 2 · Negocio
                </span>
              </div>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                Define las reglas transversales del comercio (cobertura y tiempos de entrega por zona, medios de pago, casos especiales y regla de catálogo). Las condiciones de cada artículo se configuran en su ficha de producto.
              </p>
            </div>
            <button
              type="button"
              onClick={handleInsertClientGeneralTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>Insertar Estructura IDEAL del Negocio</span>
            </button>
          </div>

          <AiEnhanceTextarea
            id="bot-client-general-prompt"
            fieldKey="bot.client_general_prompt"
            label="Prompt General de Operación del Cliente"
            rows={12}
            value={clientGeneralPrompt}
            onChange={setClientGeneralPrompt}
            context={clientPromptContext}
          />
          <p className="text-[11px] text-[var(--dsn-text-secondary)]">
            Estructura secuencial [I] Intención, [D] Detalle, [E] Ejemplo, [A] Acción y [L] Límite. Las reglas técnicas de multiburbuja [[SPLIT]] y marcadores [[MEDIA:...]] son inyectadas automáticamente por la plataforma.
          </p>
        </section>

        {/* Clasificador Dinámico de Conversaciones (Etiquetas Funcionales vs. Operativas) */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--dsn-border)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                  Clasificador Dinámico de Conversaciones (Etiquetas Funcionales y Operativas)
                </h2>
                <span className="rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-[var(--dsn-accent)]">
                  Chatwoot + Automatización
                </span>
              </div>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                Las Etiquetas Funcionales definen el color orientativo de la conversación en Chatwoot (1 activa), mientras que las Etiquetas Operativas disparan acciones automáticas (dirigir a agente humano, pausar el bot o enviar notificación por correo).
              </p>
            </div>
            <button
              type="button"
              onClick={handleCompileClassifierTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors shrink-0"
            >
              <Tag className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>Compilar Prompt Clasificador IDEAL</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Columna 1: Etiquetas Funcionales */}
            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[var(--dsn-text)]">
                  Etiquetas Funcionales (Color Orientativo en Chatwoot)
                </h3>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  Mutuamente excluyentes (1 activa por conversación). Determinan la etapa del embudo y pintan el color orientativo en la bandeja de Chatwoot.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  ...FUNCTIONAL_CLASSIFIER_LABELS_UI,
                  ...customClassifierLabels.filter((l) => l.category === "functional"),
                ].map((label) => (
                  <div
                    key={label.code}
                    className="flex items-start justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1 h-3 w-3 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: label.chatwootColor }}
                        title={`Color orientativo en Chatwoot: ${label.chatwootColor}`}
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[var(--dsn-text)]">
                            {label.title}
                          </span>
                          <code className="rounded bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                            {label.code}
                          </code>
                          <span className="rounded-full bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                            {label.chatwootColor}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
                          {label.criterion}
                        </p>
                      </div>
                    </div>
                    {customClassifierLabels.some((c) => c.code === label.code) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomClassifierLabel(label.code)}
                        className="p-1 text-rose-400 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Columna 2: Etiquetas Operativas */}
            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[var(--dsn-text)]">
                  Etiquetas Operativas (Acciones y Automatizaciones)
                </h3>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  Acumulables (0 a N activas). Pueden dirigir la conversación a un agente humano, desactivar el bot o enviar notificaciones por correo.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  ...OPERATIONAL_CLASSIFIER_LABELS_UI,
                  ...customClassifierLabels.filter((l) => l.category === "operational"),
                ].map((label) => (
                  <div
                    key={label.code}
                    className="flex items-start justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ShieldAlert
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: label.chatwootColor }}
                        />
                        <span className="font-semibold text-[var(--dsn-text)]">
                          {label.title}
                        </span>
                        <code className="rounded bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                          {label.code}
                        </code>
                        {label.sideEffectLabels.map((effect) => (
                          <span
                            key={effect}
                            className="rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--dsn-accent)]"
                          >
                            {effect}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {label.criterion}
                      </p>
                    </div>
                    {customClassifierLabels.some((c) => c.code === label.code) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomClassifierLabel(label.code)}
                        className="p-1 text-rose-400 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agregar etiqueta personalizada del inquilino */}
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/15 p-4 space-y-3">
            <h3 className="text-xs font-bold text-[var(--dsn-text)]">
              Agregar Etiqueta Personalizada al Clasificador del Inquilino
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="custom-label-code"
                  className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
                >
                  Código de Etiqueta
                </label>
                <input
                  id="custom-label-code"
                  type="text"
                  value={newLabelCode}
                  onChange={(e) => setNewLabelCode(e.target.value)}
                  placeholder="ej. cliente-mayorista"
                  className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="custom-label-title"
                  className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
                >
                  Nombre Visible
                </label>
                <input
                  id="custom-label-title"
                  type="text"
                  value={newLabelTitle}
                  onChange={(e) => setNewLabelTitle(e.target.value)}
                  placeholder="ej. Cliente Mayorista"
                  className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="custom-label-category"
                  className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
                >
                  Categoría de Etiqueta
                </label>
                <select
                  id="custom-label-category"
                  value={newLabelCategory}
                  onChange={(e) =>
                    setNewLabelCategory(e.target.value as "functional" | "operational")
                  }
                  className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                >
                  <option value="functional">Funcional (Color en Chatwoot)</option>
                  <option value="operational">Operativa (Acciones Automáticas)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="custom-label-color"
                  className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
                >
                  Color Orientativo (Hex)
                </label>
                <input
                  id="custom-label-color"
                  type="text"
                  value={newLabelColor}
                  onChange={(e) => setNewLabelColor(e.target.value)}
                  placeholder="#06B6D4"
                  className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--dsn-text)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label
                  htmlFor="custom-label-criterion"
                  className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
                >
                  Criterio de Activación para el Clasificador AI
                </label>
                <input
                  id="custom-label-criterion"
                  type="text"
                  value={newLabelCriterion}
                  onChange={(e) => setNewLabelCriterion(e.target.value)}
                  placeholder="ej. Solicita cotización por más de 12 unidades o precios de distribuidor."
                  className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddCustomClassifierLabel}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  <span>Agregar Etiqueta al Clasificador</span>
                </button>
              </div>
            </div>

            {newLabelCategory === "operational" && (
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[var(--dsn-text-secondary)]">
                <span className="font-semibold text-[var(--dsn-text)]">
                  Efectos Operativos Automáticos:
                </span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLabelHandoff}
                    onChange={(e) => setNewLabelHandoff(e.target.checked)}
                  />
                  <span>Dirigir a Agente Humano</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLabelPauseBot}
                    onChange={(e) => setNewLabelPauseBot(e.target.checked)}
                  />
                  <span>Desactivar o Pausar Bot</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLabelSendEmail}
                    onChange={(e) => setNewLabelSendEmail(e.target.checked)}
                  />
                  <span>Enviar Notificación por Correo</span>
                </label>
              </div>
            )}
          </div>

          <AiEnhanceTextarea
            id="bot-conversation-classifier"
            fieldKey="bot.conversation_classifier"
            label="Prompt Clasificador de Conversaciones"
            rows={12}
            value={classifierPrompt}
            onChange={setClassifierPrompt}
            context={{
              botPreset: preset,
              customLabelsCount: customClassifierLabels.length,
            }}
          />
          <p className="text-[11px] text-[var(--dsn-text-secondary)]">
            Evalúa cada conversación bajo metodología IDEAL y retorna JSON estricto con functionalLabel (color en Chatwoot) y operationalLabels (acciones de handoff humano, pausa de bot o correo).
          </p>
        </section>

        {/* Preguntas Frecuentes */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)] mb-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                Preguntas Frecuentes (FAQ)
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Respuestas preparadas que el asistente usará para contestar inmediatamente.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddFaq}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]/40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar Pregunta</span>
            </button>
          </div>

          {faqs.length === 0 ? (
            <p className="text-xs text-[var(--dsn-text-secondary)] italic text-center py-4">
              No has registrado preguntas frecuentes aún.
            </p>
          ) : (
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => handleUpdateFaq(index, "question", e.target.value)}
                      placeholder="Pregunta (ej. ¿Hacen envíos a todo el país?)"
                      className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFaq(index)}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                    placeholder="Respuesta detallada..."
                    className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </form>
    </div>
  );
}
