import React from "react";
import { DataTable } from "../../../components/data-table";
import { getAdminDictionary } from "../../../lib/i18n";

/**
 * Consola administrativa `/admin/settings/notifications` para remitentes, proveedor SMTP,
 * catálogo de eventos, plantillas TipTap versionadas y outbox de entregas (`NTF-001 T-09, T-10`).
 *
 * Accesible exclusivamente para `platform_owner` y `platform_admin`; credenciales SMTP enmascaradas (`••••••••`).
 */
export default function AdminNotificationsSettingsPage() {
  const dict = getAdminDictionary("es").notifications;

  const eventsRows = [
    {
      eventKey: "tenant.welcome",
      category: "tenant",
      sender: "no-reply@mocter.co",
      status: "published (v1)",
      variables: "tenant_name, owner_name, login_url, brand_name",
    },
    {
      eventKey: "auth.verify_email",
      category: "auth (locked)",
      sender: "no-reply@mocter.co",
      status: "published (v1)",
      variables: "user_name, verify_url, expires_minutes",
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
          {dict.primaryAction}
        </button>
      </header>

      <section className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
              {dict.maskedSecretLabel}
            </p>
            <p className="font-mono text-sm text-[var(--dsn-text)]" data-testid="masked-smtp-secret">
              ••••••••
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-[44px] rounded border border-[var(--dsn-border)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)]"
            >
              {dict.testConnection}
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded border border-[var(--dsn-border)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)]"
            >
              {dict.sendTestEmail}
            </button>
          </div>
        </div>
      </section>

      <DataTable
        columns={[
          { key: "eventKey", header: dict.tabEvents, sortable: true, filterable: true },
          { key: "category", header: "Categoría", sortable: true },
          { key: "sender", header: dict.tabSenders, sortable: true },
          { key: "status", header: dict.tabTemplates, sortable: true },
          { key: "variables", header: "Variables" },
        ]}
        rows={eventsRows}
        emptyMessage="Sin eventos"
      />
    </main>
  );
}

