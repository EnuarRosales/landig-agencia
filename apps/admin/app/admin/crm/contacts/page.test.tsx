import React from "react";
import { describe, expect, it } from "vitest";
import AdminCrmContactsPage from "./page";

describe("CRM-001 · Vista de Prospectos y Métricas de Calidad", () => {
  it("renderiza el encabezado, indicadores de calidad y la tabla de datos", () => {
    const page = AdminCrmContactsPage();
    expect(page.type).toBe("main");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(3);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const kpiSection = children[1] as React.ReactElement<{ children: React.ReactNode }>;
    expect(kpiSection.type).toBe("section");
    const kpis = React.Children.toArray(kpiSection.props.children);
    expect(kpis.length).toBe(5);

    const dataTable = children[2] as React.ReactElement<{
      columns: unknown[];
      rows: unknown[];
    }>;
    expect(dataTable.props.columns).toBeDefined();
    expect(dataTable.props.columns.length).toBe(7);
    expect(dataTable.props.rows.length).toBe(3);
  });
});
