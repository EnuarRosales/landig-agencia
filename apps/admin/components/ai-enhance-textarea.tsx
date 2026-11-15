"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Sparkles, RefreshCw, AlertCircle, Check, X } from "lucide-react";

export interface AiEnhanceRequestResult {
  ok: boolean;
  suggestion?: string;
  error?: string;
  code?: string;
}

export interface AiEnhanceTextareaProps {
  id?: string;
  name?: string;
  fieldKey: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  fallbackDraft?: string;
  context?: Record<string, unknown>;
  inputHint?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  hasInferenceAccess?: boolean;
  onEnhanceRequest?: (fieldKey: string, draft: string) => Promise<AiEnhanceRequestResult>;
  locale?: "es" | "en";
}

/**
 * Componente transversal de área de texto con capacidad «Mejorar Con AI».
 *
 * - Cumple Title Case en etiquetas de formulario y diseño adaptativo Mobile First.
 * - Conecta por defecto con `POST /api/ai/enhance` usando sesión autenticada.
 * - Mantiene control humano explícito: propone en vista editable y nunca guarda ni sobreescribe solo.
 */
export function AiEnhanceTextarea({
  id,
  name,
  fieldKey,
  label,
  value,
  onChange,
  fallbackDraft,
  context,
  inputHint,
  placeholder,
  rows = 4,
  disabled = false,
  required = false,
  hasInferenceAccess = true,
  onEnhanceRequest,
  locale = "es",
}: AiEnhanceTextareaProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [editedSuggestion, setEditedSuggestion] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const isEs = locale === "es";

  async function requestEnhancement(draftText: string): Promise<AiEnhanceRequestResult> {
    if (onEnhanceRequest) {
      return onEnhanceRequest(fieldKey, draftText);
    }

    const res = await fetch("/api/ai/enhance", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fieldKey,
        draft: draftText,
        locale,
        context,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          data?: { suggestion?: string };
          detail?: string;
          error?: string;
          code?: string;
        }
      | null;

    if (!res.ok || !json?.ok || !json?.data?.suggestion) {
      return {
        ok: false,
        code: json?.code,
        error:
          json?.detail ??
          json?.error ??
          (isEs
            ? "No fue posible obtener una sugerencia en este momento."
            : "Could not retrieve a suggestion right now."),
      };
    }

    return {
      ok: true,
      suggestion: json.data.suggestion,
    };
  }

  async function handleEnhance() {
    const effectiveDraft = value.trim() || fallbackDraft?.trim() || "";
    if (effectiveDraft.length === 0) {
      setErrorCode(null);
      setErrorMessage(
        isEs
          ? "Escribe primero un borrador para que la AI pueda mejorarlo."
          : "Write a draft first so AI can improve it.",
      );
      return;
    }

    if (!hasInferenceAccess) {
      setErrorCode("AI_BYOK_REQUIRED");
      setErrorMessage(
        isEs
          ? "Para usar 'Mejorar con AI' configura tu proveedor de Inteligencia Artificial."
          : "To use 'Improve With AI' configure your Artificial Intelligence provider.",
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      const res = await requestEnhancement(effectiveDraft);
      if (res.ok && res.suggestion) {
        setSuggestion(res.suggestion);
        setEditedSuggestion(res.suggestion);
      } else {
        setErrorCode(res.code ?? null);
        setErrorMessage(
          res.error ??
            (isEs ? "Error al procesar la mejora." : "Error processing enhancement."),
        );
      }
    } catch (err: unknown) {
      setErrorCode(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : isEs
            ? "Fallo de conexión al solicitar mejora."
            : "Connection failed while requesting enhancement.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    if (editedSuggestion.trim().length > 0) {
      onChange(editedSuggestion.trim());
      setSuggestion(null);
      setEditedSuggestion("");
      setErrorMessage(null);
      setErrorCode(null);
    }
  }

  function handleDiscard() {
    setSuggestion(null);
    setEditedSuggestion("");
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1">
          <label
            htmlFor={id}
            className="text-xs font-semibold text-[var(--dsn-text)]"
          >
            {label}
          </label>
          {required && (
            <span aria-hidden="true" className="text-xs font-semibold text-rose-500">
              *
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleEnhance}
          disabled={disabled || loading || !hasInferenceAccess}
          title={
            !hasInferenceAccess
              ? isEs
                ? "Requiere configurar un proveedor AI activo"
                : "Requires an active AI provider"
              : undefined
          }
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            !hasInferenceAccess
              ? "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] opacity-60 cursor-not-allowed"
              : "border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/12 text-[var(--dsn-accent)] hover:bg-[var(--dsn-accent)]/20 cursor-pointer"
          }`}
        >
          <Sparkles className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} />
          <span>
            {loading
              ? isEs
                ? "Mejorando..."
                : "Improving..."
              : isEs
                ? "Mejorar con AI"
                : "Improve With AI"}
          </span>
        </button>
      </div>

      {inputHint && (
        <p className="text-[11px] text-[var(--dsn-text-secondary)]">
          {inputHint}
        </p>
      )}

      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/60 focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)] disabled:opacity-50 leading-relaxed"
      />

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          {errorCode === "AI_BYOK_REQUIRED" && (
            <Link
              href="/workspace/ai"
              className="font-semibold underline text-[var(--dsn-accent)] hover:opacity-90"
            >
              {isEs ? "Configurar Proveedor AI" : "Configure AI Provider"}
            </Link>
          )}
        </div>
      )}

      {suggestion !== null && (
        <div className="mt-1 rounded-xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/5 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--dsn-text)]">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              {isEs
                ? "Propuesta Sugerida por AI (Editable antes de Aceptar)"
                : "AI Suggested Proposal (Editable Before Accepting)"}
            </span>
          </div>

          <textarea
            rows={rows}
            aria-label={isEs ? "Vista Previa de Sugerencia AI" : "AI Suggestion Preview"}
            value={editedSuggestion}
            onChange={(e) => setEditedSuggestion(e.target.value)}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleEnhance}
              disabled={loading}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-xs font-medium text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              <span>{isEs ? "Generar Otra Opción" : "Try Another Option"}</span>
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-xs font-medium text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            >
              <X className="h-3 w-3" />
              <span>{isEs ? "Descartar" : "Discard"}</span>
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-[var(--dsn-accent)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-xs"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isEs ? "Aceptar Sugerencia" : "Accept Suggestion"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
