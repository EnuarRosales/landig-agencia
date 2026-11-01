"use client";

import React, { useState } from "react";

export interface AiAssistButtonProps {
  fieldKey: string;
  draft: string;
  hasCredentials?: boolean;
  onAccept: (suggestedText: string) => void;
  onImprove?: (draft: string) => Promise<{ suggestion: string; promptVersion?: number } | null>;
  t?: Partial<Record<string, string>>;
}

const defaultTranslations: Record<string, string> = {
  buttonText: "Mejorar Con AI",
  improving: "Mejorando Con AI...",
  modalTitle: "Revisar Sugerencia De AI",
  modalSubtitle: "Compara tu borrador original con la versión sugerida antes de aceptar",
  originalDraft: "Borrador Original",
  aiSuggestion: "Sugerencia De AI (Editable)",
  acceptButton: "Aceptar Sugerencia",
  discardButton: "Descartar",
  noCredentialsWarning: "Para usar «Mejorar con AI» debes configurar tu proveedor de inferencia (BYOK) o recargar tu billetera Mocter.",
  rateLimitWarning: "Has alcanzado el límite de peticiones por minuto. Espera un momento antes de volver a intentar.",
  emptyDraftWarning: "Escribe un borrador primero para que la AI pueda mejorarlo.",
};

/**
 * Botón interactivo «Mejorar con AI» y modal de revisión/aceptación (AI-001 T-05, T-06, RF-03.2).
 * La sugerencia NUNCA se persiste sola; el inquilino siempre la compara, edita, acepta o descarta.
 */
export function AiAssistButton({
  fieldKey,
  draft,
  hasCredentials = true,
  onAccept,
  onImprove,
  t: customT,
}: AiAssistButtonProps) {
  const t = (key: string) => customT?.[key] ?? defaultTranslations[key] ?? key;

  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setWarningMessage(null);

    if (!hasCredentials) {
      setWarningMessage(t("noCredentialsWarning"));
      return;
    }

    if (!draft || draft.trim().length === 0) {
      setWarningMessage(t("emptyDraftWarning"));
      return;
    }

    setIsLoading(true);

    try {
      if (onImprove) {
        const res = await onImprove(draft);
        if (res?.suggestion) {
          setSuggestion(res.suggestion);
          setIsOpen(true);
        }
      } else {
        // Fallback default simulation for testing / demo
        setSuggestion(
          `${draft.trim()} optimizado con enfoque persuasivo y conversacional por Mocter AI.`,
        );
        setIsOpen(true);
      }
    } catch {
      setWarningMessage(t("rateLimitWarning"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () => {
    onAccept(suggestion);
    setIsOpen(false);
    setWarningMessage(null);
  };

  const handleDiscard = () => {
    setIsOpen(false);
    setWarningMessage(null);
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading || !hasCredentials}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span aria-hidden="true" className="text-sm">✨</span>
        <span>{isLoading ? t("improving") : t("buttonText")}</span>
      </button>

      {warningMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 max-w-sm">
          {warningMessage}
        </p>
      )}

      {/* Comparison Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0"
        >
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl space-y-5">
            <div>
              <h3 id="modal-title" className="text-lg font-bold">
                {t("modalTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("modalSubtitle")}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original Draft (Read only) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground">
                  {t("originalDraft")}
                </label>
                <div className="w-full h-36 p-3 rounded-lg border border-border bg-muted/30 text-sm overflow-y-auto font-sans select-text">
                  {draft}
                </div>
              </div>

              {/* AI Suggestion (Editable) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="editable-ai-suggestion"
                  className="block text-xs font-semibold text-primary"
                >
                  {t("aiSuggestion")}
                </label>
                <textarea
                  id="editable-ai-suggestion"
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  className="w-full h-36 p-3 rounded-lg border border-primary/40 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-sans resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t("discardButton")}
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t("acceptButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
