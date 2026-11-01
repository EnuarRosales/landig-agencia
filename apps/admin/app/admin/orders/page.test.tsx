import React from "react";
import { describe, expect, it } from "vitest";
import AdminOrdersPage from "./page";

describe("ORD-001 T-06 · Vista administrativa de pedidos (/admin/orders)", () => {
  it("renderiza el encabezado, indicadores de flujo de pedidos y la tabla de datos", async () => {
    const page = await AdminOrdersPage();
    expect(page.type).toBe("main");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBeGreaterThanOrEqual(3);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const kpiSection = children.find(
      (c): c is React.ReactElement<{ children: React.ReactNode }> =>
        React.isValidElement(c) &&
        (c.props as { "aria-label"?: string })?.["aria-label"] ===
          "Indicadores de pedidos",
    );
    expect(kpiSection).toBeDefined();
    const kpis = React.Children.toArray(kpiSection!.props.children);
    expect(kpis.length).toBe(5);

    const dataTable = children.find(
      (c): c is React.ReactElement<{
        columns: unknown[];
        rows: unknown[];
        pageSize: number;
      }> =>
        React.isValidElement(c) &&
        Array.isArray((c.props as { columns?: unknown[] })?.columns),
    );
    expect(dataTable).toBeDefined();
    expect(dataTable!.props.columns.length).toBe(7);
    expect(dataTable!.props.rows.length).toBe(3);
  });
});