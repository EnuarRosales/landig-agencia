"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import type { UnifiedTenantBotConfigDto } from "@mocter/domain";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import type { getAdminDictionary } from "@/lib/i18n";

export interface BotIdentityTabProps {
  dict: ReturnType<typeof getAdminDictionary>["workspace"];
  locale: "es" | "en";
  readOnly: boolean;
  name: string;
  onNameChange: (v: string) => void;
  status: "draft" | "active" | "paused";
  onStatusChange: (v: "draft" | "active" | "paused") => void;
  objective: string;
  onObjectiveChange: (v: string) => void;
  presetId: string | null;
  onPresetChange: (id: string) => void;
  toneId: string | null;
  onToneChange: (id: string) => void;
  persona: string;
  onPersonaChange: (v: string) => void;
  responseLanguage: "es" | "en" | "auto";
  onResponseLanguageChange: (v: "es" | "en" | "auto") => void;
  answerPolicy: "solo_conocimiento" | "libre";
  onAnswerPolicyChange: (v: "solo_conocimiento" | "libre") => void;
  maxTurns: number;
  onMaxTurnsChange: (v: number) => void;
  maxMessagesPerContact: number;
  onMaxMessagesPerContactChange: (v: number) => void;
  allowedTopics: string;
  onAllowedTopicsChange: (v: string) => void;
  excludedTopics: string;
  onExcludedTopicsChange: (v: string) => void;
  handoffTriggersText: string;
  onHandoffTriggersTextChange: (v: string) => void;
  remindersEnabled: boolean;
  onRemindersEnabledChange: (v: boolean) => void;
  instructions: string;
  onInstructionsChange: (v: string) => void;
  onInsertIdealTemplate: () => void;
  catalog: UnifiedTenantBotConfigDto["catalog"];
  promptContext: Record<string, unknown>;
}

/**
 * Pestaña de Identidad, Catálogo de Personalidad, Guardarraíles e Instrucciones Generales del Asistente.
 */
export function BotIdentityTab({
  dict,
  locale,
  readOnly,
  name,
  onNameChange,
  status,
  onStatusChange,
  objective,
  onObjectiveChange,
  presetId,
  onPresetChange,
  toneId,
  onToneChange,
  persona,
  onPersonaChange,
  responseLanguage,
  onResponseLanguageChange,
  answerPolicy,
  onAnswerPolicyChange,
  maxTurns,
  onMaxTurnsChange,
  maxMessagesPerContact,
  onMaxMessagesPerContactChange,
  allowedTopics,
  onAllowedTopicsChange,
  excludedTopics,
  onExcludedTopicsChange,
  handoffTriggersText,
  onHandoffTriggersTextChange,
  remindersEnabled,
  onRemindersEnabledChange,
  instructions,
  onInstructionsChange,
  onInsertIdealTemplate,
  catalog,
  promptContext,
}: BotIdentityTabProps) {
  return (
    <div className="space-y-6">
      {/* Identidad Base y Parámetros de Atención */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label
              htmlFor="bot-name"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botNameLabel}
            </label>
            <input
              id="bot-name"
              type="text"
              disabled={readOnly}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="bot-status"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botStatusLabel}
            </label>
            <select
              id="bot-status"
              disabled={readOnly}
              value={status}
              onChange={(e) => onStatusChange(e.target.value as "draft" | "active" | "paused")}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            >
              <option value="active">{dict.botStatusActive}</option>
              <option value="paused">{dict.botStatusPaused}</option>
              <option value="draft">{dict.botStatusDraft}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="bot-language"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botLanguageLabel}
            </label>
            <select
              id="bot-language"
              disabled={readOnly}
              value={responseLanguage}
              onChange={(e) => onResponseLanguageChange(e.target.value as "es" | "en" | "auto")}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="auto">Automático</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label
              htmlFor="bot-objective"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botObjectiveLabel}
            </label>
            <input
              id="bot-objective"
              list="bot-objectives-suggestions"
              type="text"
              disabled={readOnly}
              value={objective}
              onChange={(e) => onObjectiveChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            />
            <datalist id="bot-objectives-suggestions">
              {catalog.objectives.map((obj) => (
                <option key={obj.code} value={locale === "en" ? obj.labels.en : obj.labels.es} />
              ))}
            </datalist>
          </div>

          <div>
            <label
              htmlFor="bot-answer-policy"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botAnswerPolicyLabel}
            </label>
            <select
              id="bot-answer-policy"
              disabled={readOnly}
              value={answerPolicy}
              onChange={(e) =>
                onAnswerPolicyChange(e.target.value as "solo_conocimiento" | "libre")
              }
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            >
              <option value="solo_conocimiento">{dict.botAnswerPolicyGrounded}</option>
              <option value="libre">{dict.botAnswerPolicyHelpful}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="bot-max-turns"
                className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
              >
                {dict.botMaxTurnsLabel}
              </label>
              <input
                id="bot-max-turns"
                type="number"
                min={1}
                max={100}
                disabled={readOnly}
                value={maxTurns}
                onChange={(e) => onMaxTurnsChange(Number(e.target.value) || 20)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-2.5 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="bot-max-msgs"
                className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
              >
                {dict.botMaxMessagesLabel}
              </label>
              <input
                id="bot-max-msgs"
                type="number"
                min={1}
                max={500}
                disabled={readOnly}
                value={maxMessagesPerContact}
                onChange={(e) => onMaxMessagesPerContactChange(Number(e.target.value) || 60)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-2.5 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Selector Dinámico de Personalidad (Preset) */}
        <div className="space-y-2.5">
          <h2 className="text-sm font-bold text-[var(--dsn-text)]">{dict.botPresetLabel}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {catalog.presets.map((p) => {
              const selected = presetId === p.id;
              const label = locale === "en" ? p.labels.en : p.labels.es;
              const desc = p.recommendedFor
                ? locale === "en"
                  ? p.recommendedFor.en
                  : p.recommendedFor.es
                : null;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onPresetChange(p.id)}
                  className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 text-[var(--dsn-text)]"
                      : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-border-strong)]"
                  } disabled:opacity-60`}
                >
                  <span
                    className={`text-xs font-bold ${
                      selected ? "text-[var(--dsn-accent)]" : "text-[var(--dsn-text)]"
                    }`}
                  >
                    {label}
                  </span>
                  {desc ? (
                    <span className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                      {desc}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selector Dinámico de Tono Comunicacional */}
        <div className="space-y-2">
          <label
            htmlFor="bot-tone"
            className="block text-xs font-semibold text-[var(--dsn-text)]"
          >
            {dict.botToneLabel}
          </label>
          <select
            id="bot-tone"
            disabled={readOnly}
            value={toneId || ""}
            onChange={(e) => onToneChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60 sm:max-w-md"
          >
            {catalog.tones.map((t) => (
              <option key={t.id} value={t.id}>
                {locale === "en" ? t.labels.en : t.labels.es}
              </option>
            ))}
          </select>
        </div>

        <AiEnhanceTextarea
          id="bot-persona"
          fieldKey="bot.persona"
          label={dict.botPersonaLabel}
          rows={2}
          disabled={readOnly}
          locale={locale}
          value={persona}
          onChange={onPersonaChange}
          context={promptContext}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="bot-allowed-topics"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botAllowedTopicsLabel}
            </label>
            <textarea
              id="bot-allowed-topics"
              rows={2}
              disabled={readOnly}
              value={allowedTopics}
              onChange={(e) => onAllowedTopicsChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="bot-excluded-topics"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botExcludedTopicsLabel}
            </label>
            <textarea
              id="bot-excluded-topics"
              rows={2}
              disabled={readOnly}
              value={excludedTopics}
              onChange={(e) => onExcludedTopicsChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="bot-handoff-triggers"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botHandoffTriggersLabel}
            </label>
            <textarea
              id="bot-handoff-triggers"
              rows={2}
              disabled={readOnly}
              value={handoffTriggersText}
              onChange={(e) => onHandoffTriggersTextChange(e.target.value)}
              placeholder={locale === "en" ? "complaint, refund, agent" : "queja, reclamo, asesor"}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        {/* Recordatorios Automáticos */}
        <div className="flex items-center justify-between border-t border-[var(--dsn-border)] pt-4">
          <div>
            <p className="text-xs font-bold text-[var(--dsn-text)]">{dict.botRemindersTitle}</p>
            <p className="text-[11px] text-[var(--dsn-text-secondary)]">
              {dict.botRemindersDesc}
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={remindersEnabled}
              onChange={(e) => onRemindersEnabledChange(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-[var(--dsn-surface-secondary)] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--dsn-accent)] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-hidden" />
          </label>
        </div>
      </section>

      {/* Instrucciones / Prompt General */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col justify-between gap-3 border-b border-[var(--dsn-border)] pb-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">
              {dict.botGeneralPromptTitle}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
              {dict.botGeneralPromptDesc}
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={onInsertIdealTemplate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:border-[var(--dsn-accent)]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{dict.botInsertIdealCta}</span>
            </button>
          )}
        </div>

        <AiEnhanceTextarea
          id="bot-client-general-prompt"
          fieldKey="bot.client_general_prompt"
          label={dict.botGeneralPromptLabel}
          rows={11}
          disabled={readOnly}
          locale={locale}
          value={instructions}
          onChange={onInstructionsChange}
          context={promptContext}
        />
      </section>
    </div>
  );
}
