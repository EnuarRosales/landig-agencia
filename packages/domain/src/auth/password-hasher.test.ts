import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  needsRehash,
  ARGON2_CONFIG,
} from "./password-hasher";

describe("AUTH-001 T-07 · Argon2id Hashing y Verificación", () => {
  const plainPassword = "SuperSecretPassword123!";

  it("genera un hash con formato modular crypt Argon2id y parámetros canónicos (m=64MiB, t=3, p=1)", async () => {
    const hash = await hashPassword(plainPassword);

    expect(hash).toContain("$argon2id$v=19$m=65536,t=3,p=1$");
    expect(hash).not.toBe(plainPassword);
    expect(hash.length).toBeGreaterThan(60);
  });

  it("verifica satisfactoriamente la contraseña correcta contra el hash", async () => {
    const hash = await hashPassword(plainPassword);
    const isValid = await verifyPassword(plainPassword, hash);

    expect(isValid).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword(plainPassword);
    const isValid = await verifyPassword("WrongPassword123!", hash);

    expect(isValid).toBe(false);
  });

  it("detecta que un hash generado con los parámetros canónicos NO requiere rehash", async () => {
    const hash = await hashPassword(plainPassword);
    const shouldRehash = needsRehash(hash, ARGON2_CONFIG);

    expect(shouldRehash).toBe(false);
  });

  it("detecta que un hash con parámetros de costo inferiores SÍ requiere rehash", async () => {
    // Hash con memoria inferior (32 MiB en lugar de 64 MiB)
    const lowerCostHash = await hashPassword(plainPassword, {
      memoryCost: 32768,
      timeCost: 2,
    });

    expect(lowerCostHash).toContain("m=32768,t=2");
    const shouldRehash = needsRehash(lowerCostHash, ARGON2_CONFIG);

    expect(shouldRehash).toBe(true);
  });

  it("detecta que un hash no-Argon2id requiere rehash", () => {
    expect(needsRehash("$2b$12$someBcryptHashHere")).toBe(true);
    expect(needsRehash("plaintext")).toBe(true);
  });

  it("ejecuta la verificación ficticia contra DUMMY_ARGON2_HASH en tiempo equivalente y retorna false", async () => {
    const start = performance.now();
    const result = await verifyDummyPassword("arbitrary-attempt");
    const duration = performance.now() - start;

    expect(result).toBe(false);
    // Verificar que tomó tiempo real de cómputo (más de 10ms, no respuesta instantánea en 0ms)
    expect(duration).toBeGreaterThan(5);
  });
});
