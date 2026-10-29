import { describe, expect, it } from "vitest";
import {
  generateSecureToken,
  hashToken,
  hashIpWithPepper,
  generateSessionId,
  generateCsrfToken,
  compareHashesConstantTime,
} from "./tokens";

describe("AUTH-001 T-08 / T-10 · Generación y hashing de tokens seguros", () => {
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

  it("genera session ID en base64url de 32 bytes (43 o 44 caracteres) y CSRF token en hex (64 caracteres)", () => {
    const sid1 = generateSessionId();
    const sid2 = generateSessionId();
    expect(sid1).toBeTypeOf("string");
    // 32 bytes base64url sin padding tiene 43 caracteres
    expect(sid1.length).toBeGreaterThanOrEqual(42);
    expect(sid1.length).toBeLessThanOrEqual(44);
    expect(sid1).not.toBe(sid2);

    const csrf1 = generateCsrfToken();
    const csrf2 = generateCsrfToken();
    expect(csrf1).toBeTypeOf("string");
    expect(csrf1.length).toBe(64);
    expect(csrf1).not.toBe(csrf2);

    // Los hashes correspondientes deben ser de 32 bytes
    expect(hashToken(sid1).length).toBe(32);
    expect(hashToken(csrf1).length).toBe(32);
  });

  it("compara hashes binarios en tiempo constante correctamente", () => {
    const hashA = hashToken("token-a");
    const hashB = hashToken("token-a");
    const hashC = hashToken("token-b");
    const differentLength = Buffer.alloc(16);

    expect(compareHashesConstantTime(hashA, hashB)).toBe(true);
    expect(compareHashesConstantTime(hashA, hashC)).toBe(false);
    expect(compareHashesConstantTime(hashA, differentLength)).toBe(false);
  });
});
