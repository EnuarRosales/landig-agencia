import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { appLogger } from "../utils/logger";

/**
 * Paquete de secretos criptográficos generados para una celda autónoma (DAT-001 §3.6.2).
 * Cada valor es una cadena hexadecimal de 32 bytes (64 caracteres) apta para variables de entorno.
 */
export interface CellSecretsBundle {
  mocter_app_password: string;
  mocter_migrator_password: string;
  mocter_healthcheck_password: string;
  handshake_secret: string;
}

/**
 * Payload listo para persistir en la base de datos del Router Global.
 */
export interface CellSecretsPayload {
  ciphertext: Buffer;
  keyId: string;
  bundle: CellSecretsBundle;
  toSafeDto(): { keyId: string; hasSecrets: true };
}

/**
 * Error lanzado cuando no se localiza la clave de cifrado para un `keyId`.
 */
export class CellSecretsKeyNotFoundError extends Error {
  constructor(public readonly keyId: string) {
    super(`Clave de cifrado de secretos celulares no encontrada para keyId: "${keyId}".`);
    this.name = "CellSecretsKeyNotFoundError";
  }
}

/**
 * Error lanzado cuando falla el cifrado de un paquete de secretos celulares.
 */
export class CellSecretsEncryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CellSecretsEncryptionError";
  }
}

/**
 * Error lanzado cuando falla el descifrado autenticado de secretos celulares.
 */
export class CellSecretsDecryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CellSecretsDecryptionError";
  }
}

/**
 * Servicio criptográfico para el paquete de secretos de celdas autónomas (DAT-001 §3.6.2).
 *
 * Aplica:
 * - Algoritmo: AES-256-GCM (NIST SP 800-38D).
 * - Clave: 32 bytes (256 bits) montada desde `/run/secrets/cell_secrets_key_<id>`.
 * - Nonce (IV): 12 bytes criptográficamente seguros por operación.
 * - Tag de autenticación: 16 bytes (128 bits).
 * - AAD: `cell_id:cell-secrets` para evitar traslación de ciphertext entre celdas o propósitos.
 * - Formato de almacenamiento: `[nonce (12b)] + [tag (16b)] + [ciphertext]`.
 *
 * En pruebas se permite registrar claves en memoria; en producción no hay fallback ni claves cableadas.
 */
export class CellSecretsCryptoService {
  private readonly keys = new Map<string, Buffer>();
  private activeKeyId: string | null = null;
  private activeKeyFromEnv = false;
  private readonly secretsDir: string;

  constructor(options?: { secretsDir?: string; activeKeyId?: string | null }) {
    this.secretsDir =
      options?.secretsDir || process.env.CELL_SECRETS_DIR || "/run/secrets";
    if (options && "activeKeyId" in options) {
      this.activeKeyId = options.activeKeyId ?? null;
    } else if (process.env.CELL_SECRETS_ACTIVE_KEY_ID) {
      this.activeKeyId = process.env.CELL_SECRETS_ACTIVE_KEY_ID;
      this.activeKeyFromEnv = true;
    }
  }

  /**
   * Registra una clave en memoria para un `keyId` (uso en pruebas o inicialización controlada).
   */
  registerKey(keyId: string, key: Buffer | string): void {
    const keyBuffer = this.parseKey(key);
    this.keys.set(keyId, keyBuffer);
    if (!this.activeKeyId) {
      this.activeKeyId = keyId;
      this.activeKeyFromEnv = false;
    } else if (
      this.activeKeyFromEnv &&
      !this.keys.has(this.activeKeyId) &&
      !fs.existsSync(path.join(this.secretsDir, `cell_secrets_key_${this.activeKeyId}`))
    ) {
      this.activeKeyId = keyId;
      this.activeKeyFromEnv = false;
    }
  }

  /**
   * Fija el `keyId` activo usado por defecto en nuevos cifrados.
   */
  setActiveKeyId(keyId: string): void {
    this.activeKeyId = keyId;
    this.activeKeyFromEnv = false;
  }

  /**
   * Devuelve el `keyId` activo.
   */
  getActiveKeyId(): string | null {
    return this.activeKeyId;
  }

  /**
   * Obtiene la clave de 32 bytes para un `keyId` desde memoria o desde `/run/secrets/cell_secrets_key_<id>`.
   */
  getKey(keyId: string): Buffer {
    const cached = this.keys.get(keyId);
    if (cached) return cached;

    const secretPath = path.join(this.secretsDir, `cell_secrets_key_${keyId}`);
    try {
      if (fs.existsSync(secretPath)) {
        const rawContent = fs.readFileSync(secretPath);
        const parsedKey = this.parseKey(rawContent);
        this.keys.set(keyId, parsedKey);
        return parsedKey;
      }
    } catch (err) {
      appLogger.error(`[CellSecretsCryptoService.getKey] Error al leer archivo de secreto: ${secretPath}`, err);
    }

    // 2. Variable de entorno directa (CELL_SECRETS_KEY_<ID> o CELL_SECRETS_KEY)
    const envKeyName = `CELL_SECRETS_KEY_${keyId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const defaultKeyId = process.env.CELL_SECRETS_ACTIVE_KEY_ID || "k1";
    const envKeyValue =
      process.env[envKeyName] ||
      (keyId === defaultKeyId ? process.env.CELL_SECRETS_KEY : undefined);
    if (envKeyValue && envKeyValue.trim().length > 0) {
      const parsedKey = this.parseKey(envKeyValue.trim());
      this.keys.set(keyId, parsedKey);
      return parsedKey;
    }

    throw new CellSecretsKeyNotFoundError(keyId);
  }

  /**
   * Genera el paquete de secretos celulares con CSPRNG (≥32 bytes por valor).
   */
  generateSecretsBundle(): CellSecretsBundle {
    return {
      mocter_app_password: crypto.randomBytes(32).toString("hex"),
      mocter_migrator_password: crypto.randomBytes(32).toString("hex"),
      mocter_healthcheck_password: crypto.randomBytes(32).toString("hex"),
      handshake_secret: crypto.randomBytes(32).toString("hex"),
    };
  }

  /**
   * Cifra un bundle con AES-256-GCM y AAD `cell_id:cell-secrets`.
   */
  encryptBundle(bundle: CellSecretsBundle, cellId: string, targetKeyId?: string): { ciphertext: Buffer; keyId: string } {
    const keyId = targetKeyId || this.activeKeyId;
    if (!keyId) {
      throw new CellSecretsEncryptionError("No hay clave de cifrado de secretos celulares activa configurada.");
    }

    const key = this.getKey(keyId);
    const nonce = crypto.randomBytes(12);
    const aad = Buffer.from(`${cellId}:cell-secrets`, "utf-8");
    const plaintext = Buffer.from(JSON.stringify(bundle), "utf-8");

    try {
      const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
      return { ciphertext: Buffer.concat([nonce, tag, encrypted]), keyId };
    } catch (error) {
      throw new CellSecretsEncryptionError(`Error al cifrar secretos de celda "${cellId}".`, { cause: error });
    }
  }

  /**
   * Descifra un paquete de secretos validando AAD y tag de autenticación.
   * Admite opcionalmente un `fallbackCellId` (ej. `cell.code`) para celdas históricas cuyo AAD se vinculó al slug.
   */
  decryptBundle(
    ciphertext: Buffer,
    cellId: string,
    keyId: string,
    fallbackCellId?: string,
  ): CellSecretsBundle {
    if (ciphertext.length < 28) {
      throw new CellSecretsDecryptionError(
        "Ciphertext de secretos celulares corrupto o con longitud insuficiente (< 28 bytes).",
      );
    }

    const key = this.getKey(keyId);
    const nonce = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const encrypted = ciphertext.subarray(28);

    const tryDecrypt = (id: string): CellSecretsBundle => {
      const aad = Buffer.from(`${id}:cell-secrets`, "utf-8");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return JSON.parse(decrypted.toString("utf-8")) as CellSecretsBundle;
    };

    try {
      return tryDecrypt(cellId);
    } catch (error) {
      if (fallbackCellId && fallbackCellId !== cellId) {
        try {
          return tryDecrypt(fallbackCellId);
        } catch {
          // El fallback también falló, se reporta el error primario
        }
      }
      throw new CellSecretsDecryptionError(
        `Fallo al descifrar secretos de celda "${cellId}" con clave "${keyId}". Datos alterados, celda incorrecta o clave inválida.`,
        { cause: error },
      );
    }
  }

  /**
   * Genera y cifra un paquete de secretos en una sola operación.
   */
  generateAndEncrypt(cellId: string, targetKeyId?: string): CellSecretsPayload {
    const bundle = this.generateSecretsBundle();
    const { ciphertext, keyId } = this.encryptBundle(bundle, cellId, targetKeyId);
    return {
      ciphertext,
      keyId,
      bundle,
      toSafeDto() {
        return { keyId, hasSecrets: true as const };
      },
    };
  }

  private parseKey(input: Buffer | string): Buffer {
    let buf: Buffer;
    if (Buffer.isBuffer(input)) {
      buf = input;
    } else if (/^[0-9a-f]+$/i.test(input) && input.length === 64) {
      buf = Buffer.from(input, "hex");
    } else if (input.length === 44 && input.endsWith("=")) {
      buf = Buffer.from(input, "base64");
    } else {
      buf = Buffer.from(input, "utf-8");
    }

    if (buf.length !== 32) {
      throw new CellSecretsEncryptionError(
        `Clave inválida: debe tener exactamente 32 bytes (256 bits) para AES-256-GCM. Longitud recibida: ${buf.length} bytes.`,
      );
    }
    return buf;
  }
}

/**
 * Instancia global por defecto del servicio de secretos celulares.
 * Se inicializa con la clave activa configurada en entorno; en pruebas se usa una instancia local.
 */
export const cellSecretsCryptoService = new CellSecretsCryptoService();
