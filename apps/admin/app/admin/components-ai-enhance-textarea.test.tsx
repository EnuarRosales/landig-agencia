// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AiEnhanceTextarea } from "../../components/ai-enhance-textarea";

describe("AI-001 T-05 · AiEnhanceTextarea Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza label con Title Case y botón Mejorar Con AI", () => {
    render(
      <AiEnhanceTextarea
        fieldKey="bot.objective"
        label="Objetivo Del Bot"
        value="Mi borrador"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Objetivo Del Bot/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Mejorar Con AI/i })).toBeDefined();
  });

  it("deshabilita el botón si hasInferenceAccess es false", () => {
    render(
      <AiEnhanceTextarea
        fieldKey="bot.objective"
        label="Objetivo Del Bot"
        value="Mi borrador"
        onChange={vi.fn()}
        hasInferenceAccess={false}
      />,
    );

    const btn = screen.getByRole("button", { name: /Mejorar Con AI/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("muestra la sugerencia, permite aceptarla y actualiza el valor sin guardar automáticamente", async () => {
    const handleChange = vi.fn();
    const handleEnhance = vi.fn().mockResolvedValue({
      ok: true,
      suggestion: "Sugerencia mejorada de objetivo",
    });

    render(
      <AiEnhanceTextarea
        fieldKey="bot.objective"
        label="Objetivo Del Bot"
        value="vender tenis"
        onChange={handleChange}
        hasInferenceAccess={true}
        onEnhanceRequest={handleEnhance}
      />,
    );

    const btn = screen.getByRole("button", { name: /Mejorar Con AI/i });
    fireEvent.click(btn);

    const acceptBtn = await screen.findByRole("button", { name: /Aceptar Sugerencia/i });
    expect(acceptBtn).toBeDefined();

    expect(handleChange).not.toHaveBeenCalled();

    fireEvent.click(acceptBtn);
    expect(handleChange).toHaveBeenCalledWith("Sugerencia mejorada de objetivo");
  });
});
