import { describe, expect, it } from "vitest";
import { generateSecureToken, hashToken, hashIpWithPepper } from "./tokens";

describe("AUTH-001 T-08 · Generación y hashing de tokens seguros", () => {
  it("genera tokens criptográficos aleatorios con longitud esperada", () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();

    expect(token1).toBeTypeOf("string");
    expect(token1.length).toBe(64); // 32 bytes en hex = 64 caracteres
    expect(token2.length).toBe(64);
    expect(token1).not.toBe(token2);
  });

  it("calcula el hash SHA-256 binario de 32 bytes de forma determinista", () => {
    const rawToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const hash1 = hashToken(rawToken);
    const hash2 = hashToken(rawToken);

    expect(hash1).toBeInstanceOf(Buffer);
    expect(hash1.length).toBe(32);
    expect(hash1.equals(hash2)).toBe(true);
  });

  it("calcula el HMAC-SHA256 de una IP con pepper", () => {
    const ip = "192.168.1.50";
    const pepper = "super-secret-pepper-key";
    const ipHash1 = hashIpWithPepper(ip, pepper);
    const ipHash2 = hashIpWithPepper(ip, pepper);

    expect(ipHash1).toBeInstanceOf(Buffer);
    expect(ipHash1.length).toBe(32);
    expect(ipHash1.equals(ipHash2)).toBe(true);

    const differentIpHash = hashIpWithPepper("192.168.1.51", pepper);
    expect(ipHash1.equals(differentIpHash)).toBe(false);
  });
});
