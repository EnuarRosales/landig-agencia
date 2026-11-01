import React from "react";
import { ShieldCheck, Lock } from "lucide-react";
import { fetchRbacOverview } from "@mocter/domain";
import { RbacView } from "./rbac-view";

export const dynamic = "force-dynamic";

/**
 * Consola administrativa `/admin/users` para la gobernanza corporativa de Usuarios,
 * Roles y Matriz de Permisos (RBAC) exclusiva del Platform Owner (ADM-001 D-31).
 *
 * Cero datos quemados: Toda la información proviene de PostgreSQL (`db-portal`).
 */
export default async function AdminUsersRbacPage() {
  const data = await fetchRbacOverview();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Encabezado HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2.5 text-[var(--dsn-accent)]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
                Gobierno De Usuarios, Roles y Permisos
              </h1>
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-mono font-medium text-purple-400 flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> Exclusivo Platform Owner
              </span>
            </div>
            <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-0.5">
              Administración centralizada de identidades de plataforma, catálogo de roles y matriz granular de permisos RBAC.
            </p>
          </div>
        </div>
      </header>

      {/* Vista Reactiva de Gobernanza RBAC */}
      <RbacView initialData={data} />
    </div>
  );
}

