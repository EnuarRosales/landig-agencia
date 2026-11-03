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
      const prevActiveId = process.env.CELL_SECRETS_ACTIVE_KEY_ID;
      delete process.env.CELL_SECRETS_ACTIVE_KEY_ID;
      try {
        const svc = new CellSecretsCryptoService();
        expect(() => svc.encryptBundle(service.generateSecretsBundle(), "cell-001")).toThrow(
          CellSecretsEncryptionError,
        );
      } finally {
        if (prevActiveId !== undefined) {
          process.env.CELL_SECRETS_ACTIVE_KEY_ID = prevActiveId;
        }
      }
    });

    it("rechaza cifrar si la clave activa no está registrada", () => {
      const svc = new CellSecretsCryptoService({ activeKeyId: "missing" });
      expect(() => svc.encryptBundle(service.generateSecretsBundle(), "cell-001")).toThrow(
        CellSecretsKeyNotFoundError,
      );
    });

    it("carga la clave desde la variable de entorno CELL_SECRETS_KEY", () => {
      const prevKey = process.env.CELL_SECRETS_KEY;
      const prevActive = process.env.CELL_SECRETS_ACTIVE_KEY_ID;
      const testHexKey = crypto.randomBytes(32).toString("hex");
      process.env.CELL_SECRETS_KEY = testHexKey;
      process.env.CELL_SECRETS_ACTIVE_KEY_ID = "k_env";
      try {
        const svc = new CellSecretsCryptoService({ activeKeyId: "k_env" });
        const bundle = svc.generateSecretsBundle();
        const encrypted = svc.encryptBundle(bundle, "cell-env-test");
        const decrypted = svc.decryptBundle(encrypted.ciphertext, "cell-env-test", "k_env");
        expect(decrypted).toEqual(bundle);
      } finally {
        if (prevKey !== undefined) {
          process.env.CELL_SECRETS_KEY = prevKey;
        } else {
          delete process.env.CELL_SECRETS_KEY;
        }
        if (prevActive !== undefined) {
          process.env.CELL_SECRETS_ACTIVE_KEY_ID = prevActive;
        } else {
          delete process.env.CELL_SECRETS_ACTIVE_KEY_ID;
        }
      }
    });

    it("carga la clave específica desde CELL_SECRETS_KEY_<KEY_ID>", () => {
      const testHexKey = crypto.randomBytes(32).toString("hex");
      process.env.CELL_SECRETS_KEY_CUSTOM_ID = testHexKey;
      try {
        const svc = new CellSecretsCryptoService({ activeKeyId: "custom_id" });
        const bundle = svc.generateSecretsBundle();
        const encrypted = svc.encryptBundle(bundle, "cell-env-specific");
        const decrypted = svc.decryptBundle(encrypted.ciphertext, "cell-env-specific", "custom_id");
        expect(decrypted).toEqual(bundle);
      } finally {
        delete process.env.CELL_SECRETS_KEY_CUSTOM_ID;
      }
    });
  });

  describe("Descifrado autenticado", () => {
    it("descifra un bundle previamente cifrado y recupera los mismos secretos", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");
      const decrypted = service.decryptBundle(encrypted.ciphertext, "cell-001", encrypted.keyId);

      expect(decrypted).toEqual(bundle);
    });

    it("falla si el cell_id del AAD no coincide y no hay fallback", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");

      expect(() => service.decryptBundle(encrypted.ciphertext, "cell-002", encrypted.keyId)).toThrow(
        CellSecretsDecryptionError,
      );
    });

    it("descifra con fallbackCellId si el cellId primario no coincide", () => {
      const bundle = service.generateSecretsBundle();
      const encrypted = service.encryptBundle(bundle, "cell-001");
      const decrypted = service.decryptBundle(
        encrypted.ciphertext,
        "uuid-distinto",
        encrypted.keyId,
        "cell-001",
      );

      expect(decrypted).toEqual(bundle);
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
