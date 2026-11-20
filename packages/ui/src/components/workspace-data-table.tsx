"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
} from "lucide-react";
import { getUiCompositeLabels, type UiLocale, type UiTableLabels } from "../lib/i18n";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { Select } from "./select";
import { Skeleton } from "./skeleton";

export type WorkspaceTableDensity = "compact" | "normal" | "comfortable";
export type WorkspaceTableSortDir = "asc" | "desc";

export interface WorkspaceTableColumn<T> {
  /** Identificador único de columna. */
  key: string;
  /** Etiqueta de cabecera visible (Title Case). */
  header: string;
  /** Etiqueta alterna para la tarjeta móvil cuando difiere de `header`. */
  mobileLabel?: string;
  /** Renderizador de celda para vista escritorio y tarjeta móvil automática. */
  renderCell: (row: T, index: number) => React.ReactNode;
  /** Si la columna soporta ordenamiento. */
  sortable?: boolean;
  /** Clave de ordenamiento enviada al servidor cuando difiere de `key`. */
  sortKey?: string;
  /** Extractor local para modo cliente cuando no hay `onSortChange`. */
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
  /** Aplica tipografía tabular monoespaciada. */
  isNumeric?: boolean;
  /** Alineación horizontal en escritorio. */
  align?: "left" | "center" | "right";
  /** Clases adicionales para `<th>`. */
  headerClassName?: string;
  /** Clases adicionales para `<td>`. */
  cellClassName?: string;
  /** Oculta esta columna en la tarjeta móvil automática. */
  mobileHidden?: boolean;
}

export interface WorkspaceDataTableEmptyState {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  testId?: string;
}

export interface WorkspaceDataTableProps<T> {
  /** Registros actuales a mostrar (página actual en modo servidor, o lista completa en modo cliente). */
  data: T[];
  /** Definición de columnas compartidas entre vista escritorio y fallback móvil. */
  columns: WorkspaceTableColumn<T>[];
  /** Función estable para la clave React de cada fila. */
  getRowKey: (row: T, index: number) => string;
  /** Renderizador personalizado de tarjeta para pantallas `< md`. */
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  /** Idioma activo (`es` | `en`). */
  locale?: UiLocale;
  /** Etiquetas personalizadas opcionales para sobrescribir el diccionario base. */
  labels?: Partial<UiTableLabels>;
  /** Total de registros en modo controlado por servidor. */
  totalItems?: number;
  /** Página actual (1-indexed) en modo controlado. */
  page?: number;
  /** Tamaño de página actual (`10`, `20` o `50`). */
  pageSize?: number;
  /** Tamaño de página inicial en modo cliente. */
  defaultPageSize?: 10 | 20 | 50;
  /** Opciones del selector de tamaño de página. */
  pageSizeOptions?: readonly number[];
  /** Callback de cambio de página (activa modo paginación controlada). */
  onPageChange?: (page: number) => void;
  /** Callback de cambio de tamaño de página. */
  onPageSizeChange?: (pageSize: number) => void;
  /** Columna ordenada actualmente. */
  sortBy?: string | null;
  /** Dirección de ordenamiento actual. */
  sortDir?: WorkspaceTableSortDir;
  /** Callback de ordenamiento controlado por servidor. */
  onSortChange?: (sortBy: string, sortDir: WorkspaceTableSortDir) => void;
  /** Valor de búsqueda controlado. */
  searchQuery?: string;
  /** Callback de búsqueda con debounce (`300ms` por defecto). */
  onSearchChange?: (query: string) => void;
  /** Extractor o claves para búsqueda automática en modo cliente. */
  searchKeys?: Array<keyof T | ((row: T) => string | null | undefined)>;
  /** Placeholder del campo de búsqueda. */
  searchPlaceholder?: string;
  /** Tiempo de espera para el debounce de búsqueda en milisegundos. */
  searchDebounceMs?: number;
  /** Muestra u oculta el buscador integrado. */
  searchable?: boolean;
  /** Controles adicionales alineados a la izquierda en la barra superior (ej. pestañas). */
  toolbarLeft?: React.ReactNode;
  /** Selectores o filtros adicionales en la barra superior. */
  filterSlot?: React.ReactNode;
  /** Acciones adicionales alineadas a la derecha en la barra superior. */
  toolbarRight?: React.ReactNode;
  /** Conteo de filtros externos activos para habilitar el botón «Limpiar Filtros». */
  activeFiltersCount?: number;
  /** Callback al pulsar «Limpiar Filtros». */
  onResetFilters?: () => void;
  /** Habilita el selector de densidad visual. */
  showDensityToggle?: boolean;
  /** Densidad inicial. */
  defaultDensity?: WorkspaceTableDensity;
  /** Estado de carga asíncrona. */
  loading?: boolean;
  /** Mensaje de error recuperable con acción de reintento. */
  error?: string | null;
  /** Callback de reintento cuando `error` está presente. */
  onRetry?: () => void;
  /** Configuración del estado vacío. */
  emptyState?: WorkspaceDataTableEmptyState;
  /** Clases extra para cada fila `<tr>`. */
  rowClassName?: (row: T) => string;
  /** Acción opcional al hacer clic en una fila de escritorio. */
  onRowClick?: (row: T) => void;
  /** Clases extra para el contenedor raíz de la tabla. */
  containerClassName?: string;
  /** Identificador de pruebas para el componente completo. */
  testId?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function compareSortValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Tabla estándar transversal para backoffice construida sobre primitivas de `@mocter/ui`.
 *
 * Soporta operación híbrida (cliente y servidor), paginación, búsqueda debounced,
 * ordenamiento accesible y degradación Mobile First `< md` a tarjetas apiladas.
 */
export function WorkspaceDataTable<T>({
  data,
  columns,
  getRowKey,
  renderMobileCard,
  locale = "es",
  labels,
  totalItems,
  page: controlledPage,
  pageSize: controlledPageSize,
  defaultPageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  sortBy: controlledSortBy,
  sortDir: controlledSortDir,
  onSortChange,
  searchQuery: controlledSearchQuery,
  onSearchChange,
  searchKeys,
  searchPlaceholder,
  searchDebounceMs = 300,
  searchable,
  toolbarLeft,
  filterSlot,
  toolbarRight,
  activeFiltersCount = 0,
  onResetFilters,
  showDensityToggle = false,
  defaultDensity = "normal",
  loading = false,
  error = null,
  onRetry,
  emptyState,
  rowClassName,
  onRowClick,
  containerClassName = "",
  testId = "workspace-data-table",
}: WorkspaceDataTableProps<T>) {
  const baseDict = getUiCompositeLabels(locale);
  const dict: UiTableLabels = labels ? { ...baseDict, ...labels } : baseDict;

  const isServerPaginated = typeof onPageChange === "function" || typeof totalItems === "number";
  const isSearchEnabled =
    searchable ??
    Boolean(
      typeof onSearchChange === "function" ||
        controlledSearchQuery !== undefined ||
        (searchKeys && searchKeys.length > 0),
    );

  const normalizedOptions = useMemo(() => {
    const valid = pageSizeOptions.filter((n) => Number.isInteger(n) && n >= 1 && n <= 50);
    return valid.length > 0 ? valid : [...DEFAULT_PAGE_SIZE_OPTIONS];
  }, [pageSizeOptions]);

  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(
    normalizedOptions.includes(defaultPageSize) ? defaultPageSize : normalizedOptions[0],
  );
  const [internalSortBy, setInternalSortBy] = useState<string | null>(null);
  const [internalSortDir, setInternalSortDir] = useState<WorkspaceTableSortDir>("desc");
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [searchDraft, setSearchDraft] = useState<{
    base: string | undefined;
    value: string;
  } | null>(null);
  const [density, setDensity] = useState<WorkspaceTableDensity>(defaultDensity);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const searchInputValue =
    controlledSearchQuery !== undefined
      ? searchDraft && searchDraft.base === controlledSearchQuery
        ? searchDraft.value
        : controlledSearchQuery
      : internalSearchTerm;

  const activePageSize = controlledPageSize ?? internalPageSize;
  const activeSortBy = controlledSortBy !== undefined ? controlledSortBy : internalSortBy;
  const activeSortDir = controlledSortDir ?? internalSortDir;

  const clientFilteredRows = useMemo(() => {
    if (isServerPaginated) return data;
    const term = searchInputValue.trim().toLowerCase();
    if (!term || !searchKeys || searchKeys.length === 0) return data;

    return data.filter((row) =>
      searchKeys.some((extractor) => {
        const raw =
          typeof extractor === "function"
            ? extractor(row)
            : (row[extractor] as unknown as string | number | null | undefined);
        return raw !== null && raw !== undefined && String(raw).toLowerCase().includes(term);
      }),
    );
  }, [data, isServerPaginated, searchInputValue, searchKeys]);

  const clientSortedRows = useMemo(() => {
    if (isServerPaginated || onSortChange || !activeSortBy) {
      return clientFilteredRows;
    }

    const col = columns.find((c) => (c.sortKey ?? c.key) === activeSortBy);
    if (!col) return clientFilteredRows;

    const sorted = [...clientFilteredRows].sort((a, b) => {
      const aVal = col.sortValue
        ? col.sortValue(a)
        : ((a as Record<string, unknown>)[activeSortBy] ?? null);
      const bVal = col.sortValue
        ? col.sortValue(b)
        : ((b as Record<string, unknown>)[activeSortBy] ?? null);
      const cmp = compareSortValues(aVal, bVal);
      return activeSortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [activeSortBy, activeSortDir, clientFilteredRows, columns, isServerPaginated, onSortChange]);

  const resolvedTotal = isServerPaginated ? (totalItems ?? data.length) : clientSortedRows.length;
  const totalPages = Math.max(1, Math.ceil(resolvedTotal / activePageSize));
  const rawPage = controlledPage ?? internalPage;
  const currentPage = Math.min(Math.max(1, rawPage), totalPages);

  const visibleRows = useMemo(() => {
    if (isServerPaginated) return data;
    const start = (currentPage - 1) * activePageSize;
    return clientSortedRows.slice(start, start + activePageSize);
  }, [activePageSize, clientSortedRows, currentPage, data, isServerPaginated]);

  const cellPadding =
    density === "compact"
      ? "px-3 py-2 text-xs"
      : density === "comfortable"
        ? "px-5 py-4 text-sm"
        : "px-4 py-3 text-xs md:text-sm";

  const hasActiveSearch = searchInputValue.trim().length > 0;
  const showResetButton =
    Boolean(onResetFilters || hasActiveSearch || activeFiltersCount > 0) &&
    (hasActiveSearch || activeFiltersCount > 0);

  function handleSearchInput(nextValue: string) {
    if (controlledSearchQuery !== undefined) {
      setSearchDraft({ base: controlledSearchQuery, value: nextValue });
    } else {
      setInternalSearchTerm(nextValue);
      setInternalPage(1);
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (onSearchChange) {
      if (searchDebounceMs <= 0) {
        onSearchChange(nextValue);
      } else {
        searchTimerRef.current = setTimeout(() => {
          onSearchChange(nextValue);
        }, searchDebounceMs);
      }
    }
  }

  function handleClearAllFilters() {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    setSearchDraft(null);
    setInternalSearchTerm("");
    setInternalPage(1);
    if (onResetFilters) {
      onResetFilters();
    } else if (onSearchChange) {
      onSearchChange("");
    }
  }

  function handlePageChange(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    if (onPageChange) {
      onPageChange(clamped);
    } else {
      setInternalPage(clamped);
    }
  }

  function handlePageSizeChange(nextLimit: number) {
    if (onPageSizeChange) {
      onPageSizeChange(nextLimit);
    } else {
      setInternalPageSize(nextLimit);
      setInternalPage(1);
    }
  }

  function handleHeaderSort(col: WorkspaceTableColumn<T>) {
    if (!col.sortable) return;
    const key = col.sortKey ?? col.key;
    const nextDir: WorkspaceTableSortDir =
      activeSortBy === key && activeSortDir === "asc" ? "desc" : "asc";

    if (onSortChange) {
      onSortChange(key, nextDir);
    } else {
      setInternalSortBy(key);
      setInternalSortDir(nextDir);
      setInternalPage(1);
    }
  }

  const startItem = resolvedTotal === 0 ? 0 : (currentPage - 1) * activePageSize + 1;
  const endItem = resolvedTotal === 0 ? 0 : Math.min(currentPage * activePageSize, resolvedTotal);
  const mobileColumns = useMemo(() => columns.filter((col) => !col.mobileHidden), [columns]);

  const showToolbar = Boolean(
    toolbarLeft || isSearchEnabled || filterSlot || showResetButton || showDensityToggle || toolbarRight,
  );

  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs",
        containerClassName,
      )}
    >
      {showToolbar && (
        <div className="border-b border-[var(--dsn-border)] px-4 py-3.5 md:px-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {toolbarLeft ? <div className="flex flex-wrap items-center gap-2">{toolbarLeft}</div> : null}

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {isSearchEnabled && (
              <Input
                type="search"
                value={searchInputValue}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder={searchPlaceholder ?? dict.tableSearchPlaceholder}
                aria-label={searchPlaceholder ?? dict.tableSearchPlaceholder}
                leftIcon={<Search className="h-4 w-4" />}
                wrapperClassName="min-w-[200px] flex-1 sm:max-w-xs"
                className="bg-[var(--dsn-background)] text-xs"
              />
            )}

            {filterSlot}

            {showResetButton && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleClearAllFilters}
                data-testid={`${testId}-clear-filters`}
              >
                <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" aria-hidden="true" />
                <span>{dict.tableClearFilters}</span>
              </Button>
            )}

            {showDensityToggle && (
              <div
                className="inline-flex items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-0.5"
                role="group"
                aria-label={dict.tableDensityLabel}
              >
                {(
                  [
                    { id: "compact", label: dict.tableDensityCompact },
                    { id: "normal", label: dict.tableDensityNormal },
                    { id: "comfortable", label: dict.tableDensityComfortable },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    size="sm"
                    variant={density === opt.id ? "primary" : "ghost"}
                    onClick={() => setDensity(opt.id)}
                    className="text-[11px]"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}

            {toolbarRight}
          </div>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 p-8 text-center"
          data-testid={`${testId}-error`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.tableErrorTitle}</p>
            <p className="text-xs text-rose-400">{error}</p>
          </div>
          {onRetry && (
            <Button type="button" variant="secondary" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" aria-hidden="true" />
              <span>{dict.tableErrorRetry}</span>
            </Button>
          )}
        </div>
      ) : loading ? (
        <div
          aria-busy="true"
          aria-label={dict.tableLoadingText}
          data-testid={`${testId}-loading`}
          className="divide-y divide-[var(--dsn-border)] p-4 md:p-5 space-y-3"
        >
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 pt-3 first:pt-0">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/5" />
            </div>
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <div
          role="status"
          data-testid={emptyState?.testId ?? `${testId}-empty`}
          className="p-10 text-center space-y-3"
        >
          {emptyState?.icon ? <div className="flex justify-center">{emptyState.icon}</div> : null}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--dsn-text)]">
              {emptyState?.title ?? dict.tableErrorTitle}
            </p>
            {emptyState?.description ? (
              <p className="text-xs text-[var(--dsn-text-secondary)] max-w-md mx-auto">
                {emptyState.description}
              </p>
            ) : null}
          </div>
          {emptyState?.action ? <div className="pt-1">{emptyState.action}</div> : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 p-4 md:hidden" data-testid={`${testId}-mobile-cards`}>
            {visibleRows.map((row, idx) =>
              renderMobileCard ? (
                <React.Fragment key={getRowKey(row, idx)}>
                  {renderMobileCard(row, idx)}
                </React.Fragment>
              ) : (
                <article
                  key={getRowKey(row, idx)}
                  className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-4 shadow-xs"
                >
                  <dl className="space-y-2">
                    {mobileColumns.map((col) => (
                      <div key={col.key} className="flex items-start justify-between gap-3">
                        <dt className="text-[11px] font-medium text-[var(--dsn-text-secondary)] shrink-0">
                          {col.mobileLabel ?? col.header}
                        </dt>
                        <dd
                          className={`text-xs text-right text-[var(--dsn-text)] ${
                            col.isNumeric ? "font-mono tabular-nums" : ""
                          }`}
                        >
                          {col.renderCell(row, idx)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ),
            )}
          </div>

          <div className="hidden md:block overflow-x-auto" data-testid={`${testId}-desktop-table`}>
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-[var(--dsn-surface-secondary)] text-xs text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  {columns.map((col) => {
                    const colSortKey = col.sortKey ?? col.key;
                    const isSorted = activeSortBy === colSortKey;
                    const alignClass =
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left";
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={
                          col.sortable
                            ? isSorted
                              ? activeSortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                            : undefined
                        }
                        className={`${cellPadding} font-semibold ${alignClass} ${col.headerClassName ?? ""}`}
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleHeaderSort(col)}
                            aria-label={`${col.header} (${isSorted && activeSortDir === "asc" ? dict.tableSortDesc : dict.tableSortAsc})`}
                            className={`inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)] transition-colors cursor-pointer ${
                              col.align === "right" ? "ml-auto" : ""
                            }`}
                          >
                            <span>{col.header}</span>
                            {isSorted ? (
                              activeSortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)] bg-[var(--dsn-surface)]">
                {visibleRows.map((row, idx) => (
                  <tr
                    key={getRowKey(row, idx)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`transition-colors hover:bg-[var(--dsn-surface-secondary)]/50 ${
                      onRowClick ? "cursor-pointer" : ""
                    } ${rowClassName ? rowClassName(row) : ""}`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left";
                      return (
                        <td
                          key={col.key}
                          className={`${cellPadding} text-[var(--dsn-text)] ${alignClass} ${
                            col.isNumeric ? "font-mono tabular-nums" : ""
                          } ${col.cellClassName ?? ""}`}
                        >
                          {col.renderCell(row, idx)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!error && resolvedTotal > 0 && (
        <div
          data-testid={`${testId}-pagination`}
          className="flex flex-col gap-3 border-t border-[var(--dsn-border)] px-4 py-3 text-xs text-[var(--dsn-text-secondary)] sm:flex-row sm:items-center sm:justify-between md:px-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid={`${testId}-summary`}>
              {dict.tableShowingPrefix}{" "}
              <strong className="font-mono text-[var(--dsn-text)]">
                {startItem}–{endItem}
              </strong>{" "}
              {dict.tableShowingOf}{" "}
              <strong className="font-mono text-[var(--dsn-text)]">{resolvedTotal}</strong>{" "}
              {dict.tableShowingSuffix}
            </span>

            <label className="inline-flex items-center gap-1.5">
              <span>{dict.tablePerPage}:</span>
              <Select
                value={activePageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                aria-label={dict.tablePerPage}
                data-testid={`${testId}-page-size`}
                className="w-auto min-h-[34px] rounded-md bg-[var(--dsn-background)] px-2 py-1 pr-7 text-xs font-mono"
              >
                {normalizedOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => handlePageChange(currentPage - 1)}
              aria-label={dict.tablePrev}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dict.tablePrev}</span>
            </Button>

            <span className="px-2 font-mono text-xs text-[var(--dsn-text)]">
              {dict.tablePageLabel} {currentPage} {dict.tablePageOf} {totalPages}
            </span>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={currentPage >= totalPages || loading}
              onClick={() => handlePageChange(currentPage + 1)}
              aria-label={dict.tableNext}
            >
              <span>{dict.tableNext}</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
