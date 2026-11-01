import React from "react";
import { fetchAdminTenantsOverview } from "@mocter/domain";
import { Store, Users, Server, AlertTriangle, ShieldCheck, CheckCircle2, Clock } from "lucide-react";
import { CreateTenantForm } from "./create-tenant-form";
import { TenantActions } from "./tenant-actions";

export const metadata = {
  title: "Inquilinos y Comercios · mocter-admin",
  description: "Directorio corporativo de inquilinos, control de ciclo de vida y asignación de celdas.",
};

/**
 * Vista de administración y directorio integral de inquilinos y comercios (ADM-001 §6, DAT-001).
 *
 * Permite al Platform Owner supervisar el universo de clientes, gestionar su ciclo
 * de vida (activo / suspendido / baja) y realizar altas manuales inmediatas.
 */
export default async function AdminTenantsPage() {
  const overview = await fetchAdminTenantsOverview();

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Encabezado HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Directorio De Inquilinos y Comercios
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              Router Global
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Supervisión centralizada del plano de control, enrutamiento a celdas PostgreSQL y ciclo de vida de clientes.
          </p>
        </div>

        <CreateTenantForm
          availablePlans={overview.availablePlans}
          availableCells={overview.availableCells}
        />
      </header>

      {/* Métricas rápidas de inquilinos */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Total Comercios</span>
            <Store className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {overview.kpis.totalTenants}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Registrados en el sistema
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Comercios Activos</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {overview.kpis.activeTenants}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Operando con normalidad
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">En Alta / Onboarding</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-400 font-mono">
            {overview.kpis.onboardingTenants}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Configuración inicial
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Suspendidos</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-400 font-mono">
            {overview.kpis.suspendedTenants}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Mora o revisión de cuenta
          </p>
        </div>
      </section>

      {/* Tabla Principal de Inquilinos */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[var(--dsn-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
              Directorio De Cuentas y Comercios
            </h2>
          </div>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {overview.tenants.length} {overview.tenants.length === 1 ? "comercio" : "comercios"}
          </span>
        </div>

        {overview.tenants.length === 0 ? (
          <div className="p-12 text-center">
            <Store className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No hay comercios registrados en la plataforma
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Utiliza el botón «Alta Manual De Inquilino» para dar de alta al primer cliente o espera registros desde la landing.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Comercio</th>
                  <th className="py-3 px-4 font-semibold">Propietario</th>
                  <th className="py-3 px-4 font-semibold">Plan Suscrito</th>
                  <th className="py-3 px-4 font-semibold">Célula De Datos</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Fecha De Alta</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {overview.tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors">
                    {/* Comercio y Slug */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-[var(--dsn-text)]">
                        {t.displayName}
                      </div>
                      <div className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">
                        mocter.co/{t.slug}
                      </div>
                    </td>

                    {/* Propietario */}
                    <td className="py-3 px-4">
                      <div className="text-[var(--dsn-text)]">
                        {t.ownerName || "Sin Nombre"}
                      </div>
                      <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {t.ownerEmail}
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono text-[var(--dsn-accent)] border border-cyan-500/20">
                        {t.planName}
                      </span>
                    </td>

                    {/* Celda */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--dsn-text)]">
                        <Server className="h-3 w-3 text-purple-400" />
                        <span>{t.cellCode}</span>
                        <span className="text-[10px] text-[var(--dsn-text-secondary)]">({t.cellTier})</span>
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="py-3 px-4">
                      {t.lifecycleStatus === "activo" && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                          Activo
                        </span>
                      )}
                      {t.lifecycleStatus === "alta" && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
                          En Alta
                        </span>
                      )}
                      {t.lifecycleStatus === "suspendido" && (
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/20">
                          Suspendido
                        </span>
                      )}
                      {t.lifecycleStatus === "baja" && (
                        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-400 border border-zinc-500/20">
                          Baja
                        </span>
                      )}
                    </td>

                    {/* Fecha de Alta */}
                    <td className="py-3 px-4 text-[var(--dsn-text-secondary)] font-mono text-[11px]">
                      {t.createdAt.slice(0, 10)}
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-4 text-right">
                      <TenantActions
                        clientId={t.id}
                        clientName={t.displayName}
                        currentStatus={t.lifecycleStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
