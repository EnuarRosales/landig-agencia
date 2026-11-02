/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmationModal } from "./confirmation-modal";

describe("Regla 4.17 · ConfirmationModal Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("no se renderiza en el DOM cuando isOpen es false", () => {
    render(
      <ConfirmationModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Drenado De Célula De Datos"
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza el modal accesible con role dialog y textos en Title Case", () => {
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Drenado De Célula De Datos"
        subtitle="Congelación de altas y cese de nuevos inquilinos."
        variant="warning"
        details={[
          { label: "Código De Célula", value: "cell-01", mono: true },
          { label: "Inquilinos Activos", value: 5 },
        ]}
        warningTitle="Cese De Asignación En El Router Global"
        warningMessage="No recibirá más altas de inquilinos."
        confirmText="Confirmar Drenado De Célula"
        cancelText="Cancelar"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Validar título y subtítulo
    expect(screen.getByText("Drenado De Célula De Datos")).toBeDefined();
    expect(screen.getByText("Congelación de altas y cese de nuevos inquilinos.")).toBeDefined();

    // Validar detalles
    expect(screen.getByText("Código De Célula:")).toBeDefined();
    expect(screen.getByText("cell-01")).toBeDefined();
    expect(screen.getByText("Inquilinos Activos:")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();

    // Validar advertencia
    expect(screen.getByText("Cese De Asignación En El Router Global")).toBeDefined();
    expect(screen.getByText("No recibirá más altas de inquilinos.")).toBeDefined();

    // Validar botones
    expect(screen.getByRole("button", { name: "Confirmar Drenado De Célula" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDefined();
  });

  it("dispara onConfirm al hacer clic en el botón de confirmación", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Eliminación De Célula De Datos"
        confirmText="Eliminar Célula Definitivamente"
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "Eliminar Célula Definitivamente" });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("dispara onClose al hacer clic en el botón Cancelar y en el botón cerrar X", () => {
    const onClose = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Eliminación De Célula De Datos"
        cancelText="Cancelar"
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole("button", { name: "Cerrar modal" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("muestra el estado de carga y deshabilita los botones durante loading", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Eliminación De Célula De Datos"
        confirmText="Eliminar Célula Definitivamente"
        confirmLoadingText="Eliminando Célula..."
        loading={true}
      />,
    );

    const loadingBtn = screen.getByRole("button", { name: "Eliminando Célula..." });
    expect(loadingBtn).toBeDefined();
    expect(loadingBtn.hasAttribute("disabled")).toBe(true);

    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);
  });

  it("muestra el banner de error contextual en lugar de un alert", () => {
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminación De Célula De Datos"
        error="No se puede eliminar una célula con inquilinos activos vinculados."
      />,
    );

    expect(
      screen.getByText("No se puede eliminar una célula con inquilinos activos vinculados."),
    ).toBeDefined();
  });
});

