"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Users,
  MessageSquare,
  CreditCard,
  Store,
  Bot,
  Gift,
  BarChart3,
  Server,
  Layers,
  Mail,
  Palette,
  Paintbrush,
  Menu,
  X,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { BrandLogo } from "./brand-logo";
import { getAdminDictionary } from "@/lib/i18n";

interface AdminShellProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Shell institucional y cascarón reactivo persistente de `mocter-admin` (ADM-001, DSN-001).
 *
 * Características de diseño:
 * - Mobile First: Barra superior HUD fija con botón hamburguesa accesible (touch target >= 44px)
 *   y cajón deslizable (drawer/off-canvas sheet) con backdrop blur.
 * - Escritorio: Barra lateral (sidebar) fija de 260px que NUNCA se desmonta entre transiciones de ruta,
 *   garantizando navegación instantánea tipo SPA idéntica a `<router-outlet>` de Angular.
 * - Iconografía profesional con Lucide Icons y resaltado de ruta activa con token de acento.
 */
export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dict = getAdminDictionary("es").shell;

  // Cerrar el drawer móvil al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Cerrar el drawer con la tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevenir scroll del body cuando el cajón móvil está abierto
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const navItems: NavItem[] = [
    {
      href: "/",
      label: dict.navDashboard,
      icon: LayoutDashboard,
    },
    {
      href: "/admin/leads",
      label: dict.navLeads,
      icon: Inbox,
    },
    {
      href: "/admin/crm/contacts",
      label: dict.navCrm,
      icon: Users,
    },
    {
      href: "/admin/conversations",
      label: dict.navConversations,
      icon: MessageSquare,
    },
    {
      href: "/admin/orders",
      label: dict.navOrders || "Suscripciones y Ventas",
      icon: CreditCard,
    },
    {
      href: "/admin/tenants",
      label: dict.navTenants || "Inquilinos y Comercios",
      icon: Store,
    },
    {
      href: "/admin/ai",
      label: dict.navAi || "Inteligencia y Prompts",
      icon: Bot,
    },
    {
      href: "/admin/referrals",
      label: dict.navReferrals || "Programa de Referidos",
      icon: Gift,
    },
    {
      href: "/admin/reports",
      label: dict.navReports || "Informes y Analítica",
      icon: BarChart3,
    },
    {
      href: "/admin/cells",
      label: dict.navCells || "Celdas de Datos",
      icon: Server,
    },
    {
      href: "/admin/plans",
      label: dict.navPlans || "Planes y Cuotas",
      icon: Layers,
    },
    {
      href: "/admin/users",
      label: dict.navUsersRoles || "Usuarios y Roles",
      icon: ShieldCheck,
    },
    {
      href: "/admin/settings/notifications",
      label: dict.navEmailsSmtp || "Correos y SMTP",
      icon: Mail,
    },
    {
      href: "/admin/settings/branding",
      label: dict.navBranding || "Identidad y Marca",
      icon: Paintbrush,
    },
    {
      href: "/design-system",
      label: dict.navDesignSystem,
      icon: Palette,
    },
  ];

  function isLinkActive(href: string): boolean {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] transition-colors duration-150 flex flex-col md:flex-row">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP BAR MÓVIL (Mobile First: Pantallas < md)
         ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-[var(--dsn-border)] bg-[var(--dsn-surface)]/90 px-4 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={dict.menuOpen}
            aria-expanded={mobileMenuOpen}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface-secondary)] active:scale-95"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo size="sm" badgeText="Core" />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. DRAWER / CAJÓN MÓVIL (Slide-over off-canvas con backdrop)
         ───────────────────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación móvil"
        >
          {/* Backdrop con desenfoque */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Panel deslizante desde la izquierda */}
          <div className="relative flex w-[280px] max-w-[85vw] flex-col justify-between border-r border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div>
              {/* Encabezado del Drawer */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)]">
                <BrandLogo size="md" badgeText="Core" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={dict.menuClose}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Lista de navegación vertical con iconos y touch target >= 44px */}
              <nav className="mt-4 space-y-1.5" aria-label="Navegación principal móvil">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isLinkActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                        active
                          ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30 font-semibold"
                          : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-4 w-4 transition-colors ${
                            active
                              ? "text-[var(--dsn-accent)]"
                              : "text-[var(--dsn-text-secondary)] group-hover:text-[var(--dsn-text)]"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Pie del drawer móvil */}
            <div className="border-t border-[var(--dsn-border)] pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dsn-text-secondary)]">Tema visual</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-2 text-xs">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <p className="font-semibold text-[var(--dsn-text)] truncate">Platform Owner</p>
                  <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">Router Global</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. SIDEBAR PERSISTENTE ESCRITORIO (md:flex)
         ───────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[260px] shrink-0 min-h-dvh border-r border-[var(--dsn-border)] bg-[var(--dsn-sidebar)] p-4 flex-col justify-between">
        <div>
          {/* Cabecera Sidebar */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--dsn-border)]">
            <BrandLogo size="md" badgeText="Core" />
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-emerald-400">Live</span>
            </div>
          </div>

          {/* Navegación Desktop */}
          <nav className="mt-4 space-y-1.5" aria-label="Navegación principal escritorio">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isLinkActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30 font-semibold"
                      : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 transition-colors ${
                        active
                          ? "text-[var(--dsn-accent)]"
                          : "text-[var(--dsn-text-secondary)] group-hover:text-[var(--dsn-text)]"
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Pie Sidebar Desktop */}
        <div className="border-t border-[var(--dsn-border)] pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Tema visual</span>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-2.5 text-xs">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="truncate">
              <p className="font-semibold text-[var(--dsn-text)] truncate">Platform Owner</p>
              <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">soporte@mocter.co</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          4. CONTENEDOR DE CONTENIDO PRINCIPAL ({children})
             Exacto a <router-outlet></router-outlet> de Angular:
             Solo esta sección transmuta en las transiciones de ruta.
         ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)]">
        {children}
      </main>
    </div>
  );
}

