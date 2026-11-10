import React from "react";
import Link from "next/link";
import { getAdminDictionary } from "@/lib/i18n";
import { fetchControlPlaneMetrics } from "@mocter/domain";
import {
  Users,
  Inbox,
  Server,
  Activity,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

/**
 * Tablero principal del plano de control corporativo de Mocter SaaS (ADM-001, DSN-001).
 *
 * Muestra datos reales consultados directamente de PostgreSQL y accesos directos
 * a los módulos administrativos del sistema.
 */
export default async function AdminHomePage() {
  const dict = getAdminDictionary("es");
  const metrics = await fetchControlPlaneMetrics();

  const kpis = [
    {
      label: dict.dashboard.kpiTenants || "Inquilinos Activos",
      value: `${metrics.tenants} ${metrics.tenants === 1 ? "Inquilino" : "Inquilinos"}`,
      subtext: "Registrados en Router Global",
      icon: Users,
      color: "text-[var(--dsn-accent)]",
    },
    {
      label: dict.dashboard.kpiLeads || "Prospectos Landing",
      value: `${metrics.leads} ${metrics.leads === 1 ? "Contacto" : "Contactos"}`,
      subtext: "En bandeja /admin/leads",
      icon: Inbox,
      color: "text-amber-400",
    },
    {
      label: dict.dashboard.kpiProducts || "Células Desplegadas",
      value: `${metrics.cells} ${metrics.cells === 1 ? "Célula" : "Células"}`,
      subtext: "Nodos de datos multi-inquilino",
      icon: Server,
      color: "text-purple-400",
    },
    {
      label: dict.dashboard.kpiSystemStatus || "Plano de Control",
      value: metrics.dbStatus,
      subtext: "PostgreSQL 18 + Redis 8",
      icon: Activity,
      color: "text-emerald-400",
    },
  ];

  const adminModules = [
    {
      title: dict.dashboard.cardLeadsTitle,
      description: dict.dashboard.cardLeadsDesc,
      href: "/admin/leads",
      badge: "Bandeja",
    },
    {
      title: dict.dashboard.cardChatwootTitle,
      description: dict.dashboard.cardChatwootDesc,
      href: "/admin/conversations",
      badge: "Omnicanal",
    },
    {
      title: "Directorio De Inquilinos y Comercios",
      description: "Supervisión del universo de comercios, control de suspensión y enrutamiento a celdas.",
      href: "/admin/tenants",
      badge: "Tenencia",
    },
    {
      title: "Inteligencia Artificial y Prompts",
      description: "Gobernanza de modelos LLM, fijación de spread comercial y biblioteca de prompts maestros.",
      href: "/admin/ai",
      badge: "Inferencia",
    },
    {
      title: "Programa De Referidos y Afiliados",
      description: "Modelo de recompensas por recomendación, códigos de comercio y créditos acumulados.",
      href: "/admin/referrals",
      badge: "Crecimiento",
    },
    {
      title: "Informes Ejecutivos y Analítica",
      description: "Supervisión consolidada de MRR, almacenamiento SeaweedFS y consumo de tokens AI.",
      href: "/admin/reports",
      badge: "Analítica",
    },
    {
      title: dict.dashboard.cardCellsTitle || "Células de Datos",
      description: dict.dashboard.cardCellsDesc || "Aprovisionamiento y topes de capacidad de nodos PostgreSQL celulares.",
      href: "/admin/cells",
      badge: "PostgreSQL",
    },
    {
      title: "Facturación y Planes SaaS",
      description: "Catálogo comercial, suscripciones de inquilinos, comprobantes contables y pasarelas Wompi/Stripe.",
      href: "/admin/billing",
      badge: "Finanzas",
    },
    {
      title: "Control De Acceso y Roles (RBAC)",
      description: "Administración exclusiva del owner: identidades de plataforma, catálogo de roles y matriz de permisos.",
      href: "/admin/users",
      badge: "Gobernanza",
    },
    {
      title: dict.dashboard.cardNotificationsTitle,
      description: dict.dashboard.cardNotificationsDesc,
      href: "/admin/settings/notifications",
      badge: "Transaccional",
    },
    {
      title: dict.dashboard.cardDesignSystemTitle,
      description: dict.dashboard.cardDesignSystemDesc,
      href: "/design-system",
      badge: "Accesibilidad",
    },
  ];

  return (
    <div className="w-full space-y-8 p-4 md:px-8 md:py-6">
      {/* Encabezado con estética HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.dashboard.title}
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Producción
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            {dict.dashboard.subtitle}
          </p>
        </div>

        <Link
          href="/admin/leads"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--dsn-accent-hover)] hover:shadow-md active:scale-95"
        >
          <Inbox className="h-4 w-4" />
          <span>{dict.dashboard.primaryAction}</span>
        </Link>
      </header>

      {/* Grilla KPI Mobile First (1 columna en móvil, 2 en tablet, 4 en escritorio con tabular-nums) */}
      <section
        aria-label="Indicadores del plano de control"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article
              key={kpi.label}
              className="relative overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs transition-colors hover:border-[var(--dsn-accent)]/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
                  {kpi.label}
                </p>
                <div className={`rounded-lg bg-[var(--dsn-surface-secondary)] p-2 ${kpi.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="kpi-value mt-3 font-mono text-2xl font-bold tabular-nums text-[var(--dsn-text)]">
                {kpi.value}
              </p>
              <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                {kpi.subtext}
              </p>
            </article>
          );
        })}
      </section>

      {/* Módulos de Operación Corporativa */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--dsn-text)]">
            {dict.dashboard.quickAccessTitle}
          </h2>
          <p className="text-xs text-[var(--dsn-text-secondary)]">
            {dict.dashboard.quickAccessSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adminModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group flex flex-col justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 transition-all hover:border-[var(--dsn-accent)] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-semibold text-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 px-2 py-0.5 rounded border border-[var(--dsn-accent)]/20">
                    {module.badge}
                  </span>
                  <ArrowRight className="h-4 w-4 text-[var(--dsn-text-secondary)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--dsn-accent)]" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[var(--dsn-text)] group-hover:text-[var(--dsn-accent)] transition-colors">
                  {module.title}
                </h3>
                <p className="mt-1.5 text-xs text-[var(--dsn-text-secondary)] leading-relaxed">
                  {module.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--dsn-border)]/50 flex items-center justify-between text-[11px] text-[var(--dsn-text-secondary)]">
                <span>Acceder al módulo</span>
                <span className="font-mono">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Identidad del Operador de Plataforma Activo */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]/60 p-4 backdrop-blur-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-[var(--dsn-text)]">
              Sesión De Plataforma: Platform Owner
            </p>
            <p className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">
              soporte@mocter.co · Ubicación de identidad: Router Global
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[var(--dsn-surface-secondary)] px-2 py-1 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
            Aislamiento de Seguridad: Celda Cero
          </span>
        </div>
      </section>
    </div>
  );
}
