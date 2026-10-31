"use client";

import React, { useMemo, useState } from "react";

export interface DataTableColumn<Row> {
  key: keyof Row & string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  isNumeric?: boolean;
}

export interface DataTableProps<Row extends Record<string, unknown>> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  emptyMessage: string;
  pageSize?: number;
  initialDensity?: "compact" | "normal" | "comfortable";
}

/**
 * Tabla de datos estándar (`DataTable`) del sistema de diseño `DSN-001` (`T-05`).
 *
 * Incluye:
 * - Paginación, filtro por columna y ordenamiento ascendente/descendente.
 * - Header pegajoso (`sticky top-0`) y selector de densidad (`compact`, `normal`, `comfortable`).
 * - Degradación Mobile First a tarjetas (`md:hidden`) en pantallas móviles (390px) sin exigir scroll horizontal,
 *   y vista tabular de columnas (`hidden md:block`) en escritorio.
 */
export function DataTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage,
  pageSize = 10,
  initialDensity = "normal",
}: DataTableProps<Row>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<"compact" | "normal" | "comfortable">(
    initialDensity,
  );

  const filteredAndSorted = useMemo(() => {
    const filtered = rows.filter((row) =>
      columns.every((col) => {
        const filterVal = filters[col.key]?.trim().toLowerCase();
        if (!filterVal) return true;
        const cellVal = String(row[col.key] ?? "").toLowerCase();
        return cellVal.includes(filterVal);
      }),
    );

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      const va = String(a[sortKey] ?? "");
      const vb = String(b[sortKey] ?? "");
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, columns, filters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const pageRows = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize);

  const cellPadding =
    density === "compact"
      ? "px-3 py-1.5 text-xs"
      : density === "comfortable"
        ? "px-4 py-4 text-sm"
        : "px-4 py-2.5 text-sm";

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-4" data-testid="dsn-data-table" data-density={density}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {columns
            .filter((c) => c.filterable)
            .map((col) => (
              <input
                key={col.key}
                type="search"
                aria-label={col.header}
                placeholder={`${col.header}...`}
                value={filters[col.key] ?? ""}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, [col.key]: e.target.value }));
                  setPage(1);
                }}
                className="min-h-[44px] rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-sm text-[var(--dsn-text)]"
              />
            ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Density">
          {(["compact", "normal", "comfortable"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              className={`min-h-[44px] rounded px-2.5 py-1 text-xs font-medium ${
                density === d
                  ? "bg-[var(--dsn-accent)] text-white"
                  : "border border-[var(--dsn-border)] text-[var(--dsn-text-secondary)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {pageRows.length === 0 ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 text-center text-sm text-[var(--dsn-text-secondary)]"
        >
          {emptyMessage}
        </div>
      ) : (
        <>
          {/* Vista Mobile First (390px): degradación a tarjetas apiladas sin scroll horizontal */}
          <div className="grid grid-cols-1 gap-3 md:hidden" data-testid="mobile-cards-view">
            {pageRows.map((row, idx) => (
              <article
                key={idx}
                className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs"
              >
                <dl className="space-y-1.5">
                  {columns.map((col) => (
                    <div key={col.key} className="flex items-baseline justify-between gap-2">
                      <dt className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                        {col.header}
                      </dt>
                      <dd
                        className={`text-sm text-[var(--dsn-text)] ${
                          col.isNumeric ? "font-mono tabular-nums" : ""
                        }`}
                      >
                        {String(row[col.key] ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          {/* Vista Escritorio: tabla con header pegajoso */}
          <div
            className="hidden overflow-x-auto rounded-lg border border-[var(--dsn-border)] md:block"
            data-testid="desktop-table-view"
          >
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-[var(--dsn-surface-secondary)] text-xs uppercase text-[var(--dsn-text-secondary)]">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} scope="col" className={cellPadding}>
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1 font-semibold hover:text-[var(--dsn-text)]"
                        >
                          <span>{col.header}</span>
                          {sortKey === col.key ? (
                            <span aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>
                          ) : null}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)] bg-[var(--dsn-surface)]">
                {pageRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[var(--dsn-surface-secondary)]">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${cellPadding} text-[var(--dsn-text)] ${
                          col.isNumeric ? "font-mono tabular-nums" : ""
                        }`}
                      >
                        {String(row[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
        <span className="font-mono tabular-nums">
          {page} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="min-h-[44px] rounded border border-[var(--dsn-border)] px-3 py-1 disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="min-h-[44px] rounded border border-[var(--dsn-border)] px-3 py-1 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

