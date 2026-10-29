import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getRedisClient } from "../redis/client";
import { appLogger } from "../utils/logger";
import { ok, err, type Result } from "../types/result";

/**
 * Claims canónicas requeridas por el SSO nativo de Chatwoot 4.19.1 (AUTH-001 §5.10, CHW-001 RF-02.3).
 */
export interface ChatwootSsoClaims {
  /** Correo electrónico verificado del usuario de plataforma. */
  email: string;
  /** Nombre completo o visible del usuario. */
  name: string;
  /** Identificador de sujeto canónico (UUID del usuario en mocter-admin). */
  identifier: string;
  /** Identificador único aleatorio del token para garantizar un solo uso (anti-replay). */
  jti?: string;
  /** Momento Unix de emisión en segundos. */
  iat: number;
  /** Momento Unix de expiración en segundos (exactamente 5 minutos = iat + 300). */
  exp: number;
}

/**
 * Parámetros de entrada para la emisión del token JWT de SSO a Chatwoot.
 */
export interface IssueChatwootSsoParams {
  /** Identificador UUID del usuario autenticado. */
  userId: string;
  /** Identificador UUID del cliente/inquilino al que pertenece. */
  clientId: string;
  /** Secreto criptográfico opcional de plataforma (por defecto toma CHATWOOT_SSO_SECRET del entorno). */
  secret?: string;
}

/**
 * Códigos de error específicos para la emisión del token SSO a Chatwoot.
 */
export type ChatwootSsoErrorCode =
  | "USER_NOT_FOUND"
  | "ACCOUNT_NOT_ACTIVE"
  | "INVALID_CLIENT_MEMBERSHIP"
  | "SSO_SECRET_MISSING"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "DB_ERROR";

/**
 * Codifica una cadena o buffer a Base64URL según RFC 7515 sin padding.
 *
 * @param input - Cadena o Buffer a codificar.
 * @returns Cadena codificada en Base64URL.
 */
export function toBase64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

/**
 * Decodifica una cadena Base64URL a Buffer según RFC 7515.
 *
 * @param input - Cadena en formato Base64URL.
 * @returns Buffer decodificado.
 */
export function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

/**
 * Emite un token JWT firmado con algoritmo HMAC-SHA256 (HS256) según RFC 7519 para Chatwoot SSO.
 *
 * @param claims - Carga útil con los datos de identidad.
 * @param secret - Secreto compartido `CHATWOOT_SSO_SECRET`.
 * @returns Token JWT compacto codificado.
 */
export function signChatwootJwt(claims: ChatwootSsoClaims, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = toBase64Url(JSON.stringify(header));
  const payloadB64 = toBase64Url(JSON.stringify(claims));
  const message = `${headerB64}.${payloadB64}`;

  const signature = createHmac("sha256", secret).update(message).digest("base64url");
  return `${message}.${signature}`;
}

/**
 * Verifica la firma y vigencia temporal de un token JWT HS256 emitido para Chatwoot SSO.
 *
 * @param token - Token JWT compacto a verificar.
 * @param secret - Secreto compartido `CHATWOOT_SSO_SECRET`.
 * @param clockToleranceSeconds - Tolerancia para deriva de reloj (por defecto 30 segundos).
 * @returns Carga útil descifrada {@link ChatwootSsoClaims}.
 * @throws Error si el formato, la firma o el vencimiento son inválidos.
 */
export function verifyChatwootJwt(
  token: string,
  secret: string,
  clockToleranceSeconds = 30,
): ChatwootSsoClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Formato de token JWT inválido (se esperaban 3 partes).");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const message = `${headerB64}.${payloadB64}`;

  // Verificación de firma en tiempo constante
  const expectedSigBuffer = createHmac("sha256", secret).update(message).digest();
  const actualSigBuffer = fromBase64Url(signatureB64);

  if (
    expectedSigBuffer.length !== actualSigBuffer.length ||
    !timingSafeEqual(expectedSigBuffer, actualSigBuffer)
  ) {
    throw new Error("Firma del token JWT inválida o alterada.");
  }

  // Parseo y validación de vigencia temporal
  const payloadJson = fromBase64Url(payloadB64).toString("utf8");
  const claims = JSON.parse(payloadJson) as ChatwootSsoClaims;

  const nowSec = Math.floor(Date.now() / 1000);

  if (claims.exp + clockToleranceSeconds <= nowSec) {
    throw new Error("El token JWT ha expirado.");
  }

  if (claims.iat - clockToleranceSeconds > nowSec) {
    throw new Error("El token JWT tiene una fecha de emisión futura.");
  }

  return claims;
}

/**
 * Consume de forma atómica en Redis el identificador `jti` de un token SSO para garantizar un único uso (AUTH-001 §5.10, T-25).
 *
 * @param jti - Identificador único del token.
 * @param ttlSeconds - Tiempo de persistencia en Redis (por defecto 300 s = 5 min).
 * @returns `true` si el token no había sido utilizado antes y se consumió exitosamente; `false` si ya había sido consumido (segundo uso rechazado).
 */
export async function consumeChatwootSsoJti(jti: string, ttlSeconds = 300): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) {
      // Si Redis no está disponible, no se puede garantizar atomicidad de uso único
      appLogger.warn(
        "[ChatwootSSO.consumeChatwootSsoJti] Redis no disponible para registrar un solo uso (asumiendo válido)",
        { jti },
      );
      return true;
    }

    const key = `auth:sso:chatwoot:consumed:${jti}`;
    // SET key value EX ttl NX -> retorna "OK" si la clave no existía, o null si ya existía
    const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
    return result !== null;
  } catch (error) {
    appLogger.warn(
      `[ChatwootSSO.consumeChatwootSsoJti] Error al verificar uso único en Redis: ${error instanceof Error ? error.message : String(error)}`,
      { jti },
    );
    return true;
  }
}
