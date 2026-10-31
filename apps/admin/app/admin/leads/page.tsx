import React from "react";
import { DataTable } from "../../components/data-table";
import { getAdminDictionary } from "../../lib/i18n";

/**
 * Bandeja administrativa `/admin/leads` para `platform_sales` y `platform_admin` (`ADM-001 T-37, RF-16`).
 *
 * Cumple Mobile First (`DSN-001 T-05`), simplicidad de vistas (1 acción principal: Exportar CSV, `ADM-001 T-29`)
 * e internacionalización sin textos quemados (`ADM-001 T-27`).
 */
export default function AdminLeadsInboxPage() {
  const dict = getAdminDictionary("es").leads;

  const initialLeads = [
    {
      name: "María López",
      email: "maria@comercio.co",
      phone: "+573001112233",
      status: dict.statusQualified,
      assigned: "ventas@mocter.co",
      createdAt: "2026-10-30",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--dsn-text)]">{dict.title}</h1>
        <button
          type="button"
          className="min-h-[44px] rounded-md bg-[var(--dsn-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dsn-accent-hover)]"
        >
          {dict.exportCsv}
        </button>
      </header>

      <DataTable
        columns={[
          { key: "name", header: dict.colName, sortable: true, filterable: true },
          { key: "email", header: dict.colEmail, sortable: true, filterable: true },
          { key: "phone", header: dict.colPhone, isNumeric: true },
          { key: "status", header: dict.colStatus, sortable: true, filterable: true },
          { key: "assigned", header: dict.colAssigned, sortable: true },
          { key: "createdAt", header: dict.colCreatedAt, isNumeric: true, sortable: true },
        ]}
        rows={initialLeads}
        emptyMessage={dict.emptyLeads}
      />
    </main>
  );
}

