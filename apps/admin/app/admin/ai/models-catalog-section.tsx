"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Percent,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type { AdminAiModelDto, AdminAiProviderDto } from "@mocter/domain";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Select,
} from "@mocter/ui";

/**
 * Columnas ordenables del catálogo de modelos LLM en la consola SaaS.
 */
export type ModelsCatalogSortField =
  | "model"
  | "provider"
  | "context"
  | "spread"
  | "retail"
  | "status";

/**
 * Propiedades requeridas por la sección paginada y filtrable de modelos LLM.
 */
export interface ModelsCatalogSectionProps {
  /** Lista completa de modelos LLM activos e inactivos cargados en la consola. */
  models: AdminAiModelDto[];
  /** Catálogo de proveedores LLM para resolver nombres visibles y alimentar el filtro por proveedor. */
  providers: AdminAiProviderDto[];
  /** Indica si existe una mutación en curso para evitar acciones duplicadas por fila. */
  loading: boolean;
  /** Abre el modal de creación de un nuevo modelo LLM. */
  onOpenCreateModel: () => void;
  /** Abre el modal de configuración/edición para el modelo seleccionado. */
  onOpenEditModel: (model: AdminAiModelDto) => void;
  /** Promueve el modelo seleccionado como modelo por defecto de su proveedor. */
  onQuickSetDefault: (model: AdminAiModelDto) => void;
  /** Solicita confirmación mediante modal para eliminar o archivar el modelo seleccionado. */
  onRequestDeleteModel: (model: AdminAiModelDto) => void;
}

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

/**
 * Sección interactiva «Catálogo De Modelos LLM y Spread Comercial» para el backoffice SaaS.
 *
 * Implementa búsqueda textual, filtros por proveedor/estado/modelo por defecto,
 * ordenamiento clicable por columnas, paginación client-side (`5/10/25/50`, `10` por defecto)
 * y adaptación Mobile First sobre un único árbol DOM accesible sin diálogos nativos.
 *
 * @param props - Modelos, proveedores y manejadores de acciones CRUD por fila.
 */
export function ModelsCatalogSection({
  models,
  providers,
  loading,
  onOpenCreateModel,
  onOpenEditModel,
  onQuickSetDefault,
  onRequestDeleteModel,
}: ModelsCatalogSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [onlyDefaults, setOnlyDefaults] = useState(false);
  const [sortField, setSortField] = useState<ModelsCatalogSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const providerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providers) {
      map.set(provider.code, provider.name);
    }
    return map;
  }, [providers]);

  const providerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providers) {
      map.set(provider.code, provider.name);
    }
    for (const model of models) {
      if (!map.has(model.providerCode)) {
        map.set(model.providerCode, model.providerCode);
      }
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [providers, models]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    providerFilter !== "all" ||
    statusFilter !== "all" ||
    onlyDefaults;

  const filteredAndSortedModels = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = models.filter((model) => {
      if (providerFilter !== "all" && model.providerCode !== providerFilter) {
        return false;
      }
      if (statusFilter === "active" && !model.isActive) {
        return false;
      }
      if (statusFilter === "inactive" && model.isActive) {
        return false;
      }
      if (onlyDefaults && !model.isDefault) {
        return false;
      }
      if (normalizedQuery.length > 0) {
        const providerName = (providerNameMap.get(model.providerCode) ?? "").toLowerCase();
        const matchesQuery =
          model.displayName.toLowerCase().includes(normalizedQuery) ||
          model.modelId.toLowerCase().includes(normalizedQuery) ||
          model.providerCode.toLowerCase().includes(normalizedQuery) ||
          providerName.includes(normalizedQuery);
        if (!matchesQuery) {
          return false;
        }
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (!sortField) {
        const provA = providerNameMap.get(a.providerCode) ?? a.providerCode;
        const provB = providerNameMap.get(b.providerCode) ?? b.providerCode;
        const provCmp = provA.localeCompare(provB, "es");
        if (provCmp !== 0) return provCmp;
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        const orderCmp = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderCmp !== 0) return orderCmp;
        return a.displayName.localeCompare(b.displayName, "es");
      }

      let cmp = 0;
      if (sortField === "model") {
        cmp = a.displayName.localeCompare(b.displayName, "es");
      } else if (sortField === "provider") {
        const provA = providerNameMap.get(a.providerCode) ?? a.providerCode;
        const provB = providerNameMap.get(b.providerCode) ?? b.providerCode;
        cmp = provA.localeCompare(provB, "es");
      } else if (sortField === "context") {
        cmp = a.contextWindow - b.contextWindow;
      } else if (sortField === "spread") {
        cmp = a.spreadPercent - b.spreadPercent;
      } else if (sortField === "retail") {
        cmp = a.retailInputMtokUsdCents - b.retailInputMtokUsdCents;
      } else if (sortField === "status") {
        cmp = a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
      }

      if (cmp === 0) {
        cmp = a.displayName.localeCompare(b.displayName, "es");
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [
    models,
    searchQuery,
    providerFilter,
    statusFilter,
    onlyDefaults,
    sortField,
    sortDirection,
    providerNameMap,
  ]);

  const totalFiltered = filteredAndSortedModels.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const paginatedModels = filteredAndSortedModels.slice(startIndex, endIndex);

  function handleSort(field: ModelsCatalogSortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function handleResetFilters() {
    setSearchQuery("");
    setProviderFilter("all");
    setStatusFilter("all");
    setOnlyDefaults(false);
    setPage(1);
  }

  function renderSortIcon(field: ModelsCatalogSortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[var(--dsn-accent)]" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[var(--dsn-accent)]" aria-hidden="true" />
    );
  }

  function getAriaSort(field: ModelsCatalogSortField): "ascending" | "descending" | "none" {
    if (sortField !== field) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  return (
    <Card asChild>
      <section className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
              Catálogo De Modelos LLM y Spread Comercial
            </h2>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Márgenes de ganancia sobre inferencia Mocter (30% default), modelo por defecto del proveedor y parámetros de respuesta.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={onOpenCreateModel}
            className="min-h-[44px] text-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Agregar Modelo</span>
          </Button>
        </div>

        {/* Barra de filtros y búsqueda Mobile First */}
        <div className="px-5 py-3.5 border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label
                htmlFor="modelsCatalogSearchInput"
                className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
              >
                Buscar Modelo
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]"
                  aria-hidden="true"
                />
                <Input
                  id="modelsCatalogSearchInput"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nombre o ID técnico del modelo..."
                  className="min-h-[44px] bg-[var(--dsn-surface)] pl-9 text-xs"
                />
              </div>
            </div>

            <div>
              <Label
                htmlFor="modelsCatalogProviderFilter"
                className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
              >
                Filtrar Por Proveedor
              </Label>
              <Select
                id="modelsCatalogProviderFilter"
                value={providerFilter}
                onChange={(e) => {
                  setProviderFilter(e.target.value);
                  setPage(1);
                }}
                className="min-h-[44px] bg-[var(--dsn-surface)] text-xs"
              >
                <option value="all">Todos Los Proveedores</option>
                {providerOptions.map((prov) => (
                  <option key={prov.code} value={prov.code}>
                    {prov.name} ({prov.code})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label
                htmlFor="modelsCatalogStatusFilter"
                className="block text-[11px] font-medium text-[var(--dsn-text-secondary)] mb-1"
              >
                Filtrar Por Estado
              </Label>
              <Select
                id="modelsCatalogStatusFilter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | "active" | "inactive");
                  setPage(1);
                }}
                className="min-h-[44px] bg-[var(--dsn-surface)] text-xs"
              >
                <option value="all">Todos Los Estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </Select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label
                htmlFor="modelsCatalogOnlyDefaults"
                className="inline-flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <Checkbox
                  id="modelsCatalogOnlyDefaults"
                  checked={onlyDefaults}
                  onCheckedChange={(checked) => {
                    setOnlyDefaults(checked === true);
                    setPage(1);
                  }}
                />
                <span>Solo Por Defecto</span>
              </label>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetFilters}
                  className="min-h-[44px] text-xs font-medium"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Limpiar Filtros</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabla en escritorio / tarjetas apiladas en móvil sobre un único DOM */}
        {totalFiltered === 0 ? (
          <div role="status" className="px-6 py-10 text-center space-y-3">
            <p className="text-xs font-medium text-[var(--dsn-text)]">
              {models.length === 0
                ? "No hay modelos registrados en el catálogo."
                : "No se encontraron modelos con los filtros seleccionados."}
            </p>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetFilters}
                className="min-h-[40px] text-xs font-medium"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Limpiar Filtros</span>
              </Button>
            )}
          </div>
        ) : (
        <div className="md:overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="hidden md:table-header-group bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
              <tr>
                <th scope="col" aria-sort={getAriaSort("model")} className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("model")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                  >
                    <span>Modelo</span>
                    {renderSortIcon("model")}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort("provider")} className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("provider")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                  >
                    <span>Proveedor</span>
                    {renderSortIcon("provider")}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort("context")} className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("context")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                  >
                    <span>Ventana Contexto</span>
                    {renderSortIcon("context")}
                  </button>
                </th>
                <th scope="col" className="py-3 px-4 font-semibold">
                  Parámetros Base
                </th>
                <th scope="col" aria-sort={getAriaSort("spread")} className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("spread")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                  >
                    <span>Spread Comercial</span>
                    {renderSortIcon("spread")}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort("retail")} className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("retail")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                  >
                    <span>Precio Al Inquilino</span>
                    {renderSortIcon("retail")}
                  </button>
                </th>
                <th scope="col" aria-sort={getAriaSort("status")} className="py-3 px-4 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("status")}
                    className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                  >
                    <span>Estado</span>
                    {renderSortIcon("status")}
                  </button>
                </th>
                <th scope="col" className="py-3 px-4 font-semibold text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="grid grid-cols-1 gap-3 p-3 md:table-row-group md:p-0 md:divide-y md:divide-[var(--dsn-border)]">
              {paginatedModels.map((m) => (
                <tr
                  key={m.id}
                  className="flex flex-col gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/40 p-3.5 hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors md:table-row md:rounded-none md:border-0 md:bg-transparent md:p-0"
                >
                  <td className="flex flex-col gap-0.5 md:table-cell md:py-3 md:px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-[var(--dsn-text)]">{m.displayName}</span>
                      {m.isDefault && (
                        <Badge variant="accent" className="gap-1 text-[10px]">
                          <Star className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>Por Defecto</span>
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">{m.modelId}</div>
                  </td>

                  <td className="flex items-center justify-between gap-2 md:table-cell md:py-3 md:px-4">
                    <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)] md:hidden">
                      Proveedor
                    </span>
                    <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-[var(--dsn-accent)] border border-cyan-500/20">
                      {m.providerCode}
                    </span>
                  </td>

                  <td className="flex items-center justify-between gap-2 md:table-cell md:py-3 md:px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                    <span className="font-sans text-[11px] font-medium text-[var(--dsn-text-secondary)] md:hidden">
                      Ventana Contexto
                    </span>
                    <span className="tabular-nums">{(m.contextWindow / 1000).toLocaleString()}k tokens</span>
                  </td>

                  <td className="flex items-center justify-between gap-2 md:table-cell md:py-3 md:px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                    <span className="font-sans text-[11px] font-medium text-[var(--dsn-text-secondary)] md:hidden">
                      Parámetros Base
                    </span>
                    <span>
                      Temp {m.defaultTemperature ?? "0.7"} · {m.defaultMaxTokens ?? 1000} tok
                    </span>
                  </td>

                  <td className="flex items-center justify-between gap-2 md:table-cell md:py-3 md:px-4">
                    <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)] md:hidden">
                      Spread Comercial
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono font-medium text-emerald-400">
                      <Percent className="h-3 w-3" aria-hidden="true" />
                      {m.spreadPercent}%
                    </span>
                  </td>

                  <td className="flex items-center justify-between gap-2 md:table-cell md:py-3 md:px-4 font-mono text-[11px] font-medium text-emerald-400">
                    <span className="font-sans text-[11px] font-medium text-[var(--dsn-text-secondary)] md:hidden">
                      Precio Al Inquilino
                    </span>
                    <span className="tabular-nums">
                      ${(m.retailInputMtokUsdCents / 100).toFixed(3)} / Mtok
                    </span>
                  </td>

                  <td className="flex items-center justify-between gap-2 md:table-cell md:py-3 md:px-4">
                    <span className="text-[11px] font-medium text-[var(--dsn-text-secondary)] md:hidden">
                      Estado
                    </span>
                    {m.isActive ? (
                      <Badge variant="success" className="text-[11px]">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        Inactivo
                      </Badge>
                    )}
                  </td>

                  <td className="pt-2 border-t border-[var(--dsn-border)] md:border-0 md:pt-3 md:py-3 md:px-4">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!m.isDefault && m.isActive && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={() => onQuickSetDefault(m)}
                          className="min-h-[36px] md:min-h-0 h-auto border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-400 hover:bg-indigo-500/20"
                        >
                          <Star className="h-3 w-3" aria-hidden="true" />
                          <span>Por Defecto</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenEditModel(m)}
                        className="min-h-[36px] md:min-h-0 h-auto px-2 py-1 text-[11px]"
                      >
                        <Edit2 className="h-3 w-3" aria-hidden="true" />
                        <span>Configurar</span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onRequestDeleteModel(m)}
                        className="min-h-[36px] md:min-h-0 h-auto px-2 py-1 text-[11px]"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Eliminar</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pie de paginación y tamaño de página */}
      <div className="px-5 py-3 border-t border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-[var(--dsn-text-secondary)]">
        <div className="font-mono tabular-nums" data-testid="models-catalog-summary">
          {totalFiltered === 0
            ? "Mostrando 0 de 0 modelos"
            : `Mostrando ${startIndex + 1}–${endIndex} de ${totalFiltered} modelos${
                totalFiltered !== models.length ? ` (${models.length} total)` : ""
              }`}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <div className="flex items-center gap-2">
            <Label htmlFor="modelsCatalogPageSize" className="text-xs text-[var(--dsn-text-secondary)]">
              Filas Por Página
            </Label>
            <Select
              id="modelsCatalogPageSize"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="min-h-[40px] w-auto bg-[var(--dsn-surface)] px-2.5 py-1 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-[40px] text-xs font-medium"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Anterior</span>
            </Button>
            <span className="font-mono tabular-nums text-[var(--dsn-text)] px-1">
              Página {safePage} de {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-[40px] text-xs font-medium"
            >
              <span>Siguiente</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      </section>
    </Card>
  );
}
