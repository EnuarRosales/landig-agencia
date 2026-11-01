import { describe, expect, it } from "vitest";
import { calculateRelativeLuminance, validateContrast } from "./contrast";

describe("DSN-001 §9 · Contrast & Luminance Calculations", () => {
  it("calcula luminancia relativa para blanco y negro puros", () => {
    expect(calculateRelativeLuminance("#ffffff")).toBeCloseTo(1, 2);
    expect(calculateRelativeLuminance("#000000")).toBeCloseTo(0, 2);
  });

  it("valida contraste WCAG 2.2 AA para texto normal (>= 4.5:1)", () => {
    const valid = validateContrast("#ffffff", "#0a0a0a", true);
    expect(valid.valid).toBe(true);
    expect(valid.ratio).toBeGreaterThanOrEqual(4.5);

    const invalid = validateContrast("#777777", "#ffffff", true);
    expect(invalid.valid).toBe(false);
    expect(invalid.ratio).toBeLessThan(4.5);
  });

  it("valida contraste para elementos de interfaz (>= 3.0:1)", () => {
    const uiValid = validateContrast("#14b8a6", "#0a0a0a", false);
    expect(uiValid.valid).toBe(true);
    expect(uiValid.ratio).toBeGreaterThanOrEqual(3.0);
  });
});

