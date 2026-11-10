import React from "react";
import { fetchAdminReferralsOverview } from "@mocter/domain";
import { ReferralsView } from "./referrals-view";

export const metadata = {
  title: "Programa De Referidos · mocter-admin",
  description: "Gobernanza comercial, créditos de afiliación y métricas de líderes comunitarios.",
};

/**
 * Vista de administración del Programa de Referidos (REF-001).
 *
 * Permite al Platform Owner activar/pausar el programa, fijar recompensas
 * de crédito unilateral y monitorear la redención en facturación.
 */
export default async function AdminReferralsPage() {
  const overview = await fetchAdminReferralsOverview();

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Encabezado HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Programa Oficial De Referidos
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              Modelo A · Crédito
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Gobernanza comercial del programa de recomendación entre comercios, vigencia de créditos y redención.
          </p>
        </div>
      </header>

      {/* Vista interactiva de gobernanza */}
      <ReferralsView initialData={overview} />
    </div>
  );
}
