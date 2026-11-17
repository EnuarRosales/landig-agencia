/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TenantWorkspaceShell } from "./tenant-workspace-shell";
import type { CurrentUserDto } from "./user-profile-modal";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
}));

vi.mock("@/lib/api-client", () => ({
  handleLogoutRedirect: vi.fn(),
}));

const mockTenantUser: CurrentUserDto = {
  id: "user-tenant-001-uuid",
  email: "synergiamarket25@gmail.com",
  displayName: "Synergia Market Owner",
  role: "tenant_owner",
  status: "active",
};

const mockTenantInfo = {
  id: "client-synergia-uuid",
  name: "Synergia Market",
  slug: "synergia-market",
  planName: "Plan Pro",
};

describe("apps/admin · TenantWorkspaceShell Component (TNT-001 R2/R4, ADM-D-35)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("1. Renderiza la identidad visual del comercio (nombre, slug, badge Comercio e indicador Conectado sin exponer celda)", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
      >
        <div>Contenido Del Workspace</div>
      </TenantWorkspaceShell>,
    );

    expect(screen.getAllByText("Synergia Market").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("synergia-market").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Comercio").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Conectado").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/pg-cell/i)).toBeNull();
    expect(screen.queryByText(/Celda de datos/i)).toBeNull();
    expect(screen.getByText("Contenido Del Workspace")).toBeDefined();
  });

  it("2. El enlace de inicio del comercio apunta estrictamente a /workspace (NUNCA a / ni /admin)", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    const brandLinks = screen.getAllByRole("link", { name: /Synergia Market Inicio/i });
    expect(brandLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of brandLinks) {
      expect(link.getAttribute("href")).toBe("/workspace");
      expect(link.getAttribute("href")).not.toBe("/");
      expect(link.getAttribute("href")).not.toContain("/admin");
    }
  });

  it("3. Renderiza los 7 módulos base universales para todos los planes", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    const expectedLabels = [
      "Tablero",
      "Productos y Catálogo",
      "Contactos CRM",
      "Pedidos y Ventas",
      "Asistente AI y Bot",
      "Equipo y Miembros",
      "Mi Plan y Cuotas",
    ];

    for (const label of expectedLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("4. Cero fugas hacia el plano corporativo SaaS (sin enlaces /admin ni términos de plataforma)", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    expect(screen.queryByText(/Plataforma SaaS/i)).toBeNull();
    expect(screen.queryByText(/Gestión de Celdas/i)).toBeNull();
    expect(screen.queryByText(/Platform Owner/i)).toBeNull();

    const allLinks = screen.getAllByRole("link");
    for (const link of allLinks) {
      const href = link.getAttribute("href") || "";
      expect(href.startsWith("/admin")).toBe(false);
    }
  });

  it("5. Oculta módulos opcionales cuando las capacidades están deshabilitadas", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
        capabilities={{
          chatwoot_inboxes: false,
          custom_branding: false,
          community_feed: false,
          data_export: false,
        }}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    expect(screen.queryByText("Conversaciones")).toBeNull();
    expect(screen.queryByText("Identidad Y Marca Blanca")).toBeNull();
    expect(screen.queryByText("Comunidad De Comercios")).toBeNull();
    expect(screen.queryByText("Informes Y Analítica")).toBeNull();
  });

  it("6. Muestra Conversaciones en posición 2 debajo de Tablero y los módulos opcionales cuando están habilitados", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
        capabilities={{
          chatwoot_inboxes: true,
          custom_branding: true,
          community_feed: true,
          data_export: true,
        }}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    expect(screen.getAllByText("Conversaciones").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Chatwoot/i)).toBeNull();
    expect(screen.getAllByText("Identidad y Marca Blanca").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Comunidad de Comercios").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Informes y Analítica").length).toBeGreaterThanOrEqual(1);

    const desktopNav = screen.getByRole("navigation", { name: /Navegación del comercio/i });
    const navLinks = Array.from(desktopNav.querySelectorAll("a"));
    expect(navLinks[0]?.getAttribute("href")).toBe("/workspace");
    expect(navLinks[1]?.getAttribute("href")).toBe("/workspace/conversations");
    expect(navLinks[1]?.textContent).toContain("Conversaciones");
  });

  it("6b. Renderiza el ítem Conversaciones traducido al inglés en posición 2 cuando locale='en'", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
        locale="en"
        capabilities={{ chatwoot_inboxes: true }}
      >
        <div>Content</div>
      </TenantWorkspaceShell>,
    );

    const desktopNav = screen.getByRole("navigation", { name: /Navegación del comercio/i });
    const navLinks = Array.from(desktopNav.querySelectorAll("a"));
    expect(navLinks[0]?.getAttribute("href")).toBe("/workspace");
    expect(navLinks[1]?.getAttribute("href")).toBe("/workspace/conversations");
    expect(navLinks[1]?.textContent).toContain("Conversations");
  });

  it("7. Despliega el menú HUD y abre el modal de confirmación de logout accesible (Regla 4.17)", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    const triggerButtons = screen.getAllByRole("button", { expanded: false });
    const userTrigger = triggerButtons.find((btn) => btn.getAttribute("aria-haspopup") === "menu");
    expect(userTrigger).toBeDefined();

    if (userTrigger) {
      fireEvent.click(userTrigger);
      const logoutBtn = screen.getAllByText("Cerrar Sesión")[0];
      fireEvent.click(logoutBtn);

      expect(screen.getByText("Cerrar Sesión en el Comercio")).toBeDefined();
      expect(screen.getByText("Cerrar Sesión Definitivamente")).toBeDefined();
    }
  });

  it("8. Abre el modal informativo de Cambio de Comercio con advertencia de espacio dedicado (D-15)", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    const triggerButtons = screen.getAllByRole("button", { expanded: false });
    const userTrigger = triggerButtons.find((btn) => btn.getAttribute("aria-haspopup") === "menu");
    expect(userTrigger).toBeDefined();

    if (userTrigger) {
      fireEvent.click(userTrigger);
      const switchBtn = screen.getAllByText("Cambiar Comercio")[0];
      fireEvent.click(switchBtn);

      expect(screen.getByText("Cambio de Comercio")).toBeDefined();
      expect(screen.getByText(/Espacio Dedicado y Membresía Única/i)).toBeDefined();
    }
  });

  it("9. Renderiza nombre largo completo sin recortes fijos y aplica fallback ante error de carga en logoUrl (SPEC-07 T-03)", () => {
    const longName = "Distribuidora Integral Café del Valle Sur";
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={{
          ...mockTenantInfo,
          name: longName,
          logoUrl: "https://cdn.mocter.co/broken-logo.png",
        }}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    const renderedNames = screen.getAllByText(longName);
    expect(renderedNames.length).toBeGreaterThanOrEqual(2);
    for (const node of renderedNames) {
      expect(node.className).not.toContain("max-w-[120px]");
      expect(node.className).not.toContain("max-w-[130px]");
    }

    const logos = screen.getAllByRole("img", { name: longName });
    expect(logos.length).toBeGreaterThanOrEqual(1);
    fireEvent.error(logos[0]);
    expect(screen.queryByRole("img", { name: longName })).toBeNull();
  });

  it("10. Inyecta brandingTokens en el contenedor raíz y prioriza branding.brandName cuando está activo (SPEC-07 T-03)", () => {
    render(
      <TenantWorkspaceShell
        currentUser={mockTenantUser}
        tenant={mockTenantInfo}
        brandingTokens={{ "--dsn-accent": "#0F766E", "--dsn-accent-fg": "#FFFFFF" }}
        branding={{ brandName: "Marca Blanca Norte", removeMocterBranding: true }}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>,
    );

    const root = screen.getByTestId("tenant-workspace-shell");
    expect(root.getAttribute("style")).toContain("--dsn-accent: #0F766E");
    expect(screen.getAllByText("Marca Blanca Norte").length).toBeGreaterThanOrEqual(1);
  });
});
