# Technical Analysis · Milestone 2 Feature 11: Shell Bifurcation & TenantWorkspaceShell

> **Investigator**: Explorer 2 (`explorer_m2_2`)  
> **Milestone**: M2 (Authoritative Session Dispatch & Shell Bifurcation)  
> **Feature**: Feature 11 (`TenantWorkspaceShell.tsx` & `PortalShellRouter.tsx`)  
> **Applicable Specs**: TNT-001 (R2, R4), ADM-001 (D-35, D-37), AUTH-001 (AUTH-D-09), DSN-001, AGENTS.md (§4.8, §4.10, §4.15, §4.17)  

---

## 1. Executive Summary & Problem Boundary

In the current implementation of `apps/admin`:
1. `apps/admin/app/layout.tsx` unconditionally mounts `<AdminShell currentUser={currentUser}>{children}</AdminShell>` around every route, with an insecure fallback `let role = "platform_owner"` (lines 45–54) whenever a user has no rows in `admin.platform_user_roles`.
2. As documented in `TEST_READY.md §5.1` and `explorer_survey_3/handoff.md`, if an unauthenticated user supplies a forged or invalid session cookie, `AdminShell` still mounts, exposing the SaaS platform operator corporate sidebar and topbar.
3. No tenant backoffice shell component exists (`apps/admin/components/tenant-workspace-shell.tsx` is completely missing).
4. No bifurcated layout router exists (`apps/admin/components/portal-shell-router.tsx` is missing).

This analysis provides the complete, production-grade architectural specification and implementation blueprint for **Feature 11**:
- **`apps/admin/components/tenant-workspace-shell.tsx`**: Dedicated client component delivering the tenant merchant backoffice with distinct store branding, 7 base modules, 4 dynamically capability-gated modules, store quick actions (sign out with confirmation modal, switch store with D-15 guidance), and **absolute zero leakage** of SaaS platform administration controls.
- **`apps/admin/components/portal-shell-router.tsx`**: Server component layout router consuming `resolveAuthenticatedPortalContext(sid)` and request headers (`x-pathname`) to deterministically bifurcate between `AdminShell` (for `scope === 'platform'`), `TenantWorkspaceShell` (for `scope === 'tenant'`), un-shelled layout (for `scope === 'onboarding_prospect'` on `/onboarding`), and deterministic login redirect (for unauthenticated or forged sessions).
- **`apps/admin/app/layout.tsx`**: Clean refactor removing all role fallbacks and delegating shell bifurcation to `PortalShellRouter`.

---

## 2. Direct Codebase Observations & Constraints

### 2.1 Current Insecure Shell Mount in `apps/admin/app/layout.tsx`
- Lines 44–54:
  ```typescript
  const { user, session } = validation.data;
  let role = "platform_owner";
  try {
    const roles = await fetchUserActivePlatformRoles(user.id);
    if (roles.length > 0) {
      role = roles.includes("platform_owner") ? "platform_owner" : (roles[0] || "platform_owner");
    }
  } catch {
    // Fallback seguro a platform_owner
  }
  ```
- Line 86:
  ```tsx
  <AdminShell currentUser={currentUser}>{children}</AdminShell>
  ```
- **Consequence**: Every authenticated user—and even unauthenticated users with forged cookies—is wrapped in `AdminShell`. Platform routes (`/admin/cells`, `/admin/tenants`, `/admin/plans`) are leaked directly into the user interface.

### 2.2 E2E Scenario B Assertions (`tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs`)
- **B-T1.1 to B-T1.4**: Requests without valid session to `/`, `/admin/cells`, `/workspace`, and `/onboarding` must redirect with **HTTP 307** to the login page (`res.location.includes("/login")`).
- **B-T1.5**: Contract defines mutually exclusive scopes: `["platform", "tenant", "onboarding_prospect"]`.
- **B-T2.1**: Absence of platform roles must NEVER default to `platform_owner`.
- **B-T2.4**: Tenants in state `lifecycle_status = 'alta'` are constrained to `/onboarding` and blocked from `/workspace`.
- **B-T2.5**: Prospect users (`active_client_id IS NULL`) are constrained to `/onboarding`.
- **B-T3.1**: Tenant users cannot access `/admin/*` endpoints (returns not 200).
- **B-T3.2**: `AdminShell` and `TenantWorkspaceShell` must be physically distinct components with zero leakage of platform elements ("Plataforma SaaS", "Gestión de Celdas").

### 2.3 E2E Scenario D Assertions (`tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs`)
- **D-T1.1 (Base Modules)**: Exactly 7 base modules defined for all tenant plans:
  1. `/workspace` (Tablero)
  2. `/workspace/products` (Catálogo y Multimedia)
  3. `/workspace/contacts` (Contactos CRM)
  4. `/workspace/orders` (Pedidos y Ventas)
  5. `/workspace/bot` (Asistente AI y Contexto)
  6. `/workspace/team` (Equipo y Miembros)
  7. `/workspace/billing` (Mi Plan y Cuotas)
- **D-T1.2 (Optional Modules)**: Exactly 4 optional modules gated by plan feature flags:
  1. `/workspace/conversations` (Chatwoot, capability: `chatwoot_inboxes` / `conversations`)
  2. `/workspace/branding` (Marca Blanca, capability: `custom_branding` / `branding` / `white_label`)
  3. `/workspace/community` (Comunidad, capability: `community_feed` / `community`)
  4. `/workspace/reports` (Informes, capability: `data_export` / `reports`)
- **D-T3.1 & D-T3.2**: On Free plans lacking these capabilities, optional modules are hidden; on Enterprise plans with all capabilities enabled, all 4 modules are displayed.

---

## 3. Component Specification: `TenantWorkspaceShell.tsx`

### 3.1 Design Principles & Constitutional Compliance
- **Physical Independence**: Completely distinct `.tsx` file under `apps/admin/components/tenant-workspace-shell.tsx`. Does not import or share navigation items with `AdminShell`.
- **Mobile First (Rule 4.8)**: Sticky topbar HUD for viewports `< md` with touch targets $\ge 44\text{px}$, slide-over off-canvas drawer with backdrop blur, and desktop persistent sidebar ($260\text{px}$) for viewports $\ge \text{md}$.
- **Zero Native Dialogs (Rule 4.17)**: Logout confirmation and store switching modals use `ConfirmationModal` with Title Case labels, contextual warning banners, and keyboard accessibility (ESC/backdrop dismiss).
- **Zero Spec Code Leakage (Rule 4.15)**: No internal requirement codes (`TNT-001`, `ADM-001`, `RF-02`, etc.) in labels or UI.
- **Design System Tokens (`DSN-001`)**: All colors and backgrounds use `--dsn-background`, `--dsn-surface`, `--dsn-surface-secondary`, `--dsn-sidebar`, `--dsn-text`, `--dsn-text-secondary`, `--dsn-border`, `--dsn-accent`.

### 3.2 Visual Identity & Store Branding
- Renders the tenant store avatar / icon (`Store` from Lucide) or custom logo (`tenant.logoUrl`).
- Displays the store business name (`tenant.name`, e.g., `Synergia Market`).
- Displays a badge pill: `"Comercio"` (or subscription plan name, e.g. `"Plan Pro"`).
- Displays tenant slug (`tenant.slug`).
- Displays cell data plane connectivity badge: e.g. `● pg-cell-01` in green pulsing indicator.
- **Home Link**: Clicking the store brand links strictly to `/workspace`, **NEVER** to `/`.

### 3.3 Navigation Structure & Capability Gating
```typescript
interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  capabilityCode?: string;
  capabilityAliases?: string[];
}
```

#### Base Modules (7 items):
| Route | Label (Title Case) | Icon | Gated? |
|---|---|---|---|
| `/workspace` | Tablero | `LayoutDashboard` | No |
| `/workspace/products` | Productos Y Catálogo | `Package` | No |
| `/workspace/contacts` | Contactos CRM | `Users` | No |
| `/workspace/orders` | Pedidos Y Ventas | `ShoppingCart` | No |
| `/workspace/bot` | Asistente AI Y Bot | `Bot` | No |
| `/workspace/team` | Equipo Y Miembros | `ShieldCheck` | No |
| `/workspace/billing` | Mi Plan Y Cuotas | `CreditCard` | No |

#### Optional Modules (4 items):
| Route | Label (Title Case) | Icon | Primary Capability Code | Capability Aliases |
|---|---|---|---|---|
| `/workspace/conversations` | Conversaciones Omnicanal | `MessageSquare` | `chatwoot_inboxes` | `conversations` |
| `/workspace/branding` | Identidad Y Marca Blanca | `Paintbrush` | `custom_branding` | `branding`, `white_label` |
| `/workspace/community` | Comunidad De Comercios | `Globe` | `community_feed` | `community` |
| `/workspace/reports` | Informes Y Analítica | `BarChart3` | `data_export` | `reports` |

#### Filtering Algorithm:
```typescript
const isItemVisible = (item: NavItem): boolean => {
  if (!item.capabilityCode) return true; // Base modules are always visible
  if (!capabilities) return false;
  if (capabilities[item.capabilityCode]) return true;
  if (item.capabilityAliases) {
    for (const alias of item.capabilityAliases) {
      if (capabilities[alias]) return true;
    }
  }
  return false;
};
```

### 3.4 Active Link Highlighting
To avoid highlighting `/workspace` when on `/workspace/products`:
```typescript
function isLinkActive(href: string): boolean {
  if (href === "/workspace") {
    return pathname === "/workspace";
  }
  return pathname.startsWith(href);
}
```

### 3.5 Tenant User Profile HUD & Quick Actions
Located at the bottom of the sidebar and mobile drawer:
1. **User Profile Card**:
   - Initial avatar (two letters of display name or email).
   - Display name: `user.displayName || "Operador Del Comercio"`.
   - Email: `user.email`.
   - Role badge: `"Propietario Del Comercio"` (`tenant_owner`) or `"Agente Del Comercio"` (`tenant_agent`).
2. **Popover Menu**:
   - **Ficha De Perfil**: Opens accessible tenant profile modal detailing User ID, Email, Role in store, Active Store name, Store Slug, Assigned Cell (`pg-cell-01`), and Plan name. Free of SaaS platform jargon.
   - **Cambiar Comercio**: Opens informational modal highlighting active store, cell data plane, and single-store membership rule (ADM-001 D-15: 1:0..1).
   - **Cerrar Sesión**: Opens `ConfirmationModal` (variant: `"warning"`) confirming session termination, revoking the session via `POST /api/auth/logout`, and redirecting via `handleLogoutRedirect()`.

---

## 4. Component Specification: `PortalShellRouter.tsx`

### 4.1 Purpose and Execution Context
- File: `apps/admin/components/portal-shell-router.tsx`.
- **Server Component** (async): runs on the server inside `RootLayout`.
- Reads session cookie (`__Host-mocter_sid` in production, `mocter_sid` in development).
- Resolves authoritative session context via `resolveAuthenticatedPortalContext(sid)` from `@mocter/domain`.
- Inspects active request path via `headers().get("x-pathname")` (propagated by `proxy.ts`).
- Deterministically mounts the authorized shell or triggers a server-side redirect.

### 4.2 Authoritative Dispatch Matrix
| User Scope | `lifecycleStatus` | Active Pathname (`x-pathname`) | Render / Action |
|---|---|---|---|
| *Unauthenticated* / Invalid Session | *Any* | *Any* | **Redirect** to `/es/login?return_to=...` (HTTP 307) |
| `onboarding_prospect` | *Any* | `/onboarding` | Render un-shelled `<main>{children}</main>` |
| `onboarding_prospect` | *Any* | `!= /onboarding` | **Redirect** to `/onboarding` (HTTP 307) |
| `tenant` | `'alta'` | `/onboarding` | Render un-shelled `<main>{children}</main>` |
| `tenant` | `'alta'` | `!= /onboarding` | **Redirect** to `/onboarding` (HTTP 307) |
| `tenant` | `'activo'` | `/workspace/*` | Render `<TenantWorkspaceShell>{children}</TenantWorkspaceShell>` |
| `tenant` | `'activo'` | `/` or `/admin/*` | **Redirect** to `/workspace` (HTTP 307) |
| `tenant` | `'activo'` | `/onboarding` | **Redirect** to `/workspace` (HTTP 307) |
| `platform` | *Any* | `/admin/*` or `/` | Render `<AdminShell>{children}</AdminShell>` |
| `platform` | *Any* | `/workspace/*` | **Redirect** to `/` (HTTP 307) |
| `platform` | *Any* | `/onboarding` | Render un-shelled `<main>{children}</main>` (supervision mode) |

### 4.3 Fallback Safety Guarantee
If `x-pathname` is unavailable (e.g. edge case or isolated test environment):
- `scope === 'platform'` $\rightarrow$ renders `AdminShell`
- `scope === 'tenant'` $\rightarrow$ renders `TenantWorkspaceShell`
- `scope === 'onboarding_prospect'` $\rightarrow$ renders `<main className="min-h-dvh ...">{children}</main>`
- *No platform navigation elements can ever render for a tenant, regardless of path resolution.*

---

## 5. Complete Implementation Blueprints for Worker

### 5.1 `apps/admin/components/tenant-workspace-shell.tsx`

```tsx
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
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ConfirmationModal } from "./confirmation-modal";
import { handleLogoutRedirect } from "@/lib/api-client";
import type { CurrentUserDto } from "./user-profile-modal";

export interface TenantWorkspaceShellProps {
  children: React.ReactNode;
  currentUser?: CurrentUserDto;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    cellCode?: string;
    logoUrl?: string;
    planName?: string;
  };
  capabilities?: Record<string, boolean>;
}

interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  capabilityCode?: string;
  capabilityAliases?: string[];
}

/**
 * Shell operativo persistente del backoffice del inquilino (ADM-001 D-35, TNT-001).
 *
 * Características:
 * 1. Identidad visual del comercio con soporte para logotipo o avatar e indicador de celda física.
 * 2. 7 módulos base universales para todos los planes gobernados por cuotas de negocio.
 * 3. 4 módulos dinámicos filtrados por capacidades efectivas del plan (TenantCapabilityGateService).
 * 4. Ficha de perfil HUD del comercio, selector de comercio (D-15) y modal de confirmación de logout (Regla 4.17).
 * 5. Cero fugas hacia el plano corporativo de la SaaS (sin enlaces /admin/* ni términos de plataforma).
 */
export function TenantWorkspaceShell({
  children,
  currentUser,
  tenant,
  capabilities,
}: TenantWorkspaceShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [switchStoreModalOpen, setSwitchStoreModalOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const tenantInfo = {
    id: tenant?.id || "tenant-default-id",
    name: tenant?.name || "Mi Comercio",
    slug: tenant?.slug || "comercio",
    cellCode: tenant?.cellCode || "pg-cell-01",
    logoUrl: tenant?.logoUrl,
    planName: tenant?.planName || "Plan Pro",
  };

  const user: CurrentUserDto = currentUser || {
    id: "00000000-0000-0000-0000-000000000000",
    email: "comercio@mocter.co",
    displayName: "Propietario Del Comercio",
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
      label: "Productos Y Catálogo",
      icon: Package,
    },
    {
      href: "/workspace/contacts",
      label: "Contactos CRM",
      icon: Users,
    },
    {
      href: "/workspace/orders",
      label: "Pedidos Y Ventas",
      icon: ShoppingCart,
    },
    {
      href: "/workspace/bot",
      label: "Asistente AI Y Bot",
      badge: "AI",
      icon: Bot,
    },
    {
      href: "/workspace/team",
      label: "Equipo Y Miembros",
      icon: ShieldCheck,
    },
    {
      href: "/workspace/billing",
      label: "Mi Plan Y Cuotas",
      icon: CreditCard,
    },

    // ── Módulos Dinámicos (Gated por capacidades de plan) ──
    {
      href: "/workspace/conversations",
      label: "Conversaciones Omnicanal",
      badge: "Chatwoot",
      icon: MessageSquare,
      capabilityCode: "chatwoot_inboxes",
      capabilityAliases: ["conversations"],
    },
    {
      href: "/workspace/branding",
      label: "Identidad Y Marca Blanca",
      badge: "Marca",
      icon: Paintbrush,
      capabilityCode: "custom_branding",
      capabilityAliases: ["branding", "white_label"],
    },
    {
      href: "/workspace/community",
      label: "Comunidad De Comercios",
      badge: "Red",
      icon: Globe,
      capabilityCode: "community_feed",
      capabilityAliases: ["community"],
    },
    {
      href: "/workspace/reports",
      label: "Informes Y Analítica",
      badge: "Datos",
      icon: BarChart3,
      capabilityCode: "data_export",
      capabilityAliases: ["reports"],
    },
  ];

  const visibleNavItems = navItems.filter((item) => {
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
    return pathname.startsWith(href);
  }

  const copyUserId = () => {
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

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
            aria-label="Abrir menú de navegación"
            aria-expanded={mobileMenuOpen}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)] transition-colors hover:bg-[var(--dsn-surface-secondary)] active:scale-95"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/40 font-bold text-xs">
              <Store className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm text-[var(--dsn-text)] truncate max-w-[120px]">
              {tenantInfo.name}
            </span>
          </div>
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
          aria-label="Menú de navegación del comercio"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="relative z-10 flex w-[280px] max-w-[85vw] h-dvh flex-col justify-between border-r border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/40">
                    <Store className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[var(--dsn-text)] truncate">{tenantInfo.name}</p>
                    <p className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">{tenantInfo.slug}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-4 space-y-1.5 overflow-y-auto flex-1 pr-1 overscroll-contain" aria-label="Navegación del comercio móvil">
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

            <div className="border-t border-[var(--dsn-border)] pt-4 space-y-3 shrink-0">
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
          <div className="flex items-center justify-between pb-4 border-b border-[var(--dsn-border)]">
            <Link
              href="/workspace"
              className="flex items-center gap-2.5 transition-opacity hover:opacity-90 active:scale-98 min-w-0"
              aria-label={`${tenantInfo.name} Inicio`}
            >
              {tenantInfo.logoUrl ? (
                <img
                  src={tenantInfo.logoUrl}
                  alt={tenantInfo.name}
                  className="h-8 w-8 rounded-lg object-contain border border-[var(--dsn-border)]"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/20 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/40 shadow-xs">
                  <Store className="h-4 w-4" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold tracking-tight text-[var(--dsn-text)] text-sm truncate max-w-[120px]">
                    {tenantInfo.name}
                  </span>
                  <span className="rounded bg-[var(--dsn-accent)]/15 px-1.5 py-0.2 text-[10px] font-mono font-semibold text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20 shrink-0">
                    Comercio
                  </span>
                </div>
                <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono truncate">
                  {tenantInfo.slug}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 shrink-0" title={`Conectado a ${tenantInfo.cellCode}`}>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-emerald-400">{tenantInfo.cellCode}</span>
            </div>
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
                    Backoffice operativo en celda dedicada
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
                    {user.displayName || "Propietario Del Comercio"}
                  </h3>
                  <p className="text-xs text-[var(--dsn-text-secondary)] truncate">
                    {user.email}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/30">
                      <Shield className="h-2.5 w-2.5" />
                      {user.role === "tenant_owner" ? "Propietario Del Comercio" : user.role}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-[var(--dsn-accent)] border border-cyan-500/20">
                      {user.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                <h4 className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] uppercase tracking-wider">
                  Información Del Comercio
                </h4>

                <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
                  <span className="text-[var(--dsn-text-secondary)]">Nombre Del Negocio:</span>
                  <span className="font-semibold text-[var(--dsn-text)]">{tenantInfo.name}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
                  <span className="text-[var(--dsn-text-secondary)]">Identificador (Slug):</span>
                  <span className="font-mono text-[var(--dsn-text)]">{tenantInfo.slug}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[var(--dsn-border)]/50 pb-2">
                  <span className="text-[var(--dsn-text-secondary)]">Celda De Datos Asignada:</span>
                  <span className="font-mono text-emerald-400">{tenantInfo.cellCode}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--dsn-text-secondary)]">Plan De Suscripción:</span>
                  <span className="font-semibold text-[var(--dsn-accent)]">{tenantInfo.planName}</span>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                <h4 className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] uppercase tracking-wider">
                  Identidad De Usuario
                </h4>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--dsn-text-secondary)]">ID De Usuario:</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-[var(--dsn-text)] truncate max-w-[200px]">{user.id}</span>
                    <button
                      type="button"
                      onClick={copyUserId}
                      title="Copiar ID"
                      aria-label="Copiar ID de usuario"
                      className="rounded p-1 text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-accent)] hover:bg-[var(--dsn-surface)] transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                    >
                      {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-5 border-t border-[var(--dsn-border)] mt-5">
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="rounded-xl bg-[var(--dsn-surface-secondary)] px-5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] transition-colors min-h-[44px]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cambio de Comercio (Membresía 1:0..1 ADM-001 D-15) */}
      <ConfirmationModal
        isOpen={switchStoreModalOpen}
        onClose={() => setSwitchStoreModalOpen(false)}
        onConfirm={() => setSwitchStoreModalOpen(false)}
        title="Cambio De Comercio"
        subtitle="Entorno operativo del comercio activo."
        variant="neutral"
        icon={<Store className="h-5 w-5 text-[var(--dsn-accent)]" />}
        confirmText="Entendido"
        cancelText="Cerrar"
        details={[
          { label: "Comercio Activo", value: tenantInfo.name },
          { label: "Identificador (Slug)", value: tenantInfo.slug, mono: true },
          { label: "Celda Conectada", value: tenantInfo.cellCode, mono: true },
        ]}
        warningTitle="Membresía Del Comercio (ADM-001 D-15)"
        warningMessage="Tu usuario se encuentra vinculado a este comercio conforme a la regla de membresía 1:0..1. Para acceder a otro comercio, debes iniciar sesión con la cuenta correspondiente."
      />

      {/* Modal Confirmación de Cierre de Sesión */}
      <ConfirmationModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Cerrar Sesión En El Comercio"
        subtitle="Finalizar la sesión operativa activa en el backoffice de tu comercio."
        variant="warning"
        confirmText="Cerrar Sesión Definitivamente"
        confirmLoadingText="Cerrando Sesión..."
        cancelText="Permanecer Conectado"
        loading={logoutLoading}
        details={[
          { label: "Comercio", value: tenantInfo.name },
          { label: "Operador", value: user.displayName || "Propietario Del Comercio" },
          { label: "Correo Electrónico", value: user.email, mono: true },
          { label: "Celda De Datos", value: tenantInfo.cellCode, mono: true },
        ]}
        warningTitle="Finalización De Sesión Segura"
        warningMessage="Se revocará el token de autenticación del servidor y deberás volver a ingresar credenciales para acceder al backoffice."
      />
    </div>
  );
}
```

---

### 5.2 `apps/admin/components/portal-shell-router.tsx`

```tsx
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";
import { AdminShell } from "@/components/admin-shell";
import { TenantWorkspaceShell } from "@/components/tenant-workspace-shell";
import type { CurrentUserDto } from "@/components/user-profile-modal";

interface PortalShellRouterProps {
  children: ReactNode;
}

/**
 * Resuelve la URL canónica de login unificado para redirecciones server-side (AUTH-D-09, Regla 4.16).
 */
function getLoginRedirectUrl(pathname?: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const loginBase =
    process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");
  const returnTo = pathname ? `?return_to=${encodeURIComponent(pathname)}` : "";
  return `${loginBase.replace(/\/$/, "")}/es/login${returnTo}`;
}

/**
 * Enrutador autoritativo de cascarones visuales a nivel de servidor (ADM-001 D-35, TNT-001 R2).
 *
 * Responsabilidades:
 * 1. Resuelve el contexto autoritativo de sesión (resolveAuthenticatedPortalContext) en servidor.
 * 2. Bloquea de raíz sesiones anónimas, expiradas o con tokens falsificados (TEST_READY.md §5.1),
 *    redirigiendo inmediatamente a /es/login (HTTP 307) antes de montar cualquier componente.
 * 3. Evalúa la ruta activa (x-pathname propagado por proxy.ts) y bifurca los árboles .tsx:
 *    - scope === 'onboarding_prospect' o lifecycleStatus === 'alta' -> layout limpio en /onboarding.
 *    - scope === 'platform' -> <AdminShell> en /admin/* y /.
 *    - scope === 'tenant' -> <TenantWorkspaceShell> en /workspace/*.
 * 4. Intercepta y redirige cualquier intento de navegación cruzada entre planos.
 */
export async function PortalShellRouter({ children }: PortalShellRouterProps) {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value;

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "";

  // 1. Redirección inmediata si no hay cookie de sesión activa
  if (!sid || !sid.trim()) {
    redirect(getLoginRedirectUrl(pathname));
  }

  // 2. Validación autoritativa en base de datos de control
  const portalContext = await resolveAuthenticatedPortalContext(sid);
  if (!portalContext) {
    // Sesión revocada, inexistente o falsificada -> 307 a login (previene fuga de AdminShell)
    redirect(getLoginRedirectUrl(pathname));
  }

  const { scope, lifecycleStatus, user, role, activeClient, activeCellCode, planName, capabilities } =
    portalContext;

  const currentUserDto: CurrentUserDto = {
    id: user.id,
    email: user.email,
    displayName: user.displayName || null,
    role: role || (scope === "platform" ? "platform_owner" : "tenant_owner"),
    status: user.status || "active",
    emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt).toISOString() : null,
  };

  // 3. CASO A: Prospecto o inquilino en estado 'alta' (onboarding obligatorio)
  if (scope === "onboarding_prospect" || lifecycleStatus === "alta") {
    if (pathname && !pathname.startsWith("/onboarding")) {
      redirect("/onboarding");
    }
    // En /onboarding: renderizar layout limpio sin barras laterales corporativas ni de comercio
    return (
      <main className="min-h-dvh w-full bg-[var(--dsn-background)] text-[var(--dsn-text)]">
        {children}
      </main>
    );
  }

  // 4. CASO B: Operador corporativo SaaS (scope === 'platform')
  if (scope === "platform") {
    // Intercepción de fuga hacia /workspace
    if (pathname && pathname.startsWith("/workspace")) {
      redirect("/");
    }
    // Si visita /onboarding en modo supervisión
    if (pathname && pathname.startsWith("/onboarding")) {
      return (
        <main className="min-h-dvh w-full bg-[var(--dsn-background)] text-[var(--dsn-text)]">
          {children}
        </main>
      );
    }
    return (
      <AdminShell currentUser={currentUserDto} tenantCapabilities={capabilities}>
        {children}
      </AdminShell>
    );
  }

  // 5. CASO C: Inquilino activo (scope === 'tenant' con lifecycleStatus === 'activo')
  if (scope === "tenant") {
    // Intercepción de fuga hacia /admin/* o /
    if (pathname && (pathname.startsWith("/admin") || pathname === "/")) {
      redirect("/workspace");
    }
    // Si visita /onboarding y ya está activo, enviar a /workspace
    if (pathname && pathname.startsWith("/onboarding")) {
      redirect("/workspace");
    }
    return (
      <TenantWorkspaceShell
        currentUser={currentUserDto}
        tenant={{
          id: activeClient?.id || "",
          name: activeClient?.name || "Mi Comercio",
          slug: activeClient?.slug || "comercio",
          cellCode: activeCellCode || "pg-cell-01",
          planName: planName || "Plan Pro",
        }}
        capabilities={capabilities}
      >
        {children}
      </TenantWorkspaceShell>
    );
  }

  // 6. CASO D: Scope anómalo o desconocido -> Redirección defensiva a login
  redirect(getLoginRedirectUrl(pathname));
}
```

---

### 5.3 Refactoring `apps/admin/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { PortalShellRouter } from "@/components/portal-shell-router";
import "./globals.css";

export const metadata: Metadata = {
  title: "mocter-admin · Plataforma SaaS & Workspace",
  description: "Consola de administración corporativa y backoffice operativo del comercio en Mocter",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Layout raíz de la aplicación administrativa unificada (ADM-001 D-35, DSN-001).
 *
 * Configura:
 * 1. Proveedor de tema claro/oscuro (ThemeProvider).
 * 2. Enrutador autoritativo de cascarones (PortalShellRouter): bifurca en servidor entre AdminShell,
 *    TenantWorkspaceShell o layout de onboarding sin fugas de UI ni fallbacks a platform_owner.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] antialiased transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <PortalShellRouter>{children}</PortalShellRouter>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

### 5.4 Required Middleware Coordination: `apps/admin/proxy.ts`
To ensure `headers().get("x-pathname")` resolves reliably inside `PortalShellRouter`, `apps/admin/proxy.ts` must propagate `x-pathname` on `NextResponse.next()`:
```typescript
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
```

---

## 6. Unit Testing Specification

### 6.1 `apps/admin/components/tenant-workspace-shell.test.tsx`
The Worker must create this test file using Vitest and React Testing Library:
1. **Tenant Branding**:
   - Asserts rendering of `Synergia Market` and badge `"Comercio"`.
   - Asserts store initial or logo renders.
   - Asserts home link points to `/workspace`.
2. **7 Base Modules**:
   - Asserts presence of links to `/workspace`, `/workspace/products`, `/workspace/contacts`, `/workspace/orders`, `/workspace/bot`, `/workspace/team`, `/workspace/billing`.
3. **Zero SaaS Platform Leakage**:
   - Asserts `queryByText(/Plataforma SaaS/i)` is `null`.
   - Asserts `queryByText(/Celdas de Datos/i)` is `null`.
   - Asserts no links have `href` starting with `/admin`.
4. **Dynamic Capability Gating**:
   - When `{ chatwoot_inboxes: false, custom_branding: false, community_feed: false, data_export: false }`:
     Asserts optional modules are hidden.
   - When `{ chatwoot_inboxes: true, custom_branding: true, community_feed: true, data_export: true }`:
     Asserts optional modules (`/workspace/conversations`, `/workspace/branding`, `/workspace/community`, `/workspace/reports`) are present.
5. **Logout Modal**:
   - Clicks logout trigger $\rightarrow$ verifies modal title `"Cerrar Sesión En El Comercio"`.
   - Clicks confirm $\rightarrow$ verifies `POST /api/auth/logout` called and `handleLogoutRedirect` executed.
6. **Store Switch Modal (D-15)**:
   - Clicks "Cambiar Comercio" $\rightarrow$ verifies modal title `"Cambio De Comercio"` and single-store membership message.

---

## 7. Implementation Checklist for Worker

- [ ] Create `apps/admin/components/tenant-workspace-shell.tsx` according to Section 5.1.
- [ ] Create `apps/admin/components/portal-shell-router.tsx` according to Section 5.2.
- [ ] Refactor `apps/admin/app/layout.tsx` according to Section 5.3.
- [ ] Verify `apps/admin/proxy.ts` passes `x-pathname` header (coordination with Explorer 3).
- [ ] Create `apps/admin/components/tenant-workspace-shell.test.tsx` according to Section 6.1.
- [ ] Run `pnpm --filter @mocter/admin test` to ensure all shell unit tests pass.
- [ ] Run `node tests/e2e/run.mjs --scenario=B` to verify Scenario B passes.
- [ ] Compile and health check Docker service: `mocter-core-admin-portal-1` returns HTTP 200 on `/api/health`.
