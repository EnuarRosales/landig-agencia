import React from "react";
import { DataTable } from "../components/data-table";
import { getAdminDictionary } from "../lib/i18n";

/**
 * Catálogo interno vivo del sistema de diseño (`DSN-001 T-04, T-05`, `/design-system`).
 *
 * Ruta protegida y no indexada (`robots: noindex, nofollow`) que exhibe los tokens en 3 capas,
 * componentes base Mobile First y el componente `DataTable` en temas claro y oscuro.
 */
export default function DesignSystemCatalogPage() {
  const dict = getAdminDictionary("es").designSystem;

  const sampleRows = [
    {
      token: "--dsn-background",
      layer: "Semántico",
      dark: "#0a0a0a",
      light: "#f9f9f9",
      wcagRatio: "18.1:1",
    },
    {
      token: "--dsn-accent",
      layer: "Semántico / Marca",
      dark: "#14b8a6",
      light: "#0f766e",
      wcagRatio: "5.4:1",
    },
    {
      token: "--dsn-warning",
      layer: "Semántico",
      dark: "#f59e0b",
      light: "#a16207",
      wcagRatio: "4.75:1",
    },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <header className="space-y-2 border-b border-[var(--dsn-border)] pb-4">
        <h1 className="text-2xl font-semibold text-[var(--dsn-text)]">{dict.title}</h1>
        <p className="text-sm text-[var(--dsn-text-secondary)]">{dict.subtitle}</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-[var(--dsn-text)]">{dict.tableSection}</h2>
        <DataTable
          columns={[
            { key: "token", header: "Token", sortable: true, filterable: true },
            { key: "layer", header: "Capa", sortable: true, filterable: true },
            { key: "dark", header: "Oscuro" },
            { key: "light", header: "Claro" },
            { key: "wcagRatio", header: "Contraste AA", isNumeric: true, sortable: true },
          ]}
          rows={sampleRows}
          emptyMessage="Sin tokens"
        />
      </section>
    </main>
  );
}
