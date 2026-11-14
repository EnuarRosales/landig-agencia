import * as crypto from "node:crypto";
import { env } from "../utils/env";

const ALGORITHM = "aes-256-gcm";
const CIPHER_VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const REQUIRED_KEY_BYTES = 32;

/**
 * Códigos de error emitidos por el servicio de cifrado de secretos AI.
 */
export type SecretCryptoErrorCode =
  | "AI_CRYPTO_CONFIG_MISSING"
  | "AI_CRYPTO_INVALID_KEY"
  | "AI_CRYPTO_INVALID_INPUT"
  | "AI_CRYPTO_INVALID_FORMAT"
  | "AI_CRYPTO_AUTH_FAILED";

/**
 * Error controlado del servicio criptográfico AES-256-GCM para credenciales AI.
 */
export class SecretCryptoError extends Error {
  /**
   * Crea una instancia de error criptográfico sin exponer material sensible.
   *
   * @param message - Descripción segura del fallo ocurrido.
   * @param code - Código semántico del error criptográfico.
   */
  constructor(
    message: string,
    public readonly code: SecretCryptoErrorCode,
  ) {
    super(message);
    this.name = "SecretCryptoError";
  }
}

/**
 * Opciones de configuración para operaciones criptográficas de secretos AI.
 */
export interface SecretCryptoOptions {
  /** Llave maestra de 32 bytes (hexadecimal de 64 caracteres, base64 o UTF-8 de 32 bytes). */
  masterKey?: string;
  /** Identificador lógico de versión de llave de cifrado. */
  keyId?: string;
}

/**
 * Resultado del cifrado autenticado de una credencial o secreto AI.
 */
export interface EncryptedSecretPayload {
  /** Carga útil cifrada en formato `v1:<ivHex>:<authTagHex>:<cipherHex>`. */
  ciphertext: string;
  /** Identificador de la llave maestra empleada en el cifrado. */
  keyId: string;
  /** Últimos cuatro caracteres del secreto original para enmascarado seguro en UI. */
  last4: string;
}

/**
 * Decodifica y valida que la llave maestra represente exactamente 32 bytes (256 bits).
 *
 * @param rawKey - Material de llave en hexadecimal (64 chars), base64 (32 bytes) o cadena UTF-8 de 32 bytes.
 * @returns Buffer de exactamente 32 bytes listo para AES-256-GCM.
 * @throws {SecretCryptoError} Si la llave falta o no cumple exactamente 32 bytes.
 */
function resolveKeyBuffer(rawKey?: string): Buffer {
  const candidate = (rawKey ?? env.AI_ENCRYPTION_KEY ?? "").trim();
  if (!candidate) {
    throw new SecretCryptoError(
      "No se ha configurado AI_ENCRYPTION_KEY para cifrar o descifrar credenciales AI.",
      "AI_CRYPTO_CONFIG_MISSING",
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(candidate)) {
    return Buffer.from(candidate, "hex");
  }

  // Intentar decodificación Base64 estándar si produce exactamente 32 bytes
  if (/^[A-Za-z0-9+/=]{43,44}$/.test(candidate)) {
    const decoded = Buffer.from(candidate, "base64");
    if (decoded.length === REQUIRED_KEY_BYTES) {
      return decoded;
    }
  }

  const utf8Buffer = Buffer.from(candidate, "utf8");
  if (utf8Buffer.length === REQUIRED_KEY_BYTES) {
    return utf8Buffer;
  }

  throw new SecretCryptoError(
    "AI_ENCRYPTION_KEY debe representar exactamente 32 bytes (64 caracteres hexadecimales o base64 de 32 bytes).",
    "AI_CRYPTO_INVALID_KEY",
  );
}

/**
 * Extrae de forma segura los últimos cuatro caracteres de una clave API para presentación enmascarada.
 *
 * @param secret - Secreto en texto plano.
 * @returns Últimos cuatro caracteres (o `"****"` si el secreto es más corto).
 */
export function extractSecretLast4(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length < 4) {
    return "****";
  }
  return trimmed.slice(-4);
}

/**
 * Servicio criptográfico AES-256-GCM para credenciales BYOK de inquilinos y llaves de plataforma.
 *
 * Utiliza IV aleatorio de 12 bytes por operación y genera payloads versionados con formato
 * `v1:<ivHex>:<authTagHex>:<cipherHex>`, garantizando confidencialidad e integridad autenticada.
 */
export class SecretCryptoService {
  private readonly overrideKey?: string;
  private readonly overrideKeyId?: string;

  /**
   * Inicializa el servicio criptográfico con configuración opcional sobrepuesta para pruebas o rotación.
   *
   * @param options - Llave maestra e identificador de versión opcionales (por defecto usa `env`).
   */
  constructor(options?: SecretCryptoOptions) {
    this.overrideKey = options?.masterKey;
    this.overrideKeyId = options?.keyId;
  }

  /**
   * Cifra un secreto en texto plano utilizando AES-256-GCM con IV aleatorio único.
   *
   * @param plaintext - Clave API u otro secreto sensible en texto plano.
   * @returns Carga útil cifrada, identificador de llave y últimos 4 caracteres.
   * @throws {SecretCryptoError} Si el secreto está vacío o la llave maestra es inválida/ausente.
   */
  encrypt(plaintext: string): EncryptedSecretPayload {
    if (typeof plaintext !== "string" || plaintext.trim().length === 0) {
      throw new SecretCryptoError(
        "El secreto a cifrar no puede estar vacío.",
        "AI_CRYPTO_INVALID_INPUT",
      );
    }

    const keyBuffer = resolveKeyBuffer(this.overrideKey);
    const keyId = (this.overrideKeyId ?? env.AI_ENCRYPTION_KEY_ID ?? "key-v1").trim() || "key-v1";
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: `${CIPHER_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`,
      keyId,
      last4: extractSecretLast4(plaintext),
    };
  }

  /**
   * Descifra una carga útil generada por `encrypt` verificando la etiqueta de autenticación GCM.
   *
   * @param ciphertext - Cadena cifrada en formato `v1:<ivHex>:<authTagHex>:<cipherHex>`.
   * @returns Secreto original en texto plano.
   * @throws {SecretCryptoError} Si el formato es inválido, el tag fue adulterado o la llave no coincide.
   */
  decrypt(ciphertext: string): string {
    if (typeof ciphertext !== "string" || ciphertext.trim().length === 0) {
      throw new SecretCryptoError(
        "La carga cifrada está vacía.",
        "AI_CRYPTO_INVALID_FORMAT",
      );
    }

    const parts = ciphertext.split(":");
    if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
      throw new SecretCryptoError(
        "Formato de secreto cifrado inválido o versión no soportada.",
        "AI_CRYPTO_INVALID_FORMAT",
      );
    }

    const [, ivHex, authTagHex, payloadHex] = parts;
    const isValidHex = (val: string, expectedBytes?: number) =>
      /^[0-9a-fA-F]+$/.test(val) &&
      val.length % 2 === 0 &&
      (expectedBytes === undefined || val.length === expectedBytes * 2);

    if (
      !isValidHex(ivHex, IV_BYTES) ||
      !isValidHex(authTagHex, AUTH_TAG_BYTES) ||
      !isValidHex(payloadHex) ||
      payloadHex.length === 0
    ) {
      throw new SecretCryptoError(
        "Los componentes hexadecimales del secreto cifrado son inválidos.",
        "AI_CRYPTO_INVALID_FORMAT",
      );
    }

    const keyBuffer = resolveKeyBuffer(this.overrideKey);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encryptedData = Buffer.from(payloadHex, "hex");

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      throw new SecretCryptoError(
        "Falló la verificación criptográfica de integridad o la llave de descifrado no corresponde.",
        "AI_CRYPTO_AUTH_FAILED",
      );
    }
  }
}

/**
 * Cifra un secreto en texto plano usando `SecretCryptoService` y la configuración del entorno activo.
 *
 * @param plaintext - Secreto en texto plano a proteger.
 * @param options - Opciones opcionales de llave maestra e identificador.
 * @returns Carga útil cifrada en formato `v1:<ivHex>:<authTagHex>:<cipherHex>`.
 */
export function encryptSecret(
  plaintext: string,
  options?: SecretCryptoOptions,
): EncryptedSecretPayload {
  return new SecretCryptoService(options).encrypt(plaintext);
}

/**
 * Descifra un secreto protegido en formato `v1:<ivHex>:<authTagHex>:<cipherHex>`.
 *
 * @param ciphertext - Carga útil cifrada almacenada en base de datos.
 * @param options - Opciones opcionales de llave maestra para descifrado/rotación.
 * @returns Secreto recuperado en texto plano.
 */
export function decryptSecret(
  ciphertext: string,
  options?: SecretCryptoOptions,
): string {
  return new SecretCryptoService(options).decrypt(ciphertext);
}
