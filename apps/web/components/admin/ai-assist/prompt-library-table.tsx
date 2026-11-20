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
} from "@mocter/ui";

export interface PromptLibraryItem {
  fieldKey: string;
  entity: string;
  columnName: string;
  labels: { es: string; en: string };
  isActive: boolean;
  activePrompt?: {
    id: string;
    version: number;
    masterPrompt: string;
    inputHint: string;
    status: string;
  } | null;
  totalVersions: number;
}

export interface PromptLibraryTableProps {
  fields: PromptLibraryItem[];
  userRole?: string;
  onPromote?: (fieldKey: string, version: number) => Promise<boolean>;
  t?: Partial<Record<string, string>>;
}

const defaultTranslations: Record<string, string> = {
  title: "Biblioteca De Prompts Maestros",
  subtitle: "Catálogo de campos asistidos, prompts versionados y reglas de formato",
  tableField: "Campo Asistido",
  tableEntity: "Entidad / Columna",
  tableVersion: "Versión Activa",
  tableVersionsCount: "Historial",
  tableStatus: "Estado",
  statusActive: "Activo",
  statusDraft: "Borrador",
  statusRetired: "Retirado",
  promoteButton: "Activar Versión",
  newVersionButton: "Nueva Versión De Prompt",
  promptContent: "Prompt Maestro",
  inputHint: "Guía Del Inquilino",
};

/**
 * Tabla administrativa de la biblioteca de prompts maestros (AI-001 T-03, RF-02).
 */
export function PromptLibraryTable({
  fields,
  userRole: _userRole = "platform_admin",
  onPromote: _onPromote,
  t: customT,
}: PromptLibraryTableProps) {
  const t = (key: string) => customT?.[key] ?? defaultTranslations[key] ?? key;

  const [selectedField, setSelectedField] = useState<PromptLibraryItem | null>(null);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-4 md:p-6 text-foreground">
      {/* Header */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
      </div>

      {/* Fields & Prompts Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">{t("tableField")}</th>
              <th scope="col" className="px-4 py-3">{t("tableEntity")}</th>
              <th scope="col" className="px-4 py-3">{t("tableVersion")}</th>
              <th scope="col" className="px-4 py-3">{t("tableVersionsCount")}</th>
              <th scope="col" className="px-4 py-3">{t("tableStatus")}</th>
              <th scope="col" className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fields.map((f) => (
              <tr key={f.fieldKey} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-mono font-medium text-primary text-xs">{f.fieldKey}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.labels.es}</p>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                  {f.entity}.{f.columnName}
                </td>
                <td className="px-4 py-3">
                  {f.activePrompt ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary">
                      v{f.activePrompt.version}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin activo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {f.totalVersions} {f.totalVersions === 1 ? "versión" : "versiones"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      f.isActive && f.activePrompt
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {f.isActive && f.activePrompt ? t("statusActive") : t("statusDraft")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedField(f)}
                    className="h-auto min-h-[30px] px-3 py-1 text-xs font-semibold"
                  >
                    Ver Detalles
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      <Dialog open={Boolean(selectedField)} onOpenChange={(open) => !open && setSelectedField(null)}>
        <DialogContent className="max-w-2xl rounded-xl p-6 shadow-xl space-y-4">
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3">
            <DialogTitle className="text-lg font-bold font-mono text-[var(--dsn-accent)]">
              {selectedField?.fieldKey}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedField?.labels.es} ({selectedField?.entity}.{selectedField?.columnName})
            </DialogDescription>
          </DialogHeader>

          {selectedField?.activePrompt ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                  {t("inputHint")}
                </p>
                <p className="p-2.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 text-xs">
                  {selectedField.activePrompt.inputHint}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                  {t("promptContent")} (v{selectedField.activePrompt.version})
                </p>
                <pre className="p-3 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedField.activePrompt.masterPrompt}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--dsn-text-secondary)]">
              No hay un prompt maestro activo configurado para este campo.
            </p>
          )}

          <DialogFooter className="border-t border-[var(--dsn-border)] pt-3">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setSelectedField(null)}
              className="text-xs font-semibold"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
