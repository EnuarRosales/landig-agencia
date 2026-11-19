// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));

import { requestGuardedNavigation } from "@/lib/use-unsaved-changes-guard";
import { FormSaveBar } from "./form-save-bar";

describe("SPEC-17 AIB-04 · FormSaveBar & useUnsavedChangesGuard", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("no muestra barra flotante cuando isDirty=false y aparece al haber cambios", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();

    const { rerender } = render(
      <FormSaveBar
        isDirty={false}
        onSave={onSave}
        onDiscard={onDiscard}
        sectionName="Perfil"
      />,
    );

    expect(screen.queryByTestId("form-save-bar")).toBeNull();

    rerender(
      <FormSaveBar
        isDirty={true}
        dirtySectionsCount={2}
        onSave={onSave}
        onDiscard={onDiscard}
        sectionName="Perfil"
      />,
    );

    expect(screen.getByTestId("form-save-bar")).toBeTruthy();
    expect(screen.getByText("Tienes cambios sin guardar")).toBeTruthy();
    expect(screen.getByText("2 secciones modificadas")).toBeTruthy();

    fireEvent.click(screen.getByTestId("form-save-bar-submit"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("intercepta navegación y descarte con ConfirmationModal --dsn-* (nunca window.confirm)", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);

    render(
      <FormSaveBar
        isDirty={true}
        onSave={onSave}
        onDiscard={onDiscard}
        sectionName="Asistente"
        locale="es"
      />,
    );

    const proceed = vi.fn();
    let allowedImmediately = true;
    act(() => {
      allowedImmediately = requestGuardedNavigation("/workspace/products", proceed);
    });
    expect(allowedImmediately).toBe(false);
    expect(proceed).not.toHaveBeenCalled();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByText("Cambios sin Guardar").length).toBeGreaterThanOrEqual(1);
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Seguir Editando" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("form-save-bar-discard"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Descartar Cambios" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
