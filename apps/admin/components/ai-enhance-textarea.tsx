"use client";

import React, { useState } from "react";

export interface AiEnhanceTextareaProps {
  id?: string;
  name?: string;
  fieldKey: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  inputHint?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  hasInferenceAccess?: boolean;
  onEnhanceRequest?: (fieldKey: string, draft: string) => Promise<{ ok: boolean; suggestion?: string; error?: string }>;
  locale?: "es" | "en";
}

/**
 * Componente transversal de área de texto con capacidad «Mejorar con AI» (AI-001 RF-01, RF-03, T-05).
 *
 * Características:
 * - Cumple Title Case en el Label según AGENTS.md §4.8.
 * - Deshabilita el botón si no hay credenciales de inferencia (BYOK o billetera) explicando el motivo (RF-04.1).
 * - Human-in-the-loop: Muestra la propuesta en un panel de comparación permitiendo editar, aceptar o descartar (RF-03.2).
 * - Nunca guarda sin aceptación explícita del usuario.
 */
export function AiEnhanceTextarea({
  id,
  name,
  fieldKey,
  label,
  value,
  onChange,
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

  const isEs = locale === "es";

  async function handleEnhance() {
    if (!value || value.trim().length === 0) {
      setErrorMessage(
        isEs
          ? "Escribe primero un borrador para que la AI pueda mejorarlo."
          : "Write a draft first so AI can improve it.",
      );
      return;
    }

    if (!hasInferenceAccess) {
      setErrorMessage(
        isEs
          ? "Para usar 'Mejorar con AI' configura tu proveedor BYOK o recarga saldo en tu billetera."
          : "To use 'Improve with AI' configure your BYOK provider or top up your wallet.",
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      if (onEnhanceRequest) {
        const res = await onEnhanceRequest(fieldKey, value);
        if (res.ok && res.suggestion) {
          setSuggestion(res.suggestion);
          setEditedSuggestion(res.suggestion);
        } else {
          setErrorMessage(res.error ?? (isEs ? "Error al procesar la mejora." : "Error processing enhancement."));
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message ?? (isEs ? "Fallo de conexión." : "Connection failed."));
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
    }
  }

  function handleDiscard() {
    setSuggestion(null);
    setEditedSuggestion("");
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-sm font-semibold text-slate-800 dark:text-slate-200"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <button
          type="button"
          onClick={handleEnhance}
          disabled={disabled || loading || !hasInferenceAccess}
          title={
            !hasInferenceAccess
              ? isEs
                ? "Requiere configurar proveedor BYOK o saldo en billetera"
                : "Requires BYOK provider or wallet balance"
              : undefined
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
            !hasInferenceAccess
              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
              : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900 cursor-pointer"
          }`}
        >
          <span>✨</span>
          <span>
            {loading
              ? isEs
                ? "Mejorando..."
                : "Improving..."
              : isEs
                ? "Mejorar Con AI"
                : "Improve With AI"}
          </span>
        </button>
      </div>

      {inputHint && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          💡 {inputHint}
        </p>
      )}

      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50"
      />

      {errorMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
          ⚠️ {errorMessage}
        </p>
      )}

      {suggestion !== null && (
        <div className="mt-2 p-3 bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-indigo-900 dark:text-indigo-200">
            <span>✨ {isEs ? "Propuesta Sugerida Por AI (Puedes Editarla):" : "AI Suggested Proposal (You Can Edit):"}</span>
          </div>

          <textarea
            rows={rows}
            value={editedSuggestion}
            onChange={(e) => setEditedSuggestion(e.target.value)}
            className="w-full rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-indigo-700 dark:bg-slate-900 dark:text-slate-100"
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleDiscard}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {isEs ? "Descartar" : "Discard"}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              {isEs ? "Aceptar Sugerencia" : "Accept Suggestion"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

