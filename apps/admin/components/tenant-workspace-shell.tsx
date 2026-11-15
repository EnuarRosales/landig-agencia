"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Bot,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  Paintbrush,
  Globe,
  BarChart3,
  Store,
  Menu,
  X,
  User as UserIcon,
  LogOut,
  ChevronUp,
  ArrowLeftRight,
  Shield,
  Mail,
  Copy,
  Check,
  KeyRound,
  Building2,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ConfirmationModal } from "./confirmation-modal";
import { handleLogoutRedirect } from "@/lib/api-client";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import type { CurrentUserDto } from "./user-profile-modal";

export interface TenantSubscriptionAlertDto {
  status: string;
  expiresAt: string;
  daysRemaining: number;
  pendingBreBReview: boolean;
  subscriptionExpiredLocked?: boolean;
}

/**
 * Propiedades del componente cascarón operativo del comercio.
 */
export interface TenantWorkspaceShellProps {
  children: React.ReactNode;
  currentUser?: CurrentUserDto;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    planName?: string;
    connectionHealthy?: boolean;
  };
  capabilities?: Record<string, boolean>;
  subscriptionAlert?: TenantSubscriptionAlertDto | null;
  locale?: AdminLocale;
  brandingTokens?: Record<string, string>;
  branding?: {
    brandName?: string | null;
    faviconUrl?: string | null;
    removeMocterBranding?: boolean;
    customFont?: string | null;
  } | null;
}

interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  capabilityCode?: string;
  capabilityAliases?: string[];
  ownerOnly?: boolean;
}

/**
 * Shell operativo persistente del backoffice del comercio e inquilino (ADM-001 D-35, TNT-001 R2/R4).
 *
 * Características:
 * 1. Identidad visual del comercio con soporte para logotipo o avatar e indicador de estado conectado.
 * 2. 7 módulos base universales para todos los planes gobernados por cuotas de negocio.
 * 3. 4 módulos dinámicos filtrados por capacidades efectivas del plan (TenantCapabilityGateService).
 * 4. Ficha de perfil HUD del comercio, selector informativo de comercio (D-15) y modal de confirmación de logout (Regla 4.17).
 * 5. Cero fugas hacia el plano corporativo de la SaaS (sin enlaces /admin/* ni términos de plataforma).
 */
export function TenantWorkspaceShell({
  children,
  currentUser,
  tenant,
  capabilities,
  subscriptionAlert = null,
  locale = "es",
  brandingTokens,
  branding = null,
}: TenantWorkspaceShellProps) {
  const pathname = usePathname();
  const dict = getAdminDictionary(locale).workspace;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [switchStoreModalOpen, setSwitchStoreModalOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  const tenantInfo = {
    id: tenant?.id || "tenant-default-id",
    name: tenant?.name || "Mi Comercio",
    slug: tenant?.slug || "comercio",
    logoUrl: tenant?.logoUrl,
    planName: tenant?.planName || "Plan Pro",
    connectionHealthy: tenant?.connectionHealthy ?? true,
  };
  const displayStoreName = branding?.brandName?.trim() || tenantInfo.name;
  const logoError = Boolean(tenantInfo.logoUrl && failedLogoUrl === tenantInfo.logoUrl);

  const user: CurrentUserDto = currentUser || {
    id: "00000000-0000-0000-0000-000000000000",
    email: "comercio@mocter.co",
    displayName: "Propietario del Comercio",
    role: "tenant_owner",
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
      // Ignorar fallo de red para asegurar redirección
    } finally {
      handleLogoutRedirect();
    }
  }

  // Cerrar menús al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfilePopoverOpen(false);
  }, [pathname]);

  // Tecla Escape para accesibilidad
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        setProfilePopoverOpen(false);
        setProfileModalOpen(false);
        setSwitchStoreModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Bloquear scroll al abrir drawer móvil
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
    // ── Módulos Base (7 universales) ──
    {
      href: "/workspace",
      label: "Tablero",
      icon: LayoutDashboard,
    },
    {
      href: "/workspace/products",
      label: "Productos y Catálogo",
      icon: Package,
    },
    {
      href: "/workspace/contacts",
      label: "Contactos CRM",
      icon: Users,
    },
    {
      href: "/workspace/orders",
      label: "Pedidos y Ventas",
      icon: ShoppingCart,
    },
    {
      href: "/workspace/bot",
      label: "Asistente AI y Bot",
      badge: "AI",
      icon: Bot,
    },
    {
      href: "/workspace/ai",
      label: "Proveedores y Llaves AI",
      badge: "BYOK",
      icon: KeyRound,
    },
    {
      href: "/workspace/team",
      label: "Equipo y Miembros",
      icon: ShieldCheck,
    },
    {
      href: "/workspace/profile",
      label: dict.navProfile || "Perfil del Negocio",
      icon: Building2,
      ownerOnly: true,
    },
    {
      href: "/workspace/billing",
      label: "Mi Plan y Cuotas",
      icon: CreditCard,
    },

    // ── Módulos Dinámicos (Gated por capacidades de plan) ──
    {
      href: "/workspace/conversations",
      label: "Conversaciones Omnicanal",
      icon: MessageSquare,
      capabilityCode: "chatwoot_inboxes",
      capabilityAliases: ["conversations"],
    },
    {
      href: "/workspace/branding",
      label: dict.navBranding || "Identidad y Marca Blanca",
      badge: "Marca",
      icon: Paintbrush,
      capabilityCode: "custom_branding",
      capabilityAliases: ["branding", "white_label"],
    },
    {
      href: "/workspace/community",
      label: "Comunidad de Comercios",
      badge: "Red",
      icon: Globe,
      capabilityCode: "community_feed",
      capabilityAliases: ["community"],
    },
    {
      href: "/workspace/reports",
      label: "Informes y Analítica",
      badge: "Datos",
      icon: BarChart3,
      capabilityCode: "data_export",
      capabilityAliases: ["reports"],
    },
  ];

  const isExpiredLocked = Boolean(subscriptionAlert?.subscriptionExpiredLocked);
  const isOwnerRole = user.role !== "tenant_agent";

  const visibleNavItems = navItems.filter((item) => {
    if (isExpiredLocked) {
      return item.href === "/workspace/billing";
    }
    if (item.ownerOnly && !isOwnerRole) {
      return false;
    }
    if (!item.capabilityCode) return true;
    if (!capabilities) return false;
    if (capabilities[item.capabilityCode]) return true;
    if (item.capabilityAliases) {
      for (const alias of item.capabilityAliases) {
        if (capabilities[alias]) return true;
      }
    }
    return false;
  });

  function isLinkActive(href: string): boolean {
    if (href === "/workspace") {
      return pathname === "/workspace";
    }
    return Boolean(pathname?.startsWith(href));
  }

  const copyUserId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const renderBrandMark = (size: "sm" | "md") => {
    const sizeClasses = size === "sm" ? "h-8 w-8" : "h-9 w-9";
    if (tenantInfo.logoUrl && !logoError) {
      return (
        <img
          src={tenantInfo.logoUrl}
          alt={displayStoreName}
          onError={() => setFailedLogoUrl(tenantInfo.logoUrl ?? null)}
          className={`${sizeClasses} shrink-0 rounded-lg object-contain border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]`}
        />
      );
    }
    return (
      <div
        className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/40 shadow-xs`}
      >
        <Store className="h-4 w-4" />
      </div>
    );
  };

  const connectionLabel = tenantInfo.connectionHealthy
    ? dict.connectedStatus
    : dict.connectionIssueStatus || "Revisar Conexión";

  const renderConnectionBadge = (compact = false) => (
    <div
      data-testid="tenant-connection-status"
      title={connectionLabel}
      className={`inline-flex items-center gap-1.5 rounded-md border ${
        compact ? "px-2 py-1" : "px-2 py-0.5"
      } ${
        tenantInfo.connectionHealthy
          ? "bg-[var(--dsn-surface-secondary)]/80 border-emerald-500/20 text-emerald-400"
          : "bg-amber-500/10 border-amber-500/30 text-amber-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tenantInfo.connectionHealthy ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
        }`}
      />
      <span className="text-[10px] font-mono">{connectionLabel}</span>
    </div>
  );

  return (
    <div
      data-testid="tenant-workspace-shell"
      style={brandingTokens as React.CSSProperties | undefined}
      className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] transition-colors duration-150 flex flex-col md:flex-row"
    >
      {/* ─────────────────────────────────────────────────────────────
          1. TOP BAR MÓVIL (Mobile First: Pantallas < md)
         ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex min-h-14 w-full items-center justify-between gap-2 border-b border-[var(--dsn-border)] bg-[var(--dsn-surface)]/90 px-4 py-1.5 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menú de navegación"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface)] focus-visible:outline-2 focus-visible:outline-[var(--dsn-accent)]"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            href="/workspace"
            className="flex items-center gap-2 min-w-0 flex-1 transition-opacity hover:opacity-90 active:scale-98"
            aria-label={`${displayStoreName} Inicio`}
          >
            {renderBrandMark("sm")}
            <span
              className="font-bold tracking-tight text-[var(--dsn-text)] text-sm break-words leading-tight line-clamp-2"
              title={displayStoreName.length > 36 ? displayStoreName : undefined}
            >
              {displayStoreName}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {renderConnectionBadge(true)}
          <ThemeToggle />
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. DRAWER OFF-CANVAS MÓVIL
         ───────────────────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú principal del comercio"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          {/* Backdrop con desenfoque */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Panel Lateral Deslizable */}
          <div className="relative flex w-full max-w-[280px] flex-1 flex-col bg-[var(--dsn-sidebar)] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Cabecera del Drawer */}
            <div className="flex items-start justify-between gap-2 pb-4 border-b border-[var(--dsn-border)]">
              <div className="min-w-0 flex-1 space-y-2">
                <Link
                  href="/workspace"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-start gap-2.5 min-w-0"
                >
                  {renderBrandMark("md")}
                  <div className="flex flex-col min-w-0 flex-1 gap-1">
                    <span
                      className="font-bold tracking-tight text-[var(--dsn-text)] text-sm break-words leading-snug line-clamp-2"
                      title={displayStoreName.length > 36 ? displayStoreName : undefined}
                    >
                      {displayStoreName}
                    </span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="rounded bg-[var(--dsn-accent)]/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20 shrink-0">
                        Comercio
                      </span>
                      <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">
                        {tenantInfo.slug}
                      </span>
                    </div>
                  </div>
                </Link>
                <div>{renderConnectionBadge()}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navegación Móvil */}
            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto" aria-label="Navegación del comercio móvil">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = isLinkActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`group flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      active
                        ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30 font-semibold"
                        : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`h-5 w-5 transition-colors ${
                          active ? "text-[var(--dsn-accent)]" : "text-[var(--dsn-text-secondary)] group-hover:text-[var(--dsn-text)]"
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

            {/* Pie Drawer Móvil */}
            <div className="border-t border-[var(--dsn-border)] pt-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-[var(--dsn-text-secondary)]">Estado del servicio</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Conectado
                </span>
              </div>

              <div className="relative">
                {profilePopoverOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfilePopoverOpen(false)} aria-hidden="true" />
                    <div
                      role="menu"
                      aria-label="Menú de cuenta del comercio"
                      className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                    >
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
                          setSwitchStoreModalOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-accent)] transition-colors"
                      >
                        <ArrowLeftRight className="h-4 w-4 text-[var(--dsn-accent)]" />
                        <span>Cambiar Comercio</span>
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
                  className="w-full flex items-center justify-between rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-2.5 text-xs text-left transition-colors hover:bg-[var(--dsn-surface-secondary)]"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-semibold text-xs border border-[var(--dsn-accent)]/40">
                      {(user.displayName || user.email || "TO").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-[var(--dsn-text)] truncate">{user.displayName || "Propietario"}</p>
                      <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">{user.email}</p>
                    </div>
                  </div>
                  <ChevronUp className={`h-4 w-4 text-[var(--dsn-text-secondary)] transition-transform duration-200 shrink-0 ${profilePopoverOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. SIDEBAR PERSISTENTE ESCRITORIO (md:flex w-[260px])
         ───────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[260px] shrink-0 min-h-dvh border-r border-[var(--dsn-border)] bg-[var(--dsn-sidebar)] p-4 flex-col justify-between">
        <div>
          {/* Cabecera del Comercio */}
          <div className="pb-4 border-b border-[var(--dsn-border)] space-y-2.5">
            <Link
              href="/workspace"
              className="flex items-start gap-2.5 transition-opacity hover:opacity-90 active:scale-98 min-w-0"
              aria-label={`${displayStoreName} Inicio`}
            >
              {renderBrandMark("md")}
              <div className="flex flex-col min-w-0 flex-1 gap-1">
                <span
                  className="font-bold tracking-tight text-[var(--dsn-text)] text-sm break-words leading-snug line-clamp-2"
                  title={displayStoreName.length > 36 ? displayStoreName : undefined}
                >
                  {displayStoreName}
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="rounded bg-[var(--dsn-accent)]/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20 shrink-0">
                    Comercio
                  </span>
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">
                    {tenantInfo.slug}
                  </span>
                </div>
              </div>
            </Link>

            <div>{renderConnectionBadge()}</div>
          </div>

          {/* Navegación Desktop */}
          <nav className="mt-4 space-y-1.5" aria-label="Navegación del comercio escritorio">
            {visibleNavItems.map((item) => {
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
                        active ? "text-[var(--dsn-accent)]" : "text-[var(--dsn-text-secondary)] group-hover:text-[var(--dsn-text)]"
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

          <div className="relative">
            {profilePopoverOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfilePopoverOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  aria-label="Menú de cuenta del comercio"
                  className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-2.5 py-1.5 border-b border-[var(--dsn-border)]/60 mb-1">
                    <p className="text-[11px] font-semibold text-[var(--dsn-text)] truncate">{user.displayName || "Propietario"}</p>
                    <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">{user.email}</p>
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
                      setSwitchStoreModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-accent)] transition-colors"
                  >
                    <ArrowLeftRight className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>Cambiar Comercio</span>
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
              className="w-full flex items-center justify-between rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-2 text-xs text-left transition-colors hover:bg-[var(--dsn-surface-secondary)]"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] font-semibold text-xs border border-[var(--dsn-accent)]/40">
                  {(user.displayName || user.email || "TO").slice(0, 2).toUpperCase()}
                </div>
                <div className="truncate">
                  <p className="font-semibold text-[var(--dsn-text)] truncate">{user.displayName || "Propietario"}</p>
                  <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">{user.email}</p>
                </div>
              </div>
              <ChevronUp className={`h-4 w-4 text-[var(--dsn-text-secondary)] transition-transform duration-200 shrink-0 ${profilePopoverOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          4. CONTENEDOR DE CONTENIDO PRINCIPAL ({children})
         ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)]">
        {subscriptionAlert && (subscriptionAlert.daysRemaining <= 5 || isExpiredLocked) && (
          <div className="px-4 pt-4 md:px-8">
            <div
              data-testid="subscription-expiration-banner"
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                subscriptionAlert.daysRemaining <= 0 || isExpiredLocked
                  ? "border-rose-500/40 bg-rose-500/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}
            >
              <div className="flex items-start gap-3 text-xs">
                <ShieldCheck
                  className={`h-5 w-5 shrink-0 mt-0.5 ${
                    subscriptionAlert.daysRemaining <= 0 || isExpiredLocked
                      ? "text-rose-400"
                      : "text-amber-400"
                  }`}
                />
                <div className="space-y-0.5">
                  <p className="font-bold text-[var(--dsn-text)]">
                    {isExpiredLocked
                      ? dict.billingExpiredLockTitle
                      : subscriptionAlert.daysRemaining <= 0
                        ? dict.billingExpirationTodayTitle
                        : dict.billingExpirationWarningTitle}
                  </p>
                  <p className="text-[var(--dsn-text-secondary)]">
                    {subscriptionAlert.pendingBreBReview
                      ? dict.billingPendingBannerDesc
                      : isExpiredLocked
                        ? dict.billingExpiredLockDesc
                        : `${Math.max(0, subscriptionAlert.daysRemaining)} ${dict.billingDaysRemainingLabel}`}
                  </p>
                </div>
              </div>
              {!subscriptionAlert.pendingBreBReview && (
                <Link
                  href="/workspace/billing"
                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-lg bg-[var(--dsn-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  {dict.billingExpirationBannerCta}
                </Link>
              )}
            </div>
          </div>
        )}
        {children}
      </main>

      {/* ─────────────────────────────────────────────────────────────
          5. MODALES ACCESIBLES: PERFIL DEL COMERCIO, MEMBRESÍA Y LOGOUT
         ───────────────────────────────────────────────────────────── */}
      {/* Modal Ficha de Perfil del Comercio */}
      {profileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tenant-profile-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileModalOpen(false);
          }}
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="tenant-profile-title" className="text-base font-bold text-[var(--dsn-text)]">
                    Ficha De Perfil Del Comercio
                  </h2>
                  <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                    Panel operativo de tu comercio
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                aria-label="Cerrar modal"
                className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] p-2 rounded-lg hover:bg-[var(--dsn-surface-secondary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-[var(--dsn-text)]">
              <div className="flex items-center gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--dsn-accent)] text-white font-bold text-sm shadow-md">
                  {(user.displayName || user.email || "TO")
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-[var(--dsn-text)] truncate">
                    {user.displayName || "Propietario del Comercio"}
                  </h3>
                  <p className="text-xs text-[var(--dsn-text-secondary)] truncate">
                    {user.email}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
                      {user.role === "tenant_owner" ? "Propietario del Comercio" : "Agente del Comercio"}
                    </span>
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                      Activo
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)]">Comercio Activo</span>
                  <p className="font-semibold text-xs mt-0.5 text-[var(--dsn-text)] truncate">{tenantInfo.name}</p>
                </div>
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)]">Identificador Slug</span>
                  <p className="font-mono text-xs mt-0.5 text-[var(--dsn-text)] truncate">{tenantInfo.slug}</p>
                </div>
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)]">Estado Operativo</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="font-mono text-xs text-emerald-400 font-semibold">Conectado</p>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)]">Plan de Suscripción</span>
                  <p className="font-semibold text-xs mt-0.5 text-[var(--dsn-accent)] truncate">{tenantInfo.planName}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--dsn-text-secondary)]">ID de Usuario</span>
                  <button
                    type="button"
                    onClick={copyUserId}
                    className="flex items-center gap-1 text-[10px] text-[var(--dsn-accent)] hover:underline"
                  >
                    {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedId ? "Copiado" : "Copiar ID"}</span>
                  </button>
                </div>
                <p className="font-mono text-[11px] text-[var(--dsn-text)] truncate bg-[var(--dsn-surface)] p-1.5 rounded-lg border border-[var(--dsn-border)]">
                  {user.id}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] transition-colors min-h-[44px]"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Informativo: Cambio de Comercio (Regla D-15 1:0..1) */}
      {switchStoreModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-store-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSwitchStoreModalOpen(false);
          }}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="switch-store-title" className="text-base font-bold text-[var(--dsn-text)]">
                    Cambio de Comercio
                  </h2>
                  <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                    Membresía activa del operador
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSwitchStoreModalOpen(false)}
                aria-label="Cerrar modal"
                className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] p-2 rounded-lg hover:bg-[var(--dsn-surface-secondary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-[var(--dsn-text)]">
              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4">
                <span className="text-[10px] text-[var(--dsn-text-secondary)] tracking-wider font-semibold">
                  Comercio Vinculado Actualmente
                </span>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <p className="font-bold text-sm text-[var(--dsn-text)]">{tenantInfo.name}</p>
                    <p className="text-[10px] font-mono text-[var(--dsn-text-secondary)] mt-0.5">{tenantInfo.slug}</p>
                  </div>
                  <span className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-mono text-emerald-400 font-semibold border border-emerald-500/30">
                    Conectado
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
                <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                  <Shield className="h-4 w-4 text-amber-400" />
                  <span>Espacio Dedicado y Membresía Única</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  Tu cuenta se encuentra anclada de manera autoritativa al espacio de datos dedicado de este comercio.
                  Para gestionar otra tienda, debes iniciar sesión con las credenciales asociadas o recibir una invitación de membresía correspondiente.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSwitchStoreModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold bg-[var(--dsn-accent)] text-white hover:opacity-90 transition-opacity min-h-[44px]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Accesible de Confirmación de Logout (Regla 4.17) */}
      <ConfirmationModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Cerrar Sesión en el Comercio"
        subtitle="Finalizar la sesión operativa activa en el backoffice de tu comercio."
        variant="warning"
        confirmText="Cerrar Sesión Definitivamente"
        confirmLoadingText="Cerrando Sesión..."
        cancelText="Permanecer Conectado"
        loading={logoutLoading}
        details={[
          { label: "Comercio", value: tenantInfo.name },
          { label: "Operador", value: user.displayName || "Propietario del Comercio" },
          { label: "Correo Electrónico", value: user.email, mono: true },
          { label: "Identificador del Comercio", value: tenantInfo.slug, mono: true },
        ]}
        warningTitle="Finalización de Sesión Segura"
        warningMessage="Se revocará el token de autenticación del servidor y deberás volver a ingresar credenciales para acceder al backoffice."
      />
    </div>
  );
}
