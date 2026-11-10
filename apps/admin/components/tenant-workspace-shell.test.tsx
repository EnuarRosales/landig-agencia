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
  cellCode: "pg-cell-01",
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

  it("1. Renderiza la identidad visual del comercio (nombre, slug, badge Comercio e indicador de celda)", () => {
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
    expect(screen.getAllByText(/pg-cell-01/i).length).toBeGreaterThanOrEqual(1);
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
      "Productos Y Catálogo",
      "Contactos CRM",
      "Pedidos Y Ventas",
      "Asistente AI Y Bot",
      "Equipo Y Miembros",
      "Mi Plan Y Cuotas",
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

    expect(screen.queryByText("Conversaciones Omnicanal")).toBeNull();
    expect(screen.queryByText("Identidad Y Marca Blanca")).toBeNull();
    expect(screen.queryByText("Comunidad De Comercios")).toBeNull();
    expect(screen.queryByText("Informes Y Analítica")).toBeNull();
  });

  it("6. Muestra los 4 módulos opcionales cuando las capacidades están habilitadas", () => {
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

    expect(screen.getAllByText("Conversaciones Omnicanal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Identidad Y Marca Blanca").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Comunidad De Comercios").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Informes Y Analítica").length).toBeGreaterThanOrEqual(1);
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

      expect(screen.getByText("Cerrar Sesión En El Comercio")).toBeDefined();
      expect(screen.getByText("Cerrar Sesión Definitivamente")).toBeDefined();
    }
  });

  it("8. Abre el modal informativo de Cambio de Comercio con advertencia de aislamiento celular (D-15)", () => {
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

      expect(screen.getByText("Cambio De Comercio")).toBeDefined();
      expect(screen.getByText(/Aislamiento Celular Y Membresía Única/i)).toBeDefined();
    }
  });
});
