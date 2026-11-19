// @vitest-environment jsdom
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PhoneE164Input } from "./phone-e164-input";

describe("PhoneE164Input (apps/web)", () => {
  afterEach(() => {
    cleanup();
  });

  it("emite HTML SSR determinista sin depender de Intl.DisplayNames y se hidrata con la lista completa en cliente", () => {
    const ssrHtml = renderToString(
      <PhoneE164Input
        id="lead-phone"
        name="phone"
        label="Teléfono"
        locale="es"
        defaultCountryCode="CO"
        countryAriaLabel="Código de país"
      />,
    );

    // En SSR solo debe renderizar la opción determinista seleccionada sin ordenamientos ICU dependientes del host
    expect(ssrHtml).toContain('value="CO"');
    expect(ssrHtml).toContain("CO (+57)");
    expect(ssrHtml).not.toContain("Hong Kong");
    expect(ssrHtml).not.toContain("RAE de Hong Kong");

    // En cliente (tras montar) sí expone el catálogo completo de países localizados
    render(
      <PhoneE164Input
        id="lead-phone"
        name="phone"
        label="Teléfono"
        locale="es"
        defaultCountryCode="CO"
        countryAriaLabel="Código de país"
      />,
    );

    const select = screen.getByLabelText("Código de país") as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(100);
    expect(select.value).toBe("CO");
  });
});
