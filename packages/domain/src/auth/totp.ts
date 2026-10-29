import crypto from "node:crypto";

/**
 * Alfabeto canónico Base32 definido en RFC 4648.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Mapa inverso para decodificación rápida de caracteres Base32 en tiempo O(1).
 */
const BASE32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
}

/**
 * Codifica un Buffer binario a una cadena Base32 según RFC 4648 (sin padding '=').
 *
 * @param buffer - Buffer binario a codificar.
 * @returns Cadena codificada en Base32 en mayúsculas.
 */
export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodifica una cadena Base32 a su representación binaria Buffer según RFC 4648.
 *
 * Limpia espacios, guiones y caracteres de padding antes de procesar.
 *
 * @param encoded - Cadena Base32.
 * @returns Buffer binario decodificado.
 * @throws {Error} Si la cadena contiene caracteres inválidos para Base32.
 */
export function decodeBase32(encoded: string): Buffer {
  const sanitized = encoded.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    const val = BASE32_LOOKUP[char];
    if (val === undefined) {
      throw new Error(`Carácter Base32 inválido: "${char}"`);
    }

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Genera un secreto criptográfico aleatorio de alta entropía para TOTP (AUTH-001 §5.5, RFC 6238).
 *
 * Por defecto genera 20 bytes (160 bits), el tamaño recomendado para HMAC-SHA1.
 *
 * @param bytes - Longitud en bytes del secreto (por defecto 20).
 * @returns Objeto con el Buffer binario crudo y su representación en Base32.
 */
export function generateTotpSecret(bytes = 20): { raw: Buffer; base32: string } {
  const raw = crypto.randomBytes(bytes);
  const base32 = encodeBase32(raw);
  return { raw, base32 };
}

/**
 * Opciones para la generación de códigos TOTP.
 */
export interface GenerateTotpCodeOptions {
  /** Paso de tiempo (time step counter). Si no se proporciona, se calcula a partir de `now` y `period`. */
  step?: number;
  /** Marca de tiempo Unix en milisegundos para evaluar. Por defecto `Date.now()`. */
  now?: number;
  /** Período de validez de cada código en segundos según RFC 6238 (por defecto 30). */
  period?: number;
  /** Cantidad de dígitos del código generado (por defecto 6). */
  digits?: number;
}

/**
 * Genera un código TOTP basado en tiempo según RFC 6238 y RFC 4226 (HMAC-SHA1).
 *
 * @param secret - Secreto en formato Buffer binario o cadena Base32.
 * @param options - Opciones de generación (paso, tiempo, dígitos, período).
 * @returns Código numérico formateado con relleno de ceros a la izquierda (ej. "012345").
 */
export function generateTotpCode(
  secret: Buffer | string,
  options?: GenerateTotpCodeOptions,
): string {
  const key = typeof secret === "string" ? decodeBase32(secret) : secret;
  const period = options?.period ?? 30;
  const digits = options?.digits ?? 6;

  let step: number;
  if (options?.step !== undefined) {
    step = options.step;
  } else {
    const nowMs = options?.now ?? Date.now();
    step = Math.floor(nowMs / 1000 / period);
  }

  // Contador de 8 bytes en formato big-endian según RFC 4226 §5.1
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(step));

  // Cálculo HMAC-SHA1
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();

  // Truncamiento dinámico (Dynamic Truncation) RFC 4226 §5.3
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

/**
 * Opciones para la verificación de códigos TOTP.
 */
export interface VerifyTotpCodeOptions {
  /**
   * Ventana de tolerancia para compensar desfases de reloj (drift).
   * Un valor de 1 permite verificar [step - 1, step, step + 1] (±30 segundos). Por defecto 1.
   */
  window?: number;
  /**
   * Último paso de tiempo aceptado para el usuario (anti-replay, AUTH-001 §5.5).
   * Un código correspondiente a un paso menor o igual a este será rechazado.
   */
  lastUsedStep?: number | null;
  /** Marca de tiempo Unix en milisegundos para evaluar. Por defecto `Date.now()`. */
  now?: number;
  /** Período de validez de cada código en segundos (por defecto 30). */
  period?: number;
  /** Cantidad de dígitos esperada (por defecto 6). */
  digits?: number;
}

/**
 * Resultado de la verificación de un código TOTP.
 */
export interface VerifyTotpCodeResult {
  /** Indica si el código suministrado es válido y no fue reutilizado. */
  valid: boolean;
  /** Paso de tiempo en el que se validó el código (para persistir en `totp_last_used_step`). */
  step?: number;
}

/**
 * Verifica un código TOTP evaluando tolerancia de reloj (±1 paso) y protección contra replay (AUTH-001 §5.5).
 *
 * Utiliza comparación en tiempo constante para mitigar ataques de temporización.
 *
 * @param code - Código de 6 dígitos introducido por el usuario.
 * @param secret - Secreto en formato Buffer binario o cadena Base32.
 * @param options - Opciones de verificación (ventana, último paso usado, tiempo).
 * @returns {@link VerifyTotpCodeResult} indicando validez y paso asociado.
 */
export function verifyTotpCode(
  code: string,
  secret: Buffer | string,
  options?: VerifyTotpCodeOptions,
): VerifyTotpCodeResult {
  const digits = options?.digits ?? 6;
  const normalizedCode = code.trim();

  // Validar formato del código recibido
  if (!new RegExp(`^\\d{${digits}}$`).test(normalizedCode)) {
    return { valid: false };
  }

  const period = options?.period ?? 30;
  const window = options?.window ?? 1;
  const nowMs = options?.now ?? Date.now();
  const currentStep = Math.floor(nowMs / 1000 / period);
  const lastUsedStep = options?.lastUsedStep;

  let key: Buffer;
  try {
    key = typeof secret === "string" ? decodeBase32(secret) : secret;
  } catch {
    return { valid: false };
  }

  const codeBuffer = Buffer.from(normalizedCode, "utf-8");

  // Evaluar pasos en la ventana [currentStep - window, currentStep + window]
  for (let s = currentStep - window; s <= currentStep + window; s++) {
    // Protección anti-replay: el paso debe ser estrictamente superior al último utilizado
    if (lastUsedStep !== null && lastUsedStep !== undefined && s <= lastUsedStep) {
      continue;
    }

    const candidate = generateTotpCode(key, { step: s, digits, period });
    const candidateBuffer = Buffer.from(candidate, "utf-8");

    if (
      codeBuffer.length === candidateBuffer.length &&
      crypto.timingSafeEqual(codeBuffer, candidateBuffer)
    ) {
      return { valid: true, step: s };
    }
  }

  return { valid: false };
}

/**
 * Parámetros para la construcción de una URI `otpauth://` estandarizada (AUTH-001 §5.5, RF-03).
 */
export interface GenerateOtpauthUriParams {
  /** Correo electrónico del usuario (identificador de cuenta). */
  email: string;
  /** Secreto en formato Base32. */
  secretBase32: string;
  /** Nombre del emisor de la plataforma (por defecto "Mocter"). */
  issuer?: string;
  /** Algoritmo criptográfico utilizado (por defecto "SHA1"). */
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  /** Cantidad de dígitos generados (por defecto 6). */
  digits?: number;
  /** Período de refresco en segundos (por defecto 30). */
  period?: number;
}

/**
 * Genera una URI canónica `otpauth://totp/...` para enrolamiento en aplicaciones Authenticator (AUTH-001 §5.5).
 *
 * Formato: `otpauth://totp/Mocter:<email>?secret=...&issuer=Mocter&algorithm=SHA1&digits=6&period=30`
 *
 * @param params - Parámetros de la URI.
 * @returns URI estandarizada compatible con Google Authenticator, Microsoft Authenticator y Authy.
 */
export function generateOtpauthUri(params: GenerateOtpauthUriParams): string {
  const issuer = params.issuer ?? "Mocter";
  const algorithm = params.algorithm ?? "SHA1";
  const digits = params.digits ?? 6;
  const period = params.period ?? 30;

  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(params.email)}`;
  const searchParams = new URLSearchParams({
    secret: params.secretBase32.replace(/[\s=]/g, "").toUpperCase(),
    issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  });

  return `otpauth://totp/${label}?${searchParams.toString()}`;
}
