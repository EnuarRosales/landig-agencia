import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  validatePassword,
  authEmailSchema,
  authPasswordSchema,
  registerUserSchema,
} from "./validation";

describe("AUTH-001 T-06 · Normalización de correo electrónico", () => {
  it("elimina espacios exteriores y convierte a minúsculas", () => {
    expect(normalizeEmail("  Usuario@Empresa.COM  ")).toBe("usuario@empresa.com");
  });

  it("no altera sufijos de etiqueta con '+' ni puntos en la parte local", () => {
    expect(normalizeEmail("Carlos.Gomez+ventas@MiDominio.Co")).toBe(
      "carlos.gomez+ventas@midominio.co",
    );
  });

  it("valida formato RFC 5322 con authEmailSchema", () => {
    const valid = authEmailSchema.safeParse("test+dev.1@example.com");
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toBe("test+dev.1@example.com");
    }

    const invalid = authEmailSchema.safeParse("correo-sin-arroba");
    expect(invalid.success).toBe(false);
  });

  it("rechaza correos electrónicos que exceden 254 caracteres", () => {
    const longLocal = "a".repeat(245);
    const validEmail = `${longLocal}@test.com`; // 254 caracteres exactos
    expect(authEmailSchema.safeParse(validEmail).success).toBe(true);

    const tooLongEmail = `a${validEmail}`; // 255 caracteres
    expect(authEmailSchema.safeParse(tooLongEmail).success).toBe(false);
  });
});

describe("AUTH-001 T-06 · Política de complejidad de contraseñas", () => {
  it("acepta una contraseña de exactamente 7 caracteres que cumple todos los requisitos", () => {
    const result = validatePassword("Aa1!xyz");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const schemaRes = authPasswordSchema.safeParse("Aa1!xyz");
    expect(schemaRes.success).toBe(true);
  });

  it("rechaza contraseñas con longitud menor a 7 caracteres", () => {
    const result = validatePassword("Aa1!xy"); // 6 caracteres
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("La contraseña debe tener al menos 7 caracteres.");

    const schemaRes = authPasswordSchema.safeParse("Aa1!xy");
    expect(schemaRes.success).toBe(false);
  });

  it("rechaza contraseñas con longitud mayor a 128 caracteres", () => {
    const longPass = `Aa1!${"x".repeat(125)}`; // 129 caracteres
    const result = validatePassword(longPass);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("La contraseña no puede exceder 128 caracteres.");

    const schemaRes = authPasswordSchema.safeParse(longPass);
    expect(schemaRes.success).toBe(false);
  });

  it("rechaza contraseñas sin letra mayúscula", () => {
    const result = validatePassword("aa1!xyz");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("La contraseña debe incluir al menos una letra mayúscula.");

    const schemaRes = authPasswordSchema.safeParse("aa1!xyz");
    expect(schemaRes.success).toBe(false);
  });

  it("rechaza contraseñas sin número", () => {
    const result = validatePassword("Aaa!xyz");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("La contraseña debe incluir al menos un número.");

    const schemaRes = authPasswordSchema.safeParse("Aaa!xyz");
    expect(schemaRes.success).toBe(false);
  });

  it("rechaza contraseñas sin carácter especial ASCII", () => {
    const result = validatePassword("Aa12xyz");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("La contraseña debe incluir al menos un carácter especial ASCII.");

    const schemaRes = authPasswordSchema.safeParse("Aa12xyz");
    expect(schemaRes.success).toBe(false);
  });

  it("no recorta espacios en blanco en la contraseña", () => {
    // Si se aplicara trim() tendría 5 chars y fallaría, pero con espacios tiene 7
    const passWithSpaces = " Aa1!x ";
    expect(passWithSpaces.length).toBe(7);
    const result = validatePassword(passWithSpaces);
    expect(result.valid).toBe(true);
  });
});

describe("AUTH-001 T-06 · Esquema integral de registro", () => {
  it("valida satisfactoriamente una carga útil completa de registro", () => {
    const payload = {
      name: "Carlos Gómez",
      email: "  CARLOS@EMPRESA.COM ",
      password: "SuperSecret123!",
      planCode: "growth",
    };

    const parsed = registerUserSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("carlos@empresa.com");
      expect(parsed.data.password).toBe("SuperSecret123!");
      expect(parsed.data.planCode).toBe("growth");
    }
  });
});
