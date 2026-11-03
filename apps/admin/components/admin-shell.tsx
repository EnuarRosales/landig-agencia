"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  MessageSquare,
  CreditCard,
  Store,
  Bot,
  Gift,
  BarChart3,
  Server,
  Mail,
  Palette,
  Paintbrush,
  Menu,
  X,
  ShieldCheck,
  Activity,
  User as UserIcon,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { BrandLogo } from "./brand-logo";
import { getAdminDictionary } from "@/lib/i18n";
import { UserProfileModal, type CurrentUserDto } from "./user-profile-modal";
import { ConfirmationModal } from "./confirmation-modal";
import { handleLogoutRedirect } from "@/lib/api-client";

interface AdminShellProps {
  children: React.ReactNode;
  currentUser?: CurrentUserDto;
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
 * - Ficha de Perfil HUD y Menú de Cierre de Sesión interactivo con modales de confirmación accesibles (Regla 4.17).
 */
export function AdminShell({ children, currentUser }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const dict = getAdminDictionary("es").shell;

  const user: CurrentUserDto = currentUser || {
    id: "01a19874-1077-744c-8514-d4c990cd7259",
    email: "soporte@mocter.co",
    displayName: "Platform Owner",
    role: "platform_owner",
    status: "active",
  };

  async function handleConfirmLogout() {
    setLogoutLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignorar fallo de red para forzar redirección
    } finally {
      handleLogoutRedirect();
    }
  }

  // Cerrar el drawer móvil y popovers al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfilePopoverOpen(false);
  }, [pathname]);

  // Cerrar el drawer o popover con la tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        setProfilePopoverOpen(false);
      }
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
      href: "/admin/orders",
      label: dict.navOrders || "Suscripciones y Ventas",
      icon: CreditCard,
    },
    {
      href: "/admin/billing",
      label: dict.navBilling || "Facturación y Planes",
      icon: CreditCard,
    },
    {
      href: "/admin/cells",
      label: dict.navCells || "Celdas de Datos",
      icon: Server,
    },
    {
      href: "/admin/conversations",
      label: dict.navConversations,
      icon: MessageSquare,
    },
    {
      href: "/admin/tenants",
      label: dict.navTenants || "Inquilinos y Comercios",
      icon: Store,
    },
    {
      href: "/admin/users",
      label: dict.navUsersRoles || "Usuarios y Roles",
      icon: ShieldCheck,
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
          <div className="relative z-10 flex w-[280px] max-w-[85vw] h-dvh flex-col justify-between border-r border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex flex-col flex-1 min-h-0">
              {/* Encabezado del Drawer */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)] shrink-0">
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

              {/* Lista de navegación vertical con scroll independiente */}
              <nav className="mt-4 space-y-1.5 overflow-y-auto flex-1 pr-1 overscroll-contain" aria-label="Navegación principal móvil">
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
            <div className="border-t border-[var(--dsn-border)] pt-4 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dsn-text-secondary)]">Tema visual</span>
                <ThemeToggle />
              </div>

              {/* Menú de usuario en drawer móvil */}
              <div className="relative">
                {profilePopoverOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setProfilePopoverOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      role="menu"
                      aria-label="Menú de cuenta de operador"
                      className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                    >
                      <div className="px-2.5 py-1.5 border-b border-[var(--dsn-border)]/60 mb-1">
                        <p className="text-[11px] font-semibold text-[var(--dsn-text)] truncate">
                          {user.displayName || "Platform Owner"}
                        </p>
                        <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">
                          {user.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setProfilePopoverOpen(false);
                          setProfileModalOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-accent)] transition-colors"
                      >
                        <UserIcon className="h-4 w-4 text-[var(--dsn-accent)]" />
                        <span>Ficha De Perfil</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setProfilePopoverOpen(false);
                          setLogoutModalOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <LogOut className="h-4 w-4 text-rose-400" />
                        <span>Cerrar Sesión</span>
                      </button>
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setProfilePopoverOpen((prev) => !prev)}
                  aria-expanded={profilePopoverOpen}
                  aria-haspopup="menu"
                  className="w-full flex items-center justify-between rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-2.5 text-xs text-left transition-colors hover:bg-[var(--dsn-surface-secondary)] hover:border-[var(--dsn-border-strong)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-semibold text-xs border border-[var(--dsn-accent)]/40">
                      {(user.displayName || user.email || "PO").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-[var(--dsn-text)] truncate">{user.displayName || "Platform Owner"}</p>
                      <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">{user.email}</p>
                    </div>
                  </div>
                  <ChevronUp
                    className={`h-4 w-4 text-[var(--dsn-text-secondary)] transition-transform duration-200 shrink-0 ${
                      profilePopoverOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
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

          {/* Menú de cuenta de operador desktop con popover */}
          <div className="relative">
            {profilePopoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfilePopoverOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Menú de cuenta de operador"
                  className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-2.5 py-1.5 border-b border-[var(--dsn-border)]/60 mb-1">
                    <p className="text-[11px] font-semibold text-[var(--dsn-text)] truncate">
                      {user.displayName || "Platform Owner"}
                    </p>
                    <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePopoverOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-accent)] transition-colors"
                  >
                    <UserIcon className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>Ficha De Perfil</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePopoverOpen(false);
                      setLogoutModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4 text-rose-400" />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setProfilePopoverOpen((prev) => !prev)}
              aria-expanded={profilePopoverOpen}
              aria-haspopup="menu"
              className="w-full flex items-center justify-between rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-2 text-xs text-left transition-colors hover:bg-[var(--dsn-surface-secondary)] hover:border-[var(--dsn-border-strong)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-semibold text-xs border border-[var(--dsn-accent)]/40">
                  {(user.displayName || user.email || "PO").slice(0, 2).toUpperCase()}
                </div>
                <div className="truncate">
                  <p className="font-semibold text-[var(--dsn-text)] truncate">{user.displayName || "Platform Owner"}</p>
                  <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">{user.email}</p>
                </div>
              </div>
              <ChevronUp
                className={`h-4 w-4 text-[var(--dsn-text-secondary)] transition-transform duration-200 shrink-0 ${
                  profilePopoverOpen ? "rotate-180" : ""
                }`}
              />
            </button>
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

      {/* ─────────────────────────────────────────────────────────────
          5. MODALES ACCESIBLES: FICHA DE PERFIL Y CONFIRMACIÓN DE LOGOUT (Regla 4.17)
         ───────────────────────────────────────────────────────────── */}
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
      />

      <ConfirmationModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Cerrar Sesión En Mocter"
        subtitle="Finalizar la sesión operativa del operador en mocter-admin."
        variant="warning"
        confirmText="Cerrar Sesión Definitivamente"
        confirmLoadingText="Cerrando Sesión..."
        cancelText="Permanecer Conectado"
        loading={logoutLoading}
        details={[
          { label: "Operador", value: user.displayName || "Platform Owner" },
          { label: "Correo Electrónico", value: user.email, mono: true },
          { label: "Rol De Plataforma", value: user.role, mono: true },
        ]}
        warningTitle="Finalización De Sesión Segura"
        warningMessage="Se revocará el token de autenticación del servidor y deberás volver a ingresar credenciales para acceder al backoffice."
      />
    </div>
  );
}
