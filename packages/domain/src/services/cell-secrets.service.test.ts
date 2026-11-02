import { describe, it, expect, beforeEach } from "vitest";
import * as crypto from "node:crypto";
import {
  CellSecretsCryptoService,
  CellSecretsKeyNotFoundError,
  CellSecretsEncryptionError,
  CellSecretsDecryptionError,
  type CellSecretsBundle,
} from "./cell-secrets.service";

describe("DAT-001 T1 · CellSecretsCryptoService", () => {
  let service: CellSecretsCryptoService;
  const keyId = "k1";
  const key = crypto.randomBytes(32);

  beforeEach(() => {
    service = new CellSecretsCryptoService({ activeKeyId: keyId });
    service.registerKey(keyId, key);
  });

  describe("Generación del paquete de secretos", () => {
    it("genera un bundle con cuatro secretos criptográficos de 32 bytes cada uno", () => {
      const bundle = service.generateSecretsBundle();

      expect(bundle).toHaveProperty("mocter_app_password");
      expect(bundle).toHaveProperty("mocter_migrator_password");
      expect(bundle).toHaveProperty("mocter_healthcheck_password");
      expect(bundle).toHaveProperty("handshake_secret");

      for (const value of Object.values(bundle)) {
        expect(value).toBeTypeOf("string");
        expect(Buffer.from(value, "hex").length).toBe(32);
      }
    });

    it("cada generación produce secretos distintos", () => {
      const a = service.generateSecretsBundle();
      const b = service.generateSecretsBundle();

      expect(a.mocter_app_password).not.toBe(b.mocter_app_password);
      expect(a.handshake_secret).not.toBe(b.handshake_secret);
    });
  });

  describe("Cifrado AES-256-GCM", () => {
    it("cifra un bundle y devuelve ciphertext + key_id", () => {
      const bundle = service.generateSecretsBundle();
      const result = service.encryptBundle(bundle, "cell-001");

      expect(result.ciphertext).toBeInstanceOf(Buffer);
      expect(result.ciphertext.length).toBeGreaterThan(28);
      expect(result.keyId).toBe(keyId);
    });

    it("rechaza cifrar si no hay clave activa", () => {
      const svc = new CellSecretsCryptoService();
      expect(() => svc.encryptBundle(service.generateSecretsBundle(), "cell-001")).toThrow(
        CellSecretsEncryptionError,
      );
    });

    it("rechaza cifrar si la clave activa no está registrada", () => {
      const svc = new CellSecretsCryptoService({ activeKeyId: "missing" });
      expect(() => svc.encryptBundle(service.generateSecretsBundle(), "cell-001")).toThrow(
        CellSecretsKeyNotFoundError,
      );
    });
  });

  describe("Descifrado autenticado", () => {
    it("descifra un bundle previamente cifrado y recupera los mismos secretos", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");
      const decrypted = service.decryptBundle(encrypted.ciphertext, "cell-001", encrypted.keyId);

      expect(decrypted).toEqual(bundle);
    });

    it("falla si el cell_id del AAD no coincide", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");

      expect(() => service.decryptBundle(encrypted.ciphertext, "cell-002", encrypted.keyId)).toThrow(
        CellSecretsDecryptionError,
      );
    });

    it("falla si el ciphertext fue alterado", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");
      encrypted.ciphertext[encrypted.ciphertext.length - 1] ^= 0xff;

      expect(() => service.decryptBundle(encrypted.ciphertext, "cell-001", encrypted.keyId)).toThrow(
        CellSecretsDecryptionError,
      );
    });

    it("falla si la clave no existe", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");

      expect(() => service.decryptBundle(encrypted.ciphertext, "cell-001", "otra")).toThrow(
        CellSecretsKeyNotFoundError,
      );
    });
  });

  describe("Helper de paquete completo", () => {
    it("generateAndEncrypt devuelve un CellSecretsPayload listo para persistir", () => {
      const payload = service.generateAndEncrypt("cell-001");

      expect(payload.ciphertext).toBeInstanceOf(Buffer);
      expect(payload.keyId).toBe(keyId);
      expect(payload.bundle).toHaveProperty("mocter_app_password");

      const decrypted = service.decryptBundle(payload.ciphertext, "cell-001", payload.keyId);
      expect(decrypted).toEqual(payload.bundle);
    });

    it("el DTO seguro nunca incluye secretos en claro", () => {
      const payload = service.generateAndEncrypt("cell-001");
      const safe = payload.toSafeDto();

      expect(safe).not.toHaveProperty("bundle");
      expect(safe).not.toHaveProperty("ciphertext");
      expect(safe.keyId).toBe(keyId);
      expect(safe.hasSecrets).toBe(true);
    });
  });
});
