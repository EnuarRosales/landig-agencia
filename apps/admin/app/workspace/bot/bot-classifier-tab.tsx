"use client";

import React, { useState } from "react";
import { Plus, ShieldAlert, Tag, Trash2 } from "lucide-react";
import type { UnifiedTenantBotConfigDto } from "@mocter/domain";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import {
  buildRecommendedClassifierPromptTemplate,
  applyRecommendedClassifierPromptTemplate,
  type ClassifierLabelUiItem,
} from "./bot-ui-helpers";

export type EditableBotLabel = UnifiedTenantBotConfigDto["labels"][number];

const SYSTEM_LABEL_TITLES = new Set([
  "lead-frio",
  "lead-tibio",
  "lead-caliente",
  "compra-realizada",
  "devolucion",
  "nuevo_pedido",
  "pendiente_pago",
  "pagado",
  "despachado",
  "soporte_humano",
  "cliente_recurrente",
]);

function isSystemClassifierLabel(title: string): boolean {
  return SYSTEM_LABEL_TITLES.has(title);
}

export interface BotClassifierTabProps {
  locale: "es" | "en";
  readOnly: boolean;
  labels: EditableBotLabel[];
  onLabelsChange: (next: EditableBotLabel[]) => void;
  classifierPrompt: string;
  onClassifierPromptChange: (next: string) => void;
  promptContext: Record<string, unknown>;
}

function toUiClassifierItem(label: EditableBotLabel): ClassifierLabelUiItem {
  const sideEffectsList = label.sideEffects
    ? label.sideEffects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return {
    code: label.title,
    title: label.title,
    category: label.category,
    chatwootColor: label.color,
    criterion: label.activationRule || label.description || "",
    sideEffectLabels:
      sideEffectsList.length > 0
        ? sideEffectsList
        : label.category === "functional"
          ? [`Color en Chatwoot (${label.color})`]
          : ["Etiqueta Operativa"],
  };
}

/**
 * Pestaña del Clasificador Dinámico de Conversaciones y Catálogo Persistente de Etiquetas.
 */
export function BotClassifierTab({
  locale,
  readOnly,
  labels,
  onLabelsChange,
  classifierPrompt,
  onClassifierPromptChange,
  promptContext,
}: BotClassifierTabProps) {
  const isEs = locale === "es";

  const [newLabelTitle, setNewLabelTitle] = useState("");
  const [newLabelCategory, setNewLabelCategory] = useState<"functional" | "operational">(
    "functional",
  );
  const [newLabelColor, setNewLabelColor] = useState("#06B6D4");
  const [newLabelCriterion, setNewLabelCriterion] = useState("");
  const [newLabelHandoff, setNewLabelHandoff] = useState(false);
  const [newLabelPauseBot, setNewLabelPauseBot] = useState(false);
  const [newLabelSendEmail, setNewLabelSendEmail] = useState(false);

  const functionalLabels = labels.filter((l) => l.category === "functional");
  const operationalLabels = labels.filter((l) => l.category === "operational");

  function handleCompileClassifierTemplate() {
    const customItems = labels
      .filter((l) => !isSystemClassifierLabel(l.title))
      .map(toUiClassifierItem);
    const compiled = classifierPrompt.trim()
      ? applyRecommendedClassifierPromptTemplate(classifierPrompt, customItems)
      : buildRecommendedClassifierPromptTemplate(customItems);
    onClassifierPromptChange(compiled);
  }

  function handleAddCustomLabel() {
    const cleanCode = newLabelTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    const cleanCriterion = newLabelCriterion.trim();
    if (!cleanCode || !cleanCriterion) return;

    const sideEffects: string[] = [];
    if (newLabelCategory === "operational") {
      if (newLabelHandoff) sideEffects.push("handoff_human");
      if (newLabelPauseBot) sideEffects.push("pause_bot");
      if (newLabelSendEmail) sideEffects.push("notify_email");
    }

    const nextLabel: EditableBotLabel = {
      id: `custom-${cleanCode}`,
      title: cleanCode,
      description: cleanCriterion,
      color: newLabelColor,
      origin: "custom",
      state: "active",
      category: newLabelCategory,
      activationRule: cleanCriterion,
      sideEffects: sideEffects.length > 0 ? sideEffects.join(",") : null,
    };

    const nextList = [...labels.filter((l) => l.title !== cleanCode), nextLabel];
    onLabelsChange(nextList);

    const customItems = nextList
      .filter((l) => !isSystemClassifierLabel(l.title))
      .map(toUiClassifierItem);
    onClassifierPromptChange(applyRecommendedClassifierPromptTemplate(classifierPrompt, customItems));

    setNewLabelTitle("");
    setNewLabelCriterion("");
    setNewLabelHandoff(false);
    setNewLabelPauseBot(false);
    setNewLabelSendEmail(false);
  }

  function handleRemoveCustomLabel(title: string) {
    const nextList = labels.filter((l) => l.title !== title);
    onLabelsChange(nextList);
    const customItems = nextList
      .filter((l) => !isSystemClassifierLabel(l.title))
      .map(toUiClassifierItem);
    onClassifierPromptChange(applyRecommendedClassifierPromptTemplate(classifierPrompt, customItems));
  }

  return (
    <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--dsn-border)] pb-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-bold text-[var(--dsn-text)]">
            {isEs
              ? "Clasificador Dinámico de Conversaciones y Etiquetas"
              : "Dynamic Conversation Classifier And Labels"}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
            {isEs
              ? "Las etiquetas funcionales determinan la etapa del embudo en bandeja; las operativas disparan automatizaciones y notificaciones."
              : "Functional labels mark funnel stage colors; operational labels trigger automated handoff, pause, or notifications."}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleCompileClassifierTemplate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:border-[var(--dsn-accent)]"
          >
            <Tag className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
            <span>{isEs ? "Compilar Prompt Clasificador" : "Compile Classifier Prompt"}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Etiquetas Funcionales */}
        <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4">
          <h3 className="text-xs font-bold text-[var(--dsn-text)]">
            {isEs ? "Etiquetas Funcionales (Color en Bandeja)" : "Functional Labels (Inbox Color)"}
          </h3>
          <div className="space-y-2">
            {functionalLabels.map((label) => (
              <div
                key={label.title}
                className="flex items-start justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: label.color }}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="rounded bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 text-[11px] font-mono font-semibold text-[var(--dsn-text)]">
                        {label.title}
                      </code>
                      <span className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                        {label.color}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--dsn-text-secondary)]">
                      {label.activationRule || label.description}
                    </p>
                  </div>
                </div>
                {!isSystemClassifierLabel(label.title) && !readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomLabel(label.title)}
                    className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Etiquetas Operativas */}
        <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4">
          <h3 className="text-xs font-bold text-[var(--dsn-text)]">
            {isEs ? "Etiquetas Operativas (Automatizaciones)" : "Operational Labels (Automations)"}
          </h3>
          <div className="space-y-2">
            {operationalLabels.map((label) => (
              <div
                key={label.title}
                className="flex items-start justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ShieldAlert
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: label.color }}
                    />
                    <code className="rounded bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 text-[11px] font-mono font-semibold text-[var(--dsn-text)]">
                      {label.title}
                    </code>
                    {label.sideEffects
                      ? label.sideEffects
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((eff) => (
                            <span
                              key={eff}
                              className="rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--dsn-accent)]"
                            >
                              {eff}
                            </span>
                          ))
                      : null}
                  </div>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {label.activationRule || label.description}
                  </p>
                </div>
                {!isSystemClassifierLabel(label.title) && !readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomLabel(label.title)}
                    className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nueva Etiqueta Personalizada */}
      {!readOnly && (
        <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/15 p-4">
          <h3 className="text-xs font-bold text-[var(--dsn-text)]">
            {isEs ? "Agregar Etiqueta Personalizada" : "Add Custom Label"}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="custom-label-title"
                className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]"
              >
                {isEs ? "Slug o Identificador" : "Label Slug"}
              </label>
              <input
                id="custom-label-title"
                type="text"
                value={newLabelTitle}
                onChange={(e) => setNewLabelTitle(e.target.value)}
                placeholder="cliente-mayorista"
                className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
              />
            </div>

            <div>
              <label
                htmlFor="custom-label-category"
                className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]"
              >
                {isEs ? "Categoría de Etiqueta" : "Label Category"}
              </label>
              <select
                id="custom-label-category"
                value={newLabelCategory}
                onChange={(e) =>
                  setNewLabelCategory(e.target.value as "functional" | "operational")
                }
                className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
              >
                <option value="functional">{isEs ? "Funcional" : "Functional"}</option>
                <option value="operational">{isEs ? "Operativa" : "Operational"}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="custom-label-color"
                className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]"
              >
                {isEs ? "Color Hexadecimal" : "Hex Color"}
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

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="custom-label-criterion"
                className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]"
              >
                {isEs ? "Regla de Activación" : "Activation Rule"}
              </label>
              <input
                id="custom-label-criterion"
                type="text"
                value={newLabelCriterion}
                onChange={(e) => setNewLabelCriterion(e.target.value)}
                placeholder={
                  isEs
                    ? "Solicita cotización por volumen o precios mayoristas."
                    : "Requests wholesale pricing or bulk quote."
                }
                className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddCustomLabel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:border-[var(--dsn-accent)]"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>{isEs ? "Agregar Etiqueta" : "Add Label"}</span>
              </button>
            </div>
          </div>

          {newLabelCategory === "operational" && (
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[var(--dsn-text-secondary)]">
              <span className="font-semibold text-[var(--dsn-text)]">
                {isEs ? "Efectos Automáticos:" : "Automatic Side Effects:"}
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newLabelHandoff}
                  onChange={(e) => setNewLabelHandoff(e.target.checked)}
                />
                <span>{isEs ? "Dirigir a Asesor" : "Human Handoff"}</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newLabelPauseBot}
                  onChange={(e) => setNewLabelPauseBot(e.target.checked)}
                />
                <span>{isEs ? "Pausar Bot" : "Pause Bot"}</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newLabelSendEmail}
                  onChange={(e) => setNewLabelSendEmail(e.target.checked)}
                />
                <span>{isEs ? "Notificar por Correo" : "Send Email"}</span>
              </label>
            </div>
          )}
        </div>
      )}

      <AiEnhanceTextarea
        id="bot-conversation-classifier"
        fieldKey="bot.conversation_classifier"
        label={isEs ? "Prompt Clasificador de Conversaciones" : "Conversation Classifier Prompt"}
        rows={11}
        disabled={readOnly}
        locale={locale}
        value={classifierPrompt}
        onChange={onClassifierPromptChange}
        context={promptContext}
      />
    </section>
  );
}
