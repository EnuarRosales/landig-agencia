/**
 * Idiomas soportados por los componentes compuestos de `@mocter/ui`.
 */
export type UiLocale = "es" | "en";

export interface UiTableLabels {
  tableSearchPlaceholder: string;
  tableClearFilters: string;
  tableShowingPrefix: string;
  tableShowingOf: string;
  tableShowingSuffix: string;
  tablePerPage: string;
  tablePrev: string;
  tableNext: string;
  tablePageLabel: string;
  tablePageOf: string;
  tableErrorTitle: string;
  tableErrorRetry: string;
  tableSortAsc: string;
  tableSortDesc: string;
  tableDensityLabel: string;
  tableDensityCompact: string;
  tableDensityNormal: string;
  tableDensityComfortable: string;
  tableLoadingText: string;
}

export interface UiSaveBarLabels {
  saveBarUnsavedChanges: string;
  saveBarPendingOne: string;
  saveBarPendingMany: string;
  saveBarSaveCta: string;
  saveBarSavingCta: string;
  saveBarDiscardCta: string;
  saveBarModalTitle: string;
  saveBarModalSubtitle: string;
  saveBarModalWarning: string;
  saveBarModalConfirmDiscard: string;
  saveBarModalKeepEditing: string;
  saveBarModalDetailSection: string;
}

export type UiCompositeLabels = UiTableLabels & UiSaveBarLabels;

const UI_DICTIONARIES: Record<UiLocale, UiCompositeLabels> = {
  es: {
    tableSearchPlaceholder: "Buscar...",
    tableClearFilters: "Limpiar Filtros",
    tableShowingPrefix: "Mostrando",
    tableShowingOf: "de",
    tableShowingSuffix: "resultados",
    tablePerPage: "Por página",
    tablePrev: "Anterior",
    tableNext: "Siguiente",
    tablePageLabel: "Página",
    tablePageOf: "de",
    tableErrorTitle: "No pudimos cargar los registros.",
    tableErrorRetry: "Reintentar",
    tableSortAsc: "Orden ascendente",
    tableSortDesc: "Orden descendente",
    tableDensityLabel: "Densidad",
    tableDensityCompact: "Compacta",
    tableDensityNormal: "Estándar",
    tableDensityComfortable: "Cómoda",
    tableLoadingText: "Cargando registros...",
    saveBarUnsavedChanges: "Tienes cambios sin guardar",
    saveBarPendingOne: "1 sección modificada",
    saveBarPendingMany: "secciones modificadas",
    saveBarSaveCta: "Guardar Cambios",
    saveBarSavingCta: "Guardando...",
    saveBarDiscardCta: "Descartar Cambios",
    saveBarModalTitle: "Cambios sin Guardar",
    saveBarModalSubtitle: "Tienes modificaciones pendientes que aún no se han guardado.",
    saveBarModalWarning:
      "Si continúas sin guardar, perderás todos los cambios realizados desde tu último guardado.",
    saveBarModalConfirmDiscard: "Descartar Cambios",
    saveBarModalKeepEditing: "Seguir Editando",
    saveBarModalDetailSection: "Formulario",
  },
  en: {
    tableSearchPlaceholder: "Search...",
    tableClearFilters: "Clear Filters",
    tableShowingPrefix: "Showing",
    tableShowingOf: "of",
    tableShowingSuffix: "results",
    tablePerPage: "Per page",
    tablePrev: "Previous",
    tableNext: "Next",
    tablePageLabel: "Page",
    tablePageOf: "of",
    tableErrorTitle: "Could not load records.",
    tableErrorRetry: "Retry",
    tableSortAsc: "Sort ascending",
    tableSortDesc: "Sort descending",
    tableDensityLabel: "Density",
    tableDensityCompact: "Compact",
    tableDensityNormal: "Standard",
    tableDensityComfortable: "Comfortable",
    tableLoadingText: "Loading records...",
    saveBarUnsavedChanges: "You have unsaved changes",
    saveBarPendingOne: "1 modified section",
    saveBarPendingMany: "modified sections",
    saveBarSaveCta: "Save Changes",
    saveBarSavingCta: "Saving...",
    saveBarDiscardCta: "Discard Changes",
    saveBarModalTitle: "Unsaved Changes",
    saveBarModalSubtitle: "You have pending modifications that have not been saved yet.",
    saveBarModalWarning:
      "If you continue without saving, all changes made since your last save will be lost.",
    saveBarModalConfirmDiscard: "Discard Changes",
    saveBarModalKeepEditing: "Keep Editing",
    saveBarModalDetailSection: "Form",
  },
};

/**
 * Devuelve el diccionario base de etiquetas bilingües para los compuestos de `@mocter/ui`.
 */
export function getUiCompositeLabels(locale: UiLocale = "es"): UiCompositeLabels {
  return UI_DICTIONARIES[locale] ?? UI_DICTIONARIES.es;
}
