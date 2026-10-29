import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { appLogger } from "../utils/logger";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import type { User } from "../db/schemas";

/**
 * Error lanzado cuando una clave de cifrado requerida para un `keyId` no se encuentra.
 */
export class TotpKeyNotFoundError extends Error {
  constructor(public readonly keyId: string) {
    super(`Clave de cifrado TOTP no encontrada para keyId: "${keyId}".`);
    this.name = "TotpKeyNotFoundError";
  }
}

/**
 * Error lanzado cuando falla el descifrado autenticado de un secreto TOTP.
 */
export class TotpDecryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TotpDecryptionError";
  }
}

/**
 * Error lanzado cuando ocurre un fallo al cifrar un secreto TOTP.
 */
export class TotpEncryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TotpEncryptionError";
  }
}

/**
 * Servicio criptográfico para cifrado simétrico y rotación de secretos TOTP (AUTH-001 §4.1, §5.5, AUTH-D-04, T-17).
 *
 * Aplica:
 * - Algoritmo: AES-256-GCM (NIST SP 800-38D).
 * - Clave: 32 bytes (256 bits).
 * - Nonce (IV): 12 bytes criptográficamente seguros por cada operación.
 * - Tag de autenticación: 16 bytes (128 bits).
 * - AAD (Additional Authenticated Data): `${userId}:${keyId}` para evitar ataques de traslación
 *   de ciphertext entre cuentas o claves.
 * - Estructura de almacenamiento en bytea: `[nonce (12b)] + [tag (16b)] + [ciphertext]`.
 * - Resolución de claves: memoria en pruebas/local, y secretos Docker Compose `/run/secrets/totp_key_<id>` en producción.
 */
export class TotpCryptoService {
  private readonly keys = new Map<string, Buffer>();
  private activeKeyId: string | null = null;
  private readonly secretsDir: string;

  /**
   * Crea una instancia de `TotpCryptoService`.
   *
   * @param options - Opciones de configuración del servicio.
   */
  constructor(options?: { secretsDir?: string; activeKeyId?: string }) {
    this.secretsDir =
      options?.secretsDir || process.env.TOTP_SECRETS_DIR || "/run/secrets";
    if (options?.activeKeyId) {
      this.activeKeyId = options.activeKeyId;
    } else if (process.env.TOTP_ACTIVE_KEY_ID) {
      this.activeKeyId = process.env.TOTP_ACTIVE_KEY_ID;
    }
  }

  /**
   * Registra una clave en memoria para un identificador `keyId`.
   *
   * @param keyId - Identificador único de la clave (p. ej. "k1", "key-2026-v1").
   * @param key - Clave de 32 bytes en Buffer o en string (Base64 o Hex).
   */
  registerKey(keyId: string, key: Buffer | string): void {
    const keyBuffer = this.parseKey(key);
    this.keys.set(keyId, keyBuffer);
    if (!this.activeKeyId) {
      this.activeKeyId = keyId;
    }
  }

  /**
   * Establece el identificador de clave activa utilizado por defecto en nuevos cifrados.
   *
   * @param keyId - Identificador de la clave a activar.
   */
  setActiveKeyId(keyId: string): void {
    this.activeKeyId = keyId;
  }

  /**
   * Retorna el identificador de la clave activa actual o `null` si no hay ninguna fijada.
   */
  getActiveKeyId(): string | null {
    return this.activeKeyId;
  }

  /**
   * Obtiene la clave de 32 bytes asociada a un `keyId`, buscándola en memoria o en el sistema de archivos.
   *
   * @param keyId - Identificador de la clave.
   * @returns Buffer de 32 bytes con la clave criptográfica.
   * @throws {@link TotpKeyNotFoundError} si la clave no se localiza o no tiene 32 bytes.
   */
  getKey(keyId: string): Buffer {
    // 1. Memoria
    const cached = this.keys.get(keyId);
    if (cached) {
      return cached;
    }

    // 2. Sistema de archivos (/run/secrets/totp_key_<id>)
    const secretPath = path.join(this.secretsDir, `totp_key_${keyId}`);
    try {
      if (fs.existsSync(secretPath)) {
        const rawContent = fs.readFileSync(secretPath);
        const parsedKey = this.parseKey(rawContent);
        this.keys.set(keyId, parsedKey);
        return parsedKey;
      }
    } catch (err) {
      appLogger.error(`[TotpCryptoService.getKey] Error al leer archivo de secreto: ${secretPath}`, err);
    }

    throw new TotpKeyNotFoundError(keyId);
  }

  /**
   * Cifra un secreto TOTP utilizando AES-256-GCM y AAD `user_id:key_id`.
   *
   * @param plaintext - Secreto en texto plano o Buffer a cifrar.
   * @param userId - Identificador UUID del usuario ancla.
   * @param targetKeyId - Clave opcional a usar (si se omite, usa la clave activa).
   * @returns Objeto con el ciphertext binario (nonce + tag + datos) y el `keyId` utilizado.
   */
  encrypt(
    plaintext: Buffer | string,
    userId: string,
    targetKeyId?: string,
  ): { ciphertext: Buffer; keyId: string } {
    const keyId = targetKeyId || this.activeKeyId;
    if (!keyId) {
      throw new TotpEncryptionError("No hay clave de cifrado TOTP activa configurada.");
    }

    const key = this.getKey(keyId);
    const nonce = crypto.randomBytes(12); // NIST 800-38D recomendación: 96 bits / 12 bytes
    const aad = Buffer.from(`${userId}:${keyId}`, "utf-8");
    const dataBuffer = typeof plaintext === "string" ? Buffer.from(plaintext, "utf-8") : plaintext;

    try {
      const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
      const tag = cipher.getAuthTag(); // 16 bytes

      // Formato canónico: [12b nonce] + [16b tag] + [ciphertext]
      const ciphertext = Buffer.concat([nonce, tag, encrypted]);
      return { ciphertext, keyId };
    } catch (error) {
      throw new TotpEncryptionError(`Error al cifrar secreto TOTP para el usuario ${userId}.`, { cause: error });
    }
  }

  /**
   * Descifra un secreto TOTP autenticado con AES-256-GCM y AAD `user_id:key_id`.
   *
   * @param ciphertext - Buffer binario con nonce, tag y datos cifrados.
   * @param userId - Identificador UUID del usuario ancla.
   * @param keyId - Identificador de la clave con la que fue cifrado el secreto.
   * @returns Buffer con el secreto en claro.
   * @throws {@link TotpDecryptionError} si la clave es incorrecta, el AAD no coincide o los datos están alterados.
   */
  decrypt(ciphertext: Buffer, userId: string, keyId: string): Buffer {
    if (ciphertext.length < 28) {
      throw new TotpDecryptionError("Ciphertext TOTP corrupto o con longitud insuficiente (< 28 bytes).");
    }

    const key = this.getKey(keyId);
    const nonce = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const encrypted = ciphertext.subarray(28);
    const aad = Buffer.from(`${userId}:${keyId}`, "utf-8");

    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted;
    } catch (error) {
      throw new TotpDecryptionError(
        `Fallo al descifrar secreto TOTP para el usuario "${userId}" con la clave "${keyId}". Datos alterados, usuario incorrecto o clave inválida.`,
        { cause: error },
      );
    }
  }

  /**
   * Re-cifra un secreto existente desde una clave previa hacia una nueva clave sin exponerlo en texto plano persistente.
   *
   * @param ciphertext - Ciphertext actual.
   * @param userId - Identificador UUID del usuario.
   * @param oldKeyId - Clave previa.
   * @param newKeyId - Nueva clave objetivo (por defecto la activa).
   */
  reencrypt(
    ciphertext: Buffer,
    userId: string,
    oldKeyId: string,
    newKeyId?: string,
  ): { ciphertext: Buffer; keyId: string } {
    const targetKeyId = newKeyId || this.activeKeyId;
    if (!targetKeyId) {
      throw new TotpEncryptionError("No hay clave de cifrado TOTP activa configurada para re-cifrado.");
    }

    if (oldKeyId === targetKeyId) {
      return { ciphertext, keyId: oldKeyId };
    }

    const decrypted = this.decrypt(ciphertext, userId, oldKeyId);
    return this.encrypt(decrypted, userId, targetKeyId);
  }

  /**
   * Ejecuta el trabajo por lotes de re-cifrado de secretos TOTP desactualizados (AUTH-001 §4.1, T-17).
   *
   * Migra atómicamente en la base de datos todos los usuarios que posean secretos cifrados con
   * una clave distinta a la clave objetivo.
   *
   * @param repository - Repositorio de identidades {@link IAuthRepository}.
   * @param options - Opciones del trabajo (clave objetivo y tamaño de lote).
   */
  async reencryptTotpSecretsJob(
    repository: IAuthRepository,
    options?: {
      targetKeyId?: string;
      batchSize?: number;
    },
  ): Promise<{
    totalProcessed: number;
    totalRotated: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    const targetKeyId = options?.targetKeyId || this.activeKeyId;
    if (!targetKeyId) {
      throw new TotpEncryptionError("No hay clave objetivo definida para el trabajo de re-cifrado.");
    }

    // Asegurar que la clave objetivo esté disponible
    this.getKey(targetKeyId);

    const batchSize = options?.batchSize || 100;
    let totalProcessed = 0;
    let totalRotated = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    appLogger.info(`[TotpCryptoService.reencryptTotpSecretsJob] Iniciando job de re-cifrado hacia clave "${targetKeyId}"`, {
      targetKeyId,
      batchSize,
    });

    let hasMore = true;
    while (hasMore) {
      const usersToMigrate = await repository.findUsersWithOutdatedTotpKey(targetKeyId, batchSize);
      if (usersToMigrate.length === 0) {
        hasMore = false;
        break;
      }

      for (const user of usersToMigrate) {
        totalProcessed++;
        try {
          const updates: {
            totpSecretCiphertext?: Buffer | null;
            totpKeyId?: string | null;
            totpPendingSecretCiphertext?: Buffer | null;
            totpPendingKeyId?: string | null;
          } = {};

          let didRotate = false;

          // 1. Re-cifrar secreto activo si existe y su clave no es la objetivo
          if (
            user.totpKeyId &&
            user.totpSecretCiphertext &&
            user.totpKeyId !== targetKeyId
          ) {
            const reencrypted = this.reencrypt(
              user.totpSecretCiphertext,
              user.id,
              user.totpKeyId,
              targetKeyId,
            );
            updates.totpSecretCiphertext = reencrypted.ciphertext;
            updates.totpKeyId = reencrypted.keyId;
            didRotate = true;
          }

          // 2. Re-cifrar secreto pendiente si existe y su clave no es la objetivo
          if (
            user.totpPendingKeyId &&
            user.totpPendingSecretCiphertext &&
            user.totpPendingKeyId !== targetKeyId
          ) {
            const reencryptedPending = this.reencrypt(
              user.totpPendingSecretCiphertext,
              user.id,
              user.totpPendingKeyId,
              targetKeyId,
            );
            updates.totpPendingSecretCiphertext = reencryptedPending.ciphertext;
            updates.totpPendingKeyId = reencryptedPending.keyId;
            didRotate = true;
          }

          if (didRotate) {
            await repository.updateUserTotpKeys(user.id, updates);
            totalRotated++;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          appLogger.error(`[TotpCryptoService.reencryptTotpSecretsJob] Error al re-cifrar usuario ${user.id}: ${msg}`, error);
          errors.push({ userId: user.id, error: msg });
        }
      }

      if (usersToMigrate.length < batchSize) {
        hasMore = false;
      }
    }

    appLogger.info(`[TotpCryptoService.reencryptTotpSecretsJob] Job finalizado. Procesados: ${totalProcessed}, Rotados: ${totalRotated}, Errores: ${errors.length}`);

    return { totalProcessed, totalRotated, errors };
  }

  /**
   * Verifica si una clave previa ya puede ser retirada (ningún secreto activo o pendiente en la base la usa).
   *
   * @param repository - Repositorio de identidades.
   * @param keyId - Identificador de la clave a consultar.
   */
  async canRetireKey(
    repository: IAuthRepository,
    keyId: string,
  ): Promise<{ canRetire: boolean; count: number }> {
    const count = await repository.countUsersWithTotpKey(keyId);
    return {
      canRetire: count === 0,
      count,
    };
  }

  /**
   * Retira una clave del servicio si y solo si ningún secreto en la base depende de ella (AUTH-001 §4.1, T-17).
   *
   * @param repository - Repositorio de identidades.
   * @param keyId - Identificador de la clave a retirar.
   * @throws Error si aún existen secretos asociados a esa clave.
   */
  async retireKey(
    repository: IAuthRepository,
    keyId: string,
  ): Promise<{ success: boolean; remainingCount: number }> {
    const check = await this.canRetireKey(repository, keyId);
    if (!check.canRetire) {
      throw new Error(
        `No se puede retirar la clave "${keyId}" porque aún existen ${check.count} secreto(s) en la base de datos cifrados con ella.`,
      );
    }

    this.keys.delete(keyId);
    if (this.activeKeyId === keyId) {
      this.activeKeyId = null;
    }

    appLogger.info(`[TotpCryptoService.retireKey] Clave "${keyId}" retirada exitosamente.`);
    return { success: true, remainingCount: 0 };
  }

  /**
   * Normaliza y valida que una clave suministrada tenga exactamente 32 bytes (256 bits).
   */
  private parseKey(input: Buffer | string): Buffer {
    let rawStr: string | null = null;
    let buf: Buffer;

    if (Buffer.isBuffer(input)) {
      if (input.length === 32) {
        return input;
      }
      // Si el buffer no tiene 32 bytes directos, solo se interpreta como texto si coincide
      // con longitud de texto hex (64 bytes) o base64 (44 bytes, con o sin saltos de línea)
      const trimmedLen = input.toString("utf-8").trim().length;
      if (trimmedLen === 64 || trimmedLen === 44) {
        rawStr = input.toString("utf-8").trim();
      } else {
        throw new TotpEncryptionError(
          `Clave inválida: debe tener exactamente 32 bytes (256 bits) para AES-256-GCM. Longitud recibida: ${input.length} bytes.`,
        );
      }
    } else {
      rawStr = input.trim();
    }

    // Si es formato hexadecimal de 64 caracteres
    if (/^[0-9a-fA-F]{64}$/.test(rawStr)) {
      buf = Buffer.from(rawStr, "hex");
    } else {
      // Intentar decodificar como base64
      const fromB64 = Buffer.from(rawStr, "base64");
      if (fromB64.length === 32) {
        buf = fromB64;
      } else {
        buf = Buffer.from(rawStr, "utf-8");
      }
    }

    if (buf.length !== 32) {
      throw new TotpEncryptionError(
        `Clave inválida: debe tener exactamente 32 bytes (256 bits) para AES-256-GCM. Longitud recibida: ${buf.length} bytes.`,
      );
    }

    return buf;
  }
}

/** Instancia singleton por defecto de {@link TotpCryptoService}. */
export const defaultTotpCryptoService = new TotpCryptoService();
