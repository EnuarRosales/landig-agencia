import React from "react";
import { describe, expect, it } from "vitest";
import AdminOrdersPage from "./page";

describe("ORD-001 T-06 · Vista administrativa de pedidos (/admin/orders)", () => {
  it("renderiza el encabezado, indicadores de flujo de pedidos y la tabla de datos", () => {
    const page = AdminOrdersPage();
    expect(page.type).toBe("main");

    const children = React.Children.toArray(page.props.children);
    // [0]: header, [1]: section (kpis), [2]: DataTable
    expect(children.length).toBeGreaterThanOrEqual(3);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const kpiSection = children[1] as React.ReactElement<{ children: React.ReactNode }>;
    expect(kpiSection.type).toBe("section");
    const kpis = React.Children.toArray(kpiSection.props.children);
    expect(kpis.length).toBe(5);

    const dataTable = children[2] as React.ReactElement<{
      columns: unknown[];
      data: unknown[];
      pageSize: number;
    }>;
    expect(dataTable.props.columns).toBeDefined();
    expect(dataTable.props.columns.length).toBe(7);
    expect(dataTable.props.data.length).toBe(3);
  });
});
