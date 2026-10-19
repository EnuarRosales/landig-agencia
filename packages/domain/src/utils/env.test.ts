import { describe, it, expect } from "vitest";
import { getValidatedEnv, envSchema } from "./env";

describe("Environment Validation with Zod", () => {
  it("debe validar correctamente un entorno con DATABASE_URL válida", () => {
    const config = getValidatedEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      NODE_ENV: "test",
    });

    expect(config.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/db");
    expect(config.NODE_ENV).toBe("test");
  });

  it("debe asignar development como valor por defecto de NODE_ENV", () => {
    const parsed = envSchema.parse({
      DATABASE_URL: "postgres://localhost/mydb",
    });

    expect(parsed.NODE_ENV).toBe("development");
  });

  it("debe fallar si DATABASE_URL no está presente o está vacía", () => {
    expect(() => {
      getValidatedEnv({
        DATABASE_URL: "",
      });
    }).toThrow();
  });
});
