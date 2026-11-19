// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceDataTable, type WorkspaceTableColumn } from "./workspace-data-table";

interface DemoRow {
  id: string;
  name: string;
  amount: number;
}

const DEMO_COLUMNS: WorkspaceTableColumn<DemoRow>[] = [
  {
    key: "name",
    header: "Nombre",
    sortable: true,
    sortValue: (row) => row.name,
    renderCell: (row) => <span>{row.name}</span>,
  },
  {
    key: "amount",
    header: "Monto",
    sortable: true,
    isNumeric: true,
    align: "right",
    sortValue: (row) => row.amount,
    renderCell: (row) => row.amount,
  },
];

describe("SPEC-17 TRV-02 · WorkspaceDataTable", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("en modo cliente pagina (10/20/50), ordena columnas con aria-sort y muestra contador Mostrando X–Y de Z", () => {
    const rows: DemoRow[] = Array.from({ length: 15 }, (_, idx) => ({
      id: `row-${idx + 1}`,
      name: `Item ${String(idx + 1).padStart(2, "0")}`,
      amount: (idx + 1) * 100,
    }));

    render(
      <WorkspaceDataTable
        data={rows}
        columns={DEMO_COLUMNS}
        getRowKey={(row) => row.id}
        defaultPageSize={10}
        searchKeys={["name"]}
      />,
    );

    expect(screen.getByTestId("workspace-data-table-summary").textContent).toMatch(
      /Mostrando\s+1–10\s+de\s+15\s+resultados/,
    );

    const amountHeaderButton = screen.getByRole("button", { name: /Monto/i });
    fireEvent.click(amountHeaderButton);
    const th = amountHeaderButton.closest("th");
    expect(th?.getAttribute("aria-sort")).toBe("ascending");

    const select = screen.getByTestId("workspace-data-table-page-size") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["10", "20", "50"]);

    fireEvent.change(select, { target: { value: "20" } });
    expect(screen.getByTestId("workspace-data-table-summary").textContent).toMatch(
      /Mostrando\s+1–15\s+de\s+15\s+resultados/,
    );
  });

  it("en modo servidor ejecuta debounce de 300ms en búsqueda y limpia filtros con Limpiar Filtros", () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const onPageChange = vi.fn();
    const onResetFilters = vi.fn();

    render(
      <WorkspaceDataTable
        data={[{ id: "1", name: "Café", amount: 500 }]}
        columns={DEMO_COLUMNS}
        getRowKey={(row) => row.id}
        page={1}
        pageSize={20}
        totalItems={1}
        searchQuery=""
        onPageChange={onPageChange}
        onSearchChange={onSearchChange}
        onResetFilters={onResetFilters}
        locale="es"
      />,
    );

    const input = screen.getByPlaceholderText("Buscar...");
    fireEvent.change(input, { target: { value: "café" } });
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenCalledWith("café");

    const clearBtn = screen.getByTestId("workspace-data-table-clear-filters");
    fireEvent.click(clearBtn);
    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });

  it("traduce cabeceras y pie al inglés y soporta estado error reintentable", () => {
    const onRetry = vi.fn();
    render(
      <WorkspaceDataTable
        data={[]}
        columns={DEMO_COLUMNS}
        getRowKey={(row) => row.id}
        error="Timeout 504"
        onRetry={onRetry}
        locale="en"
      />,
    );

    expect(screen.getByText("Could not load records.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
