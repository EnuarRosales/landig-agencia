// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WhiteLabelEditor } from "./white-label-editor";

describe("DSN-001 T-09, T-10 · WhiteLabelEditor Component", () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    clientId: "01930000-0000-7000-8000-000000000001",
    planMode: "completa" as const,
    t: {
      title: "Marca Blanca e Identidad Visual",
      subtitle: "Personaliza la paleta de colores",
      planBadge: "Nivel de Plan",
      noPlanWarning: "Tu plan actual no incluye personalización.",
      layer1Title: "Identidad Básica",
      brandNameLabel: "Nombre Comercial",
      logoUrlLabel: "URL del Logotipo",
      faviconUrlLabel: "URL del Favicon",
      layer2Title: "Paleta de Colores Parametrizable",
      primaryColorLabel: "Color Primario",
      primaryTextColorLabel: "Color de Texto Primario",
      accentColorLabel: "Color Secundario",
      contrastRatioLabel: "Ratio de Contraste",
      contrastPassed: "Cumple WCAG AA",
      contrastFailed: "No Cumple Contraste",
      layer3Title: "Experiencia Propia",
      customDomainLabel: "Dominio Personalizado",
      customFontLabel: "Tipografía de Marca",
      removeBrandingLabel: "Remover marca Mocter",
      previewTitle: "Vista Previa",
      previewButtonText: "Botón de Acción",
      saveButton: "Guardar Identidad",
      resetButton: "Restaurar Defaults",
      saving: "Guardando...",
      successMessage: "Actualizado con éxito.",
    },
  };

  it("muestra la advertencia de plan no disponible cuando planMode = 'none' (RF-15.2)", () => {
    render(<WhiteLabelEditor {...defaultProps} planMode="none" />);

    expect(screen.getByTestId("no-plan-warning")).toBeDefined();
    expect(screen.getByText("Tu plan actual no incluye personalización.")).toBeDefined();
  });

  it("renderiza el badge del plan y el indicador de contraste aprobado para colores base (RF-15.4)", () => {
    render(<WhiteLabelEditor {...defaultProps} />);

    expect(screen.getByTestId("plan-badge").textContent).toBe("completa");
    expect(screen.getByText("Cumple WCAG AA")).toBeDefined();
  });

  it("restaura los valores a los defaults al hacer clic en 'Restaurar Defaults' (RF-15.5)", () => {
    render(<WhiteLabelEditor {...defaultProps} />);

    const resetBtn = screen.getByText("Restaurar Defaults");
    fireEvent.click(resetBtn);

    expect(screen.getByTestId("status-message").textContent).toContain("valores por defecto");
  });
});
