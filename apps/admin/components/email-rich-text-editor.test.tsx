/**
 * @vitest-environment jsdom
 */
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailRichTextEditor } from "./email-rich-text-editor";

describe("SPEC-14 · EmailRichTextEditor (WYSIWYG + HTML + Variables + Mejorar con AI)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function Harness({
    onEnhance,
  }: {
    onEnhance?: (fieldKey: string, draft: string) => Promise<{ ok: boolean; suggestion?: string }>;
  }) {
    const [html, setHtml] = useState("<p>Hola equipo</p>");
    return (
      <div>
        <EmailRichTextEditor
          id="test-editor"
          label="Cuerpo Específico de la Plantilla"
          fieldKey="email.template_body"
          value={html}
          onChange={setHtml}
          availableVariables={["product_name", "current_stock"]}
          onEnhanceRequest={onEnhance}
        />
        <output data-testid="editor-html-value">{html}</output>
      </div>
    );
  }

  it("permite alternar a Código HTML, insertar variables y mejorar el borrador con AI previa aceptación humana", async () => {
    const onEnhance = vi.fn(async () => ({
      ok: true,
      suggestion: "<p>Hola <strong>equipo</strong>, revisa {{product_name}}.</p>",
    }));

    render(<Harness onEnhance={onEnhance} />);

    // Verificar barra WYSIWYG visible inicialmente
    expect(screen.getByRole("toolbar")).toBeDefined();
    expect(screen.getByRole("button", { name: "Negrita" })).toBeDefined();

    // Cambiar a Código HTML e insertar variable {{product_name}}
    fireEvent.click(screen.getByRole("button", { name: /Código HTML/i }));
    fireEvent.click(screen.getByRole("button", { name: "{{product_name}}" }));
    expect(screen.getByTestId("editor-html-value").textContent).toContain("{{product_name}}");

    // Solicitar mejora con AI
    fireEvent.click(screen.getByRole("button", { name: /Mejorar con AI/i }));
    await waitFor(() => {
      expect(onEnhance).toHaveBeenCalledWith(
        "email.template_body",
        expect.stringContaining("{{product_name}}"),
      );
    });

    // Verificar que no sobreescribe hasta aceptar explícitamente
    expect(screen.getByTestId("editor-html-value").textContent).not.toContain("revisa");
    fireEvent.click(screen.getByRole("button", { name: /Aceptar Sugerencia/i }));
    expect(screen.getByTestId("editor-html-value").textContent).toBe(
      "<p>Hola <strong>equipo</strong>, revisa {{product_name}}.</p>",
    );
  });
});
