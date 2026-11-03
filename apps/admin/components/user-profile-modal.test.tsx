/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { UserProfileModal, type CurrentUserDto } from "./user-profile-modal";

const mockUser: CurrentUserDto = {
  id: "user-owner-001-uuid",
  email: "soporte@mocter.co",
  displayName: "Alejandro Herrera",
  role: "platform_owner",
  status: "active",
};

describe("apps/admin · UserProfileModal Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("no se renderiza en el DOM cuando isOpen es false", () => {
    render(<UserProfileModal isOpen={false} onClose={vi.fn()} user={mockUser} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza el modal accesible con los datos del usuario y textos en Title Case", () => {
    render(<UserProfileModal isOpen={true} onClose={vi.fn()} user={mockUser} />);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Ficha De Perfil Del Operador")).toBeDefined();
    expect(screen.getByText("Alejandro Herrera")).toBeDefined();
    expect(screen.getAllByText("soporte@mocter.co").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("user-owner-001-uuid")).toBeDefined();
    expect(screen.getByText("platform_owner (Acceso Total)")).toBeDefined();
    expect(screen.getByText("30 Minutos (Sliding Window)")).toBeDefined();
  });

  it("permite cerrar el modal con el botón Cerrar", () => {
    const onClose = vi.fn();
    render(<UserProfileModal isOpen={true} onClose={onClose} user={mockUser} />);

    const closeButton = screen.getByRole("button", { name: "Cerrar" });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
