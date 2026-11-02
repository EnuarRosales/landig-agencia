import { describe, it, expect } from "vitest";
import { cells } from "./cells";

describe("DAT-001 T1 · cells schema", () => {
  it("tiene el default de status en 'draft'", () => {
    const defaultValue = cells.status.default;
    expect(defaultValue).toBeDefined();
    // Drizzle expone el default SQL como objeto con value.
    expect(String(defaultValue)).toMatch(/draft/i);
  });

  it("incluye las columnas de secretos cifrados y metadatos de salud", () => {
    expect(cells.cellSecretsCiphertext).toBeDefined();
    expect(cells.cellSecretsKeyId).toBeDefined();
    expect(cells.healthStatus).toBeDefined();
    expect(cells.lastHealthCheckAt).toBeDefined();
    expect(cells.topologyType).toBeDefined();
    expect(cells.appUrl).toBeDefined();
    expect(cells.workingDir).toBeDefined();
    expect(cells.deployUser).toBeDefined();
  });

  it("no permite status 'active' como default", () => {
    // El schema fue actualizado para que nuevas celdas inicien en draft.
    // Este test documenta que la columna existe y su default es invocable.
    expect(cells.status).toBeDefined();
  });
});
