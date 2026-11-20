// @vitest-environment jsdom
import React, { useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneE164Input, type PhoneE164ChangeMeta } from "./phone-e164-input";
import { GeoAddressFields, type GeoAddressFieldValues } from "./geo-address-fields";

describe("Componentes Geográficos y E.164 (SPEC-20)", () => {
  afterEach(() => {
    cleanup();
  });

  it("PhoneE164Input normaliza números locales al formato E.164 según país seleccionado y valida longitud", () => {
    const onChange = vi.fn<(val: string, meta: PhoneE164ChangeMeta) => void>();

    function Wrapper() {
      const [val, setVal] = useState("");
      return (
        <PhoneE164Input
          id="test-phone"
          label="Teléfono Principal"
          value={val}
          defaultCountryCode="CO"
          onChange={(next, meta) => {
            setVal(next);
            onChange(next, meta);
          }}
        />
      );
    }

    render(<Wrapper />);

    const nationalInput = screen.getByLabelText("Teléfono Principal") as HTMLInputElement;
    fireEvent.change(nationalInput, { target: { value: "3001234567" } });

    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("+573001234567");
    expect(lastCall?.[1].isValid).toBe(true);
    expect(lastCall?.[1].countryCode).toBe("CO");

    // Número demasiado corto inválido
    fireEvent.change(nationalInput, { target: { value: "123" } });
    const invalidCall = onChange.mock.calls.at(-1);
    expect(invalidCall?.[1].isValid).toBe(false);
  });

  it("GeoAddressFields adapta etiquetas de subdivisión, catálogo ISO 3166-2 y sublocalidad según el país", () => {
    function Wrapper() {
      const [values, setValues] = useState<Partial<GeoAddressFieldValues>>({
        countryCode: "CO",
        country: "Colombia",
        subdivisionCode: "",
        state: "",
        city: "",
        neighborhood: "",
        addressLine: "",
        addressComplement: "",
        postalCode: "",
      });
      return (
        <GeoAddressFields
          values={values}
          onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
          locale="es"
        />
      );
    }

    render(<Wrapper />);

    // Colombia -> Departamento + Barrio + Complemento
    expect(screen.getByLabelText("Departamento")).toBeDefined();
    expect(screen.getByLabelText("Barrio")).toBeDefined();
    expect(screen.getByLabelText("Complemento")).toBeDefined();
    expect(screen.getByLabelText("Código Postal")).toBeDefined();

    // Cambiar a Argentina -> Provincia + selector ISO 3166-2
    const countrySelect = screen.getByLabelText("País") as HTMLSelectElement;
    fireEvent.change(countrySelect, { target: { value: "AR" } });
    expect(screen.getByLabelText("Provincia")).toBeDefined();

    const stateSelect = screen.getByLabelText("Provincia") as HTMLSelectElement;
    expect(stateSelect.tagName).toBe("SELECT");

    // Cambiar a México -> Estado + Colonia / Barrio
    fireEvent.change(countrySelect, { target: { value: "MX" } });
    expect(screen.getByLabelText("Estado")).toBeDefined();
    expect(screen.getByLabelText("Colonia / Barrio")).toBeDefined();
  });

  it("emite HTML SSR determinista sin depender de Intl.DisplayNames y se hidrata con el catálogo completo en cliente", () => {
    const phoneSsrHtml = renderToString(
      <PhoneE164Input
        id="profile-phone"
        label="Teléfono de Contacto"
        value=""
        defaultCountryCode="CO"
        locale="es"
        onChange={() => {}}
      />,
    );

    expect(phoneSsrHtml).toContain('value="CO"');
    expect(phoneSsrHtml).toContain("CO (+57)");
    expect(phoneSsrHtml).not.toContain("Azerbaiyán");
    expect(phoneSsrHtml).not.toContain("Autoridad Nacional Palestina");

    const geoSsrHtml = renderToString(
      <GeoAddressFields
        values={{ countryCode: "CO" }}
        onChange={() => {}}
        locale="es"
      />,
    );

    expect(geoSsrHtml).toContain('value="CO"');
    expect(geoSsrHtml).not.toContain("Azerbaiyán");
    expect(geoSsrHtml).not.toContain("Autoridad Nacional Palestina");

    render(
      <>
        <PhoneE164Input
          id="profile-phone"
          label="Teléfono de Contacto"
          value=""
          defaultCountryCode="CO"
          locale="es"
          onChange={() => {}}
        />
        <GeoAddressFields
          values={{ countryCode: "CO" }}
          onChange={() => {}}
          locale="es"
        />
      </>,
    );

    const phoneCountrySelect = screen.getByLabelText("Código De País Del Teléfono") as HTMLSelectElement;
    const geoCountrySelect = screen.getByLabelText("País") as HTMLSelectElement;
    expect(phoneCountrySelect.options.length).toBeGreaterThan(100);
    expect(geoCountrySelect.options.length).toBeGreaterThan(100);
    expect(phoneCountrySelect.value).toBe("CO");
    expect(geoCountrySelect.value).toBe("CO");
  });
});
