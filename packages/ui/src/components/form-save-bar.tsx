"use client";

import * as React from "react";
import { AlertCircle, Check, RotateCcw, Save } from "lucide-react";
import { getUiCompositeLabels, type UiLocale, type UiSaveBarLabels } from "../lib/i18n";
import { useUnsavedChangesGuard } from "../lib/use-unsaved-changes-guard";
import { Button } from "./button";
import { ConfirmationModal } from "./confirmation-modal";

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
  /** Callback opcional de navegación segura al confirmar descarte de cambios pendientes. */
  onNavigate?: (href: string) => void;
  /** Idioma activo (`es` | `en`). */
  locale?: UiLocale;
  /** Etiquetas personalizadas opcionales para sobrescribir el diccionario base. */
  labels?: Partial<UiSaveBarLabels>;
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
 * Barra dual de guardado transversal + guardia de salida segura sobre primitivas de `@mocter/ui`.
 */
export function FormSaveBar({
  isDirty,
  dirtySectionsCount,
  sectionName,
  onSave,
  onDiscard,
  onNavigate,
  locale = "es",
  labels,
  saving = false,
  disabled = false,
  saveLabel,
  savingLabel,
  discardLabel,
  submitType = "button",
  showHeaderButton = false,
  testId = "form-save-bar",
}: FormSaveBarProps) {
  const baseDict = getUiCompositeLabels(locale);
  const dict: UiSaveBarLabels = labels ? { ...baseDict, ...labels } : baseDict;

  const guard = useUnsavedChangesGuard({
    isDirty,
    onDiscard,
    onNavigate,
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
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={guard.requestDiscard}
              data-testid={`${testId}-header-discard`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" aria-hidden="true" />
              <span>{resolvedDiscardLabel}</span>
            </Button>
          )}
          <Button
            type={submitType}
            variant="primary"
            disabled={disabled}
            loading={saving}
            loadingText={resolvedSavingLabel}
            onClick={submitType === "button" ? () => void onSave() : undefined}
            data-testid={`${testId}-header-save`}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{resolvedSaveLabel}</span>
          </Button>
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
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold text-[var(--dsn-text)]">{dict.saveBarUnsavedChanges}</p>
              <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                {pendingSummary}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={guard.requestDiscard}
              data-testid={`${testId}-discard`}
              className="rounded-xl bg-[var(--dsn-surface-secondary)]"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" aria-hidden="true" />
              <span>{resolvedDiscardLabel}</span>
            </Button>

            <Button
              type={submitType}
              variant="primary"
              disabled={disabled}
              loading={saving}
              loadingText={resolvedSavingLabel}
              onClick={submitType === "button" ? () => void onSave() : undefined}
              data-testid={`${testId}-submit`}
              className="rounded-xl"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>{resolvedSaveLabel}</span>
            </Button>
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
