import React from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { fetchAdminEmailSettings } from "@mocter/domain";
import { NotificationsView } from "./notifications-view";

export const dynamic = "force-dynamic";

/**
 * Consola administrativa `/admin/settings/notifications` para la administración
 * de servidores SMTP, direcciones de correo oficiales y plantillas transaccionales
 * vinculadas al remitente y a la funcionalidad del sistema (ADM-001, NTF-001).
 *
 * Cero datos quemados: Toda la información proviene de PostgreSQL (`db-portal`).
 */
export default async function AdminNotificationsSettingsPage() {
  const data = await fetchAdminEmailSettings();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Encabezado HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2.5 text-[var(--dsn-accent)]">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
                Correos Institucionales y Pasarela SMTP
              </h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Pasarela Activa
              </span>
            </div>
            <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-0.5">
              Administración de pasarelas SMTP, direcciones remitentes de la SaaS y plantillas de correo vinculadas a la funcionalidad.
            </p>
          </div>
        </div>
      </header>

      {/* Vista Reactiva con Pestañas */}
      <NotificationsView initialData={data} />
    </div>
  );
}
