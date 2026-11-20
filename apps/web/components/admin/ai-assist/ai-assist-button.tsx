"use client";

import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@mocter/ui";

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
  fieldKey: _fieldKey,
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
      <Button
        type="button"
        variant="ai"
        size="sm"
        onClick={handleClick}
        loading={isLoading}
        loadingText={t("improving")}
        disabled={isLoading || !hasCredentials}
        className="h-auto min-h-[30px] rounded-md px-3 py-1 text-xs font-semibold"
      >
        <span aria-hidden="true" className="text-sm">✨</span>
        <span>{t("buttonText")}</span>
      </Button>

      {warningMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 max-w-sm">
          {warningMessage}
        </p>
      )}

      {/* Comparison Modal */}
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleDiscard()}>
        <DialogContent className="max-w-2xl rounded-xl p-6 shadow-xl space-y-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{t("modalTitle")}</DialogTitle>
            <DialogDescription className="text-xs">{t("modalSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original Draft (Read only) */}
            <div className="space-y-1.5">
              <Label className="block text-xs font-semibold text-[var(--dsn-text-secondary)]">
                {t("originalDraft")}
              </Label>
              <div className="w-full h-36 p-3 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 text-sm overflow-y-auto font-sans select-text">
                {draft}
              </div>
            </div>

            {/* AI Suggestion (Editable) */}
            <div className="space-y-1.5">
              <Label
                htmlFor="editable-ai-suggestion"
                className="block text-xs font-semibold text-[var(--dsn-accent)]"
              >
                {t("aiSuggestion")}
              </Label>
              <Textarea
                id="editable-ai-suggestion"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                className="h-36 p-3 text-sm font-sans resize-none"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--dsn-border)] pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              className="text-xs font-semibold"
            >
              {t("discardButton")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAccept}
              className="text-xs font-semibold"
            >
              {t("acceptButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
