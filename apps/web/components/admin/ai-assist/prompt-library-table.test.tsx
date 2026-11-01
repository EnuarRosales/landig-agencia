// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PromptLibraryTable, type PromptLibraryItem } from "./prompt-library-table";

describe("AI-001 T-03 · PromptLibraryTable Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockFields: PromptLibraryItem[] = [
    {
      fieldKey: "bot.objective",
      entity: "tenant_bots",
      columnName: "objective",
      labels: { es: "Objetivo Del Bot", en: "Bot Objective" },
      isActive: true,
      totalVersions: 2,
      activePrompt: {
        id: "p-1",
        version: 2,
        masterPrompt: "Eres un especialista en diseño conversacional...",
        inputHint: "Describe qué quieres que logre el bot...",
        status: "active",
      },
    },
    {
      fieldKey: "product.description",
      entity: "products",
      columnName: "description",
      labels: { es: "Descripción Del Producto", en: "Product Description" },
      isActive: false,
      totalVersions: 1,
      activePrompt: null,
    },
  ];

  it("renderiza la tabla con los campos asistidos y versiones activas", () => {
    render(<PromptLibraryTable fields={mockFields} />);

    expect(screen.getByText("Biblioteca De Prompts Maestros")).toBeDefined();
    expect(screen.getByText("bot.objective")).toBeDefined();
    expect(screen.getByText("v2")).toBeDefined();
    expect(screen.getByText("product.description")).toBeDefined();
    expect(screen.getByText("Sin activo")).toBeDefined();
  });

  it("abre el modal de detalles al presionar 'Ver Detalles'", () => {
    render(<PromptLibraryTable fields={mockFields} />);

    const detailButtons = screen.getAllByRole("button", { name: "Ver Detalles" });
    fireEvent.click(detailButtons[0]);

    expect(screen.getByText("Guía Del Inquilino")).toBeDefined();
    expect(screen.getByText("Describe qué quieres que logre el bot...")).toBeDefined();
    expect(screen.getByText(/Eres un especialista en diseño conversacional/)).toBeDefined();
  });
});
