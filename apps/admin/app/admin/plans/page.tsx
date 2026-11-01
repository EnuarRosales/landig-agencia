import React from "react";
import { fetchAdminPlans } from "@mocter/domain";
import { Layers, CreditCard, Sparkles, Eye, Lock } from "lucide-react";
import { CreatePlanForm } from "./create-plan-form";

export const metadata = {
  title: "Planes Y Cuotas · mocter-admin",
  description: "Parametrización dinámica de planes comerciales, cuotas y tiers VIP (ADM-001).",
};

/**
 * Vista de administración y parametrización de planes comerciales y VIP (ADM-001, DAT-001).
 *
 * Muestra el catálogo de planes activos en el Router Global y permite
 * crear planes personalizados sin acoplamiento en código.
 */
export default async function AdminPlansPage() {
  const plansList = await fetchAdminPlans();

  const publicCount = plansList.filter((p) => p.isPublic).length;
  const privateCount = plansList.filter((p) => !p.isPublic).length;

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Catálogo Y Parametrización De Planes
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              ADM-001 · DAT-001
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Gestión comercial desacoplada, precios dinámicos, días de prueba y planes VIP a medida.
          </p>
        </div>

        <CreatePlanForm />
      </header>

      {/* Métricas rápidas de planes */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Planes Públicos En Landing</span>
            <Eye className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {publicCount}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Visibles en la sección de precios
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Planes Privados / VIP</span>
            <Lock className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-400 font-mono">
            {privateCount}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Asignables por slug en onboarding
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Pasarelas Vinculadas</span>
            <CreditCard className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-accent)] font-mono">
            Wompi + Stripe
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Facturación dual en COP y USD
          </p>
        </div>
      </section>

      {/* Tabla de Planes */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            Inventario De Planes Comerciales
          </h2>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {plansList.length} {plansList.length === 1 ? "plan" : "planes"}
          </span>
        </div>

        {plansList.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No hay planes configurados
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Registra los planes iniciales para permitir a los inquilinos suscribirse durante el onboarding o la landing page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Código Slug</th>
                  <th className="py-3 px-4 font-semibold">Nombre Del Plan</th>
                  <th className="py-3 px-4 font-semibold">Precio Mensual</th>
                  <th className="py-3 px-4 font-semibold">Días De Prueba</th>
                  <th className="py-3 px-4 font-semibold">Visibilidad</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {plansList.map((p) => {
                  const priceCop = (p.priceMonthlyCents / 100).toLocaleString("es-CO", {
                    style: "currency",
                    currency: p.currency || "COP",
                    maximumFractionDigits: 0,
                  });

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-[var(--dsn-accent)]">
                        {p.code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--dsn-text)]">
                            {p.name.es}
                          </span>
                          {p.isPopular && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-400 px-1.5 py-0.2 text-[10px] font-semibold border border-amber-500/20">
                              <Sparkles className="h-3 w-3" /> Popular
                            </span>
                          )}
                        </div>
                        {p.name.en && (
                          <span className="text-[11px] text-[var(--dsn-text-secondary)] block">
                            {p.name.en}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)] font-semibold">
                        {priceCop}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--dsn-text)]">
                        {p.trialDays} días
                      </td>
                      <td className="py-3.5 px-4">
                        {p.isPublic ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-500/20">
                            <Eye className="h-3 w-3" /> Público (Landing)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-purple-400 border border-purple-500/20">
                            <Lock className="h-3 w-3" /> Privado / VIP
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                          p.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-500/10 text-zinc-400"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

