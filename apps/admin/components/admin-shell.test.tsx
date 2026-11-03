/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AdminShell } from "./admin-shell";
import type { CurrentUserDto } from "./user-profile-modal";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/cells",
}));

vi.mock("@/lib/api-client", () => ({
  handleLogoutRedirect: vi.fn(),
}));

const mockUser: CurrentUserDto = {
  id: "user-owner-001-uuid",
  email: "soporte@mocter.co",
  displayName: "Alejandro Herrera",
  role: "platform_owner",
  status: "active",
};

describe("apps/admin · AdminShell Component (Profile & Logout)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza la información del usuario en el sidebar", () => {
    render(
      <AdminShell currentUser={mockUser}>
        <div>Contenido Principal</div>
      </AdminShell>
    );

    expect(screen.getAllByText("Alejandro Herrera").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("soporte@mocter.co").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Contenido Principal")).toBeDefined();
  });

  it("despliega el menú popover al hacer clic en la tarjeta de usuario", () => {
    render(
      <AdminShell currentUser={mockUser}>
        <div>Contenido Principal</div>
      </AdminShell>
    );

    // Obtener los botones que abren el menú popover (móvil y desktop)
    const triggerButtons = screen.getAllByRole("button", { expanded: false });
    const userTrigger = triggerButtons.find((btn) => btn.getAttribute("aria-haspopup") === "menu");
    expect(userTrigger).toBeDefined();

    if (userTrigger) {
      fireEvent.click(userTrigger);
      expect(screen.getAllByText("Ficha De Perfil").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Cerrar Sesión").length).toBeGreaterThanOrEqual(1);
    }
  });

  it("abre el modal de Ficha de Perfil al seleccionar la opción correspondiente", () => {
    render(
      <AdminShell currentUser={mockUser}>
        <div>Contenido Principal</div>
      </AdminShell>
    );

    const triggerButtons = screen.getAllByRole("button", { expanded: false });
    const userTrigger = triggerButtons.find((btn) => btn.getAttribute("aria-haspopup") === "menu");
    if (userTrigger) {
      fireEvent.click(userTrigger);
      const profileButton = screen.getAllByRole("button", { name: /Ficha De Perfil/i })[0];
      fireEvent.click(profileButton);

      expect(screen.getByText("Ficha De Perfil Del Operador")).toBeDefined();
      expect(screen.getByText("user-owner-001-uuid")).toBeDefined();
    }
  });

  it("abre el modal de confirmación de logout y ejecuta la revocación al confirmar", async () => {
    const { handleLogoutRedirect } = await import("@/lib/api-client");

    render(
      <AdminShell currentUser={mockUser}>
        <div>Contenido Principal</div>
      </AdminShell>
    );

    const triggerButtons = screen.getAllByRole("button", { expanded: false });
    const userTrigger = triggerButtons.find((btn) => btn.getAttribute("aria-haspopup") === "menu");
    if (userTrigger) {
      fireEvent.click(userTrigger);
      const logoutButton = screen.getAllByRole("button", { name: /Cerrar Sesión/i })[0];
      fireEvent.click(logoutButton);

      expect(screen.getByText("Cerrar Sesión En Mocter")).toBeDefined();
      expect(screen.getByText("Finalización De Sesión Segura")).toBeDefined();

      const confirmButton = screen.getByRole("button", { name: "Cerrar Sesión Definitivamente" });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
        expect(handleLogoutRedirect).toHaveBeenCalled();
      });
    }
  });
});

