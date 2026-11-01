// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { AiAssistButton } from "./ai-assist-button";

describe("AI-001 T-05 · AiAssistButton Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("muestra advertencia si se pulsa con borrador vacío", async () => {
    render(
      <AiAssistButton
        fieldKey="bot.objective"
        draft=""
        onAccept={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /Mejorar Con AI/i });
    fireEvent.click(button);

    expect(
      screen.getByText("Escribe un borrador primero para que la AI pueda mejorarlo."),
    ).toBeDefined();
  });

  it("muestra aviso explicativo si el inquilino no tiene credenciales de inferencia (RF-04.1)", () => {
    render(
      <AiAssistButton
        fieldKey="bot.objective"
        draft="borrador con texto"
        hasCredentials={false}
        onAccept={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /Mejorar Con AI/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("abre el modal de comparación y permite editar y aceptar la sugerencia (RF-03.2)", async () => {
    const handleAccept = vi.fn();
    const handleImprove = vi.fn().mockResolvedValue({
      suggestion: "Objetivo optimizado por AI.",
      promptVersion: 1,
    });

    render(
      <AiAssistButton
        fieldKey="bot.objective"
        draft="atender rápido y vender"
        hasCredentials={true}
        onImprove={handleImprove}
        onAccept={handleAccept}
      />,
    );

    const button = screen.getByRole("button", { name: /Mejorar Con AI/i });
    await act(async () => {
      fireEvent.click(button);
    });

    // Modal abierto
    expect(screen.getByText("Revisar Sugerencia De AI")).toBeDefined();
    expect(screen.getByText("atender rápido y vender")).toBeDefined();

    // Edición interactiva de la sugerencia
    const suggestionTextarea = screen.getByLabelText(
      "Sugerencia De AI (Editable)",
    ) as HTMLTextAreaElement;
    expect(suggestionTextarea.value).toBe("Objetivo optimizado por AI.");

    fireEvent.change(suggestionTextarea, {
      target: { value: "Objetivo optimizado por AI y personalizado manualmente." },
    });

    // Aceptar sugerencia
    const acceptBtn = screen.getByRole("button", { name: "Aceptar Sugerencia" });
    fireEvent.click(acceptBtn);

    expect(handleAccept).toHaveBeenCalledWith(
      "Objetivo optimizado por AI y personalizado manualmente.",
    );
  });
});
