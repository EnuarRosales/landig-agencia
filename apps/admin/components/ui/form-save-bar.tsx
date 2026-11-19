"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, RotateCcw, Save } from "lucide-react";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { ConfirmationModal } from "@/components/confirmation-modal";

export interface FormSaveBarProps {
  /** Indica si hay modificaciones pendientes por guardar respecto al último estado confirmado. */
  isDirty: boolean;
  /** Cantidad de secciones o grupos modificados (por defecto 1 cuando `isDirty` es verdadero). */
  dirtySectionsCount?: number;
  /** Nombre legible del módulo/formulario para mostrar en el modal de confirmación. */
  sectionName?: string;
  /** Handler de guardado principal. */
  onSave: () => void | Promise<void>;
  /** Handler para restaurar los valores originales al confirmar el descarte. */
  onDiscard: () => void;
  /** Idioma activo (`es` | `en`). */
  locale?: AdminLocale;
  /** Estado de guardado en curso. */
  saving?: boolean;
  /** Deshabilita la acción de guardado (ej. lectura operativa o validación incompleta). */
  disabled?: boolean;
  /** Etiqueta personalizada del botón Guardar en Title Case. */
  saveLabel?: string;
  /** Etiqueta personalizada durante el guardado. */
  savingLabel?: string;
  /** Etiqueta personalizada del botón Descartar en Title Case. */
  discardLabel?: string;
  /** Tipo de botón Guardar en la barra flotante (`button` o `submit`). */
  submitType?: "button" | "submit";
  /** Renderiza un segundo botón Guardar en cabecera cuando la vista delega el botón superior. */
  showHeaderButton?: boolean;
  /** Identificador estable de pruebas. */
  testId?: string;
}

/**
 * Barra dual de guardado transversal + guardia de salida segura para formularios extensos (`SPEC-17 AIB-04`).
 *
 * - Integra {@link useUnsavedChangesGuard} (`beforeunload` + `requestGuardedNavigation` del shell).
 * - Renderiza barra flotante `sticky bottom-4` únicamente mientras `isDirty === true`.
 * - Toda confirmación de descarte utiliza `<ConfirmationModal />` con tokens `--dsn-*` (Regla 4.17).
 */
export function FormSaveBar({
  isDirty,
  dirtySectionsCount,
  sectionName,
  onSave,
  onDiscard,
  locale = "es",
  saving = false,
  disabled = false,
  saveLabel,
  savingLabel,
  discardLabel,
  submitType = "button",
  showHeaderButton = false,
  testId = "form-save-bar",
}: FormSaveBarProps) {
  const router = useRouter();
  const dict = getAdminDictionary(locale).workspace;

  const guard = useUnsavedChangesGuard({
    isDirty,
    onDiscard,
    onNavigate: (href) => router.push(href),
  });

  const resolvedSaveLabel = saveLabel ?? dict.saveBarSaveCta;
  const resolvedSavingLabel = savingLabel ?? dict.saveBarSavingCta;
  const resolvedDiscardLabel = discardLabel ?? dict.saveBarDiscardCta;
  const count = dirtySectionsCount ?? (isDirty ? 1 : 0);
  const pendingSummary =
    count <= 1 ? dict.saveBarPendingOne : `${count} ${dict.saveBarPendingMany}`;

  return (
    <>
      {showHeaderButton && (
        <div className="flex items-center justify-end gap-2">
          {isDirty && (
            <button
              type="button"
              disabled={saving}
              onClick={guard.requestDiscard}
              data-testid={`${testId}-header-discard`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{resolvedDiscardLabel}</span>
            </button>
          )}
          <button
            type={submitType}
            disabled={saving || disabled}
            onClick={submitType === "button" ? () => void onSave() : undefined}
            data-testid={`${testId}-header-save`}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{saving ? resolvedSavingLabel : resolvedSaveLabel}</span>
          </button>
        </div>
      )}

      {isDirty && (
        <div
          role="region"
          aria-label={dict.saveBarUnsavedChanges}
          data-testid={testId}
          className="sticky bottom-4 z-30 mt-6 flex flex-col gap-3 rounded-2xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-surface)]/95 p-3.5 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2.5 text-xs">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25">
              <AlertCircle className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold text-[var(--dsn-text)]">{dict.saveBarUnsavedChanges}</p>
              <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                {pendingSummary}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={guard.requestDiscard}
              data-testid={`${testId}-discard`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]/40 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{resolvedDiscardLabel}</span>
            </button>

            <button
              type={submitType}
              disabled={saving || disabled}
              onClick={submitType === "button" ? () => void onSave() : undefined}
              data-testid={`${testId}-submit`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>{saving ? resolvedSavingLabel : resolvedSaveLabel}</span>
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={guard.discardModalOpen}
        onClose={guard.cancelDiscard}
        onConfirm={guard.confirmDiscard}
        title={dict.saveBarModalTitle}
        subtitle={dict.saveBarModalSubtitle}
        variant="warning"
        warningTitle={dict.saveBarModalTitle}
        warningMessage={dict.saveBarModalWarning}
        confirmText={dict.saveBarModalConfirmDiscard}
        cancelText={dict.saveBarModalKeepEditing}
        details={
          sectionName
            ? [{ label: dict.saveBarModalDetailSection, value: sectionName }]
            : []
        }
      />
    </>
  );
}
