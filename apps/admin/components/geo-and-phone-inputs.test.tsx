// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhoneE164Input, type PhoneE164ChangeMeta } from "./phone-e164-input";
import { GeoAddressFields, type GeoAddressFieldValues } from "./geo-address-fields";

describe("Componentes Geográficos y E.164 (SPEC-20)", () => {
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
});
