import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  TotpCryptoService,
  TotpKeyNotFoundError,
  TotpDecryptionError,
  TotpEncryptionError,
} from "./totp-crypto";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import type { User } from "../db/schemas";

describe("AUTH-001 T-17 · Cifrado y Rotación de Secretos TOTP (TotpCryptoService)", () => {
  let service: TotpCryptoService;
  let tempDir: string;

  // Claves de prueba de 32 bytes
  const key1 = crypto.randomBytes(32);
  const key2 = crypto.randomBytes(32);
  const key1Base64 = key1.toString("base64");
  const key2Hex = key2.toString("hex");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mocter-totp-test-"));
    service = new TotpCryptoService({ secretsDir: tempDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar limpieza en windows si está en uso
    }
  });

  describe("Gestión de claves", () => {
    it("registra y recupera claves en Buffer, Base64 y Hex", () => {
      service.registerKey("k-raw", key1);
      service.registerKey("k-b64", key1Base64);
      service.registerKey("k-hex", key2Hex);

      expect(service.getKey("k-raw")).toEqual(key1);
      expect(service.getKey("k-b64")).toEqual(key1);
      expect(service.getKey("k-hex")).toEqual(key2);
    });

    it("fija la primera clave registrada como la clave activa por defecto", () => {
      service.registerKey("k1", key1);
      service.registerKey("k2", key2);
      expect(service.getActiveKeyId()).toBe("k1");

      service.setActiveKeyId("k2");
      expect(service.getActiveKeyId()).toBe("k2");
    });

    it("lanza TotpEncryptionError si se suministra una clave de tamaño distinto a 32 bytes", () => {
      const invalidShortKey = crypto.randomBytes(16);
      expect(() => service.registerKey("k-invalid", invalidShortKey)).toThrow(
        TotpEncryptionError,
      );
    });

    it("carga claves desde el sistema de archivos (/run/secrets/totp_key_<id>)", () => {
      const secretFile = path.join(tempDir, "totp_key_file-key");
      fs.writeFileSync(secretFile, key1Base64, "utf-8");

      const loadedKey = service.getKey("file-key");
      expect(loadedKey).toEqual(key1);
    });

    it("lanza TotpKeyNotFoundError si la clave no existe en memoria ni en disco", () => {
      expect(() => service.getKey("non-existent-key")).toThrow(
        TotpKeyNotFoundError,
      );
    });
  });

  describe("Cifrado y Descifrado AES-256-GCM con AAD user_id:key_id", () => {
    const userId = "uuid-user-1234";
    const secretPlaintext = "JBSWY3DPEHPK3PXP"; // 20 bytes en base32

    beforeEach(() => {
      service.registerKey("k1", key1);
      service.registerKey("k2", key2);
      service.setActiveKeyId("k1");
    });

    it("cifra con AES-256-GCM, generando un nonce de 12 bytes y un tag de 16 bytes", () => {
      const { ciphertext, keyId } = service.encrypt(secretPlaintext, userId);
      expect(keyId).toBe("k1");
      // Tamaño esperado: 12 bytes (nonce) + 16 bytes (tag) + 16 bytes (texto plano) = 44 bytes
      expect(ciphertext.length).toBe(12 + 16 + Buffer.from(secretPlaintext).length);
    });

    it("descifra exitosamente un secreto cifrado con la clave y el userId correctos", () => {
      const { ciphertext, keyId } = service.encrypt(secretPlaintext, userId);
      const decrypted = service.decrypt(ciphertext, userId, keyId);
      expect(decrypted.toString("utf-8")).toBe(secretPlaintext);
    });

    it("falla al descifrar si el AAD user_id no coincide (protección anti-traslación entre usuarios)", () => {
      const { ciphertext, keyId } = service.encrypt(secretPlaintext, userId);
      const wrongUserId = "uuid-another-user-9999";

      expect(() => service.decrypt(ciphertext, wrongUserId, keyId)).toThrow(
        TotpDecryptionError,
      );
    });

    it("falla al descifrar si el AAD key_id no coincide (protección anti-traslación entre claves)", () => {
      const { ciphertext } = service.encrypt(secretPlaintext, userId, "k1");

      // Intento de descifrar indicando una clave diferente
      expect(() => service.decrypt(ciphertext, userId, "k2")).toThrow(
        TotpDecryptionError,
      );
    });

    it("falla al descifrar si el ciphertext es manipulado o truncado", () => {
      const { ciphertext, keyId } = service.encrypt(secretPlaintext, userId);

      // Ciphertext truncado
      const truncated = ciphertext.subarray(0, 20);
      expect(() => service.decrypt(truncated, userId, keyId)).toThrow(
        TotpDecryptionError,
      );

      // Ciphertext con un bit alterado en el tag
      const tampered = Buffer.from(ciphertext);
      tampered[15] ^= 0xff;
      expect(() => service.decrypt(tampered, userId, keyId)).toThrow(
        TotpDecryptionError,
      );
    });

    it("lanza TotpEncryptionError si no hay clave activa configurada", () => {
      const emptyService = new TotpCryptoService({ secretsDir: tempDir });
      expect(() => emptyService.encrypt("secret", userId)).toThrow(
        TotpEncryptionError,
      );
    });
  });

  describe("Re-cifrado de secretos (reencrypt)", () => {
    const userId = "uuid-user-rotation";
    const secretPlaintext = "MFRGGZDFMY=======";

    beforeEach(() => {
      service.registerKey("k1", key1);
      service.registerKey("k2", key2);
      service.setActiveKeyId("k2");
    });

    it("re-cifra un secreto desde una clave vieja hacia la clave activa", () => {
      // Cifrado original con clave k1
      const original = service.encrypt(secretPlaintext, userId, "k1");
      expect(original.keyId).toBe("k1");

      // Re-cifrado hacia k2
      const reencrypted = service.reencrypt(original.ciphertext, userId, "k1", "k2");
      expect(reencrypted.keyId).toBe("k2");

      // El nuevo ciphertext se descifra exitosamente con k2
      const decrypted = service.decrypt(reencrypted.ciphertext, userId, "k2");
      expect(decrypted.toString("utf-8")).toBe(secretPlaintext);

      // Y ya no se descifra con k1
      expect(() => service.decrypt(reencrypted.ciphertext, userId, "k1")).toThrow(
        TotpDecryptionError,
      );
    });

    it("retorna el mismo ciphertext si la clave previa ya es la clave objetivo", () => {
      const original = service.encrypt(secretPlaintext, userId, "k2");
      const reencrypted = service.reencrypt(original.ciphertext, userId, "k2", "k2");
      expect(reencrypted.ciphertext).toEqual(original.ciphertext);
      expect(reencrypted.keyId).toBe("k2");
    });
  });

  describe("Job de re-cifrado por lotes (reencryptTotpSecretsJob)", () => {
    let mockRepo: IAuthRepository;

    beforeEach(() => {
      service.registerKey("k-old", key1);
      service.registerKey("k-new", key2);
      service.setActiveKeyId("k-new");
    });

    it("migra todos los usuarios con secretos cifrados con clave vieja hacia la nueva clave activa", async () => {
      const secretUser1 = "SECRET_USER_1";
      const secretUser2 = "SECRET_USER_2";

      const encryptedUser1 = service.encrypt(secretUser1, "u1", "k-old");
      const encryptedUser2 = service.encrypt(secretUser2, "u2", "k-old");

      const fakeUsers: User[] = [
        {
          id: "u1",
          email: "u1@empresa.com",
          totpSecretCiphertext: encryptedUser1.ciphertext,
          totpKeyId: "k-old",
          totpPendingSecretCiphertext: null,
          totpPendingKeyId: null,
        } as unknown as User,
        {
          id: "u2",
          email: "u2@empresa.com",
          totpSecretCiphertext: null,
          totpKeyId: null,
          totpPendingSecretCiphertext: encryptedUser2.ciphertext,
          totpPendingKeyId: "k-old",
        } as unknown as User,
      ];

      const updateCalls: Array<{ userId: string; updates: unknown }> = [];

      mockRepo = {
        findUsersWithOutdatedTotpKey: vi
          .fn()
          .mockResolvedValueOnce(fakeUsers)
          .mockResolvedValueOnce([]),
        countUsersWithTotpKey: vi.fn(),
        updateUserTotpKeys: vi.fn().mockImplementation((userId, updates) => {
          updateCalls.push({ userId, updates });
          return Promise.resolve();
        }),
      } as unknown as IAuthRepository;

      const result = await service.reencryptTotpSecretsJob(mockRepo, {
        targetKeyId: "k-new",
        batchSize: 10,
      });

      expect(result.totalProcessed).toBe(2);
      expect(result.totalRotated).toBe(2);
      expect(result.errors).toHaveLength(0);

      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[0].userId).toBe("u1");
      expect((updateCalls[0].updates as { totpKeyId: string }).totpKeyId).toBe("k-new");
      expect(updateCalls[1].userId).toBe("u2");
      expect((updateCalls[1].updates as { totpPendingKeyId: string }).totpPendingKeyId).toBe("k-new");

      // Verificar que el nuevo ciphertext generado en la migración es descifrable con k-new
      const updatedCiphertextU1 = (updateCalls[0].updates as { totpSecretCiphertext: Buffer })
        .totpSecretCiphertext;
      const decryptedU1 = service.decrypt(updatedCiphertextU1, "u1", "k-new");
      expect(decryptedU1.toString("utf-8")).toBe(secretUser1);
    });

    it("un secreto con key_id viejo sigue funcionando y descifrándose durante la transición", () => {
      // Antes de migrar o durante la transición
      const secret = "SECRET_TRANSITION";
      const oldEncrypted = service.encrypt(secret, "u-trans", "k-old");

      // La clave activa ya es k-new, pero el usuario todavía tiene k-old
      expect(service.getActiveKeyId()).toBe("k-new");

      // Se descifra correctamente especificando la clave vieja que tiene en base de datos
      const decrypted = service.decrypt(oldEncrypted.ciphertext, "u-trans", "k-old");
      expect(decrypted.toString("utf-8")).toBe(secret);
    });
  });

  describe("Retiro de clave vieja (retireKey)", () => {
    let mockRepo: IAuthRepository;

    beforeEach(() => {
      service.registerKey("k-old", key1);
      service.registerKey("k-new", key2);
      service.setActiveKeyId("k-new");
    });

    it("impide retirar una clave si aún existen usuarios en la base de datos cifrados con ella", async () => {
      mockRepo = {
        countUsersWithTotpKey: vi.fn().mockResolvedValue(5),
      } as unknown as IAuthRepository;

      await expect(service.retireKey(mockRepo, "k-old")).rejects.toThrow(
        /No se puede retirar la clave "k-old" porque aún existen 5 secreto\(s\)/,
      );
      expect(service.getKey("k-old")).toBeDefined();
    });

    it("retira exitosamente la clave cuando ya no queda ningún usuario que la utilice", async () => {
      mockRepo = {
        countUsersWithTotpKey: vi.fn().mockResolvedValue(0),
      } as unknown as IAuthRepository;

      const result = await service.retireKey(mockRepo, "k-old");
      expect(result.success).toBe(true);
      expect(result.remainingCount).toBe(0);

      // Ahora la clave k-old ya no está disponible
      expect(() => service.getKey("k-old")).toThrow(TotpKeyNotFoundError);
    });
  });
});
