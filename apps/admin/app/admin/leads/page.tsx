import React from "react";
import { DataTable } from "@/components/data-table";
import { getAdminDictionary } from "@/lib/i18n";
import { fetchAdminLeads } from "@mocter/domain";
import { Inbox, Download } from "lucide-react";

/**
 * Consulta en caliente las solicitudes de contacto reales desde la base de datos PostgreSQL.
 * Cero datos semilla en código duro (Directiva de Integridad de Datos Mocter).
 */
async function fetchRealLeadsFromDatabase() {
  const rows = await fetchAdminLeads();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone || "—",
    status: r.status,
    assigned: r.assignedToUserId ? `Operador (${r.assignedToUserId.slice(0, 8)})` : "Sin Asignar",
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString().split("T")[0] : "—",
  }));
}

/**
 * Bandeja administrativa `/admin/leads` para `platform_sales` y `platform_admin` (`ADM-001 T-37, RF-16`).
 *
 * Cumple Mobile First (`DSN-001 T-05`), simplicidad de vistas (1 acción principal: Exportar CSV, `ADM-001 T-29`)
 * e internacionalización sin textos quemados (`ADM-001 T-27`).
 */
export default async function AdminLeadsInboxPage() {
  const dict = getAdminDictionary("es").leads;
  const leadRows = await fetchRealLeadsFromDatabase();

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.title}
            </h1>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Solicitudes de prospectos capturadas en tiempo real por el portal público
            </p>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95"
        >
          <Download className="h-4 w-4" />
          <span>{dict.exportCsv}</span>
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
        rows={leadRows}
        emptyMessage={dict.emptyLeads}
      />
    </div>
  );
}
