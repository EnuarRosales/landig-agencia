import { describe, it, expect, afterEach, vi } from "vitest";
import * as crypto from "node:crypto";
import {
  SecretCryptoService,
  SecretCryptoError,
  encryptSecret,
  decryptSecret,
  extractSecretLast4,
} from "./secret-crypto.service";

const VALID_HEX_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_HEX_KEY =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("SecretCryptoService (AES-256-GCM)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cifra y descifra correctamente con llave hexadecimal de 32 bytes produciendo formato v1:<iv>:<tag>:<cipher>", () => {
    const service = new SecretCryptoService({
      masterKey: VALID_HEX_KEY,
      keyId: "key-v1",
    });

    const plain = "sk-proj-test-secret-key-9876543210";
    const encrypted = service.encrypt(plain);

    expect(encrypted.keyId).toBe("key-v1");
    expect(encrypted.last4).toBe("3210");
    expect(encrypted.ciphertext).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(encrypted.ciphertext).not.toContain(plain);

    const decrypted = service.decrypt(encrypted.ciphertext);
    expect(decrypted).toBe(plain);
  });

  it("genera IV aleatorio distinto en cada operación de cifrado aunque el texto sea idéntico", () => {
    const a = encryptSecret("sk-same-secret-value", { masterKey: VALID_HEX_KEY });
    const b = encryptSecret("sk-same-secret-value", { masterKey: VALID_HEX_KEY });

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptSecret(a.ciphertext, { masterKey: VALID_HEX_KEY })).toBe(
      "sk-same-secret-value",
    );
    expect(decryptSecret(b.ciphertext, { masterKey: VALID_HEX_KEY })).toBe(
      "sk-same-secret-value",
    );
  });

  it("soporta llaves maestras de 32 bytes codificadas en base64", () => {
    const base64Key = crypto.randomBytes(32).toString("base64");
    const encrypted = encryptSecret("AIzaSyTestKeyBase64_1234", {
      masterKey: base64Key,
      keyId: "key-b64",
    });

    expect(encrypted.keyId).toBe("key-b64");
    expect(encrypted.last4).toBe("1234");
    expect(decryptSecret(encrypted.ciphertext, { masterKey: base64Key })).toBe(
      "AIzaSyTestKeyBase64_1234",
    );
  });

  it("falla con AI_CRYPTO_AUTH_FAILED si el ciphertext o authTag fue adulterado", () => {
    const encrypted = encryptSecret("sk-ant-api03-sensitive-key", {
      masterKey: VALID_HEX_KEY,
    });
    const parts = encrypted.ciphertext.split(":");
    const tamperedTag =
      parts[2].slice(0, -2) + (parts[2].endsWith("00") ? "ff" : "00");
    const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;

    expect(() =>
      decryptSecret(tampered, { masterKey: VALID_HEX_KEY }),
    ).toThrowError(SecretCryptoError);

    try {
      decryptSecret(tampered, { masterKey: VALID_HEX_KEY });
    } catch (error) {
      expect(error).toBeInstanceOf(SecretCryptoError);
      expect((error as SecretCryptoError).code).toBe("AI_CRYPTO_AUTH_FAILED");
    }
  });

  it("falla con AI_CRYPTO_AUTH_FAILED si se intenta descifrar con otra llave distinta", () => {
    const encrypted = encryptSecret("sk-or-v1-secret", {
      masterKey: VALID_HEX_KEY,
    });

    try {
      decryptSecret(encrypted.ciphertext, { masterKey: OTHER_HEX_KEY });
      expect.unreachable("Debió fallar la verificación GCM");
    } catch (error) {
      expect((error as SecretCryptoError).code).toBe("AI_CRYPTO_AUTH_FAILED");
    }
  });

  it("rechaza llaves ausentes, llaves de longitud incorrecta y formatos cifrados corruptos", () => {
    expect(() =>
      encryptSecret("sk-test", { masterKey: "too-short" }),
    ).toThrowError(/32 bytes/);

    expect(() =>
      decryptSecret("invalid-format", { masterKey: VALID_HEX_KEY }),
    ).toThrowError(/inválido/);

    expect(() =>
      encryptSecret("   ", { masterKey: VALID_HEX_KEY }),
    ).toThrowError(/vacío/);
  });

  it("enmascara de forma segura secretos cortos en extractSecretLast4", () => {
    expect(extractSecretLast4("abc")).toBe("****");
    expect(extractSecretLast4("abcd1234")).toBe("1234");
  });
});
