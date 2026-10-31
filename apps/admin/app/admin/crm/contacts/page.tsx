import React from "react";
import { DataTable } from "@/components/data-table";
import { getAdminDictionary } from "@/lib/i18n";

/**
 * Maestro de prospectos y gestión comercial CRM (`CRM-001`, `RF-05.1`, `DSN-001`).
 *
 * Características:
 * - Tablero Mobile First con 5 indicadores de calidad de datos en caliente (Exactitud, Unicidad, Completitud, Actualidad, Consentimiento).
 * - Tabla estándar accesible con ordenamiento, filtrado y paginación.
 * - Soporte para trazabilidad de consentimiento bajo Habeas Data (Ley 1581).
 */
export default function AdminCrmContactsPage() {
  const dict = getAdminDictionary("es").crm;

  const qualityKpis = [
    { label: dict.kpiAccuracy, value: "98%" },
    { label: dict.kpiUniqueness, value: "95%" },
    { label: dict.kpiCompleteness, value: "92%" },
    { label: dict.kpiRecency, value: "85%" },
    { label: dict.kpiConsent, value: "78%" },
  ];

  const demoContacts = [
    {
      fullName: "Carlos Eduardo Pérez",
      phoneMobile: "+573001234567",
      email: "carlos.perez@empresa.com",
      source: "whatsapp",
      stage: "in_conversation",
      consent: "Otorgado (1.0.0)",
      lastSeenAt: "2026-10-31 14:20",
    },
    {
      fullName: "Distribuciones Comerciales SAS",
      phoneMobile: "+573109876543",
      email: "contacto@distribuciones.co",
      source: "web",
      stage: "qualified",
      consent: "Otorgado (1.0.0)",
      lastSeenAt: "2026-10-30 09:15",
    },
    {
      fullName: "Laura Restrepo",
      phoneMobile: "+573155554433",
      email: "laura@tienda.com",
      source: "manual",
      stage: "new",
      consent: "Pendiente",
      lastSeenAt: "2026-10-29 18:00",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--dsn-text)]">{dict.title}</h1>
          <p className="text-xs text-[var(--dsn-muted)]">{dict.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-sm font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
          >
            {dict.exportCsv}
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-md bg-[var(--dsn-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dsn-accent-hover)]"
          >
            {dict.newProspect}
          </button>
        </div>
      </header>

      {/* Indicadores de calidad de datos en caliente (CRM-001 §4) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {qualityKpis.map((kpi, index) => (
          <div
            key={index}
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3 text-center shadow-sm"
          >
            <div className="text-xs font-medium text-[var(--dsn-muted)]">{kpi.label}</div>
            <div className="mt-1 font-mono text-xl font-bold tracking-tight text-[var(--dsn-accent)]">
              {kpi.value}
            </div>
          </div>
        ))}
      </section>

      {/* Tabla estándar de contactos */}
      <DataTable
        columns={[
          { key: "fullName", header: dict.colName, sortable: true, filterable: true },
          { key: "phoneMobile", header: dict.colPhone, isNumeric: true, filterable: true },
          { key: "email", header: dict.colEmail, sortable: true, filterable: true },
          { key: "source", header: dict.colSource, sortable: true, filterable: true },
          { key: "stage", header: dict.colStage, sortable: true, filterable: true },
          { key: "consent", header: dict.colConsent, sortable: true },
          { key: "lastSeenAt", header: dict.colLastSeen, sortable: true, isNumeric: true },
        ]}
        rows={demoContacts}
        emptyMessage={dict.emptyContacts}
      />
    </main>
  );
}
