import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Genera un token aleatorio criptográficamente seguro de longitud especificada (AUTH-001 §4.1 y §5.7).
 *
 * Utiliza {@link randomBytes} del módulo nativo de Node.js `node:crypto`.
 * Por defecto genera 32 bytes de entropía en representación hexadecimal (64 caracteres).
 *
 * @param bytes - Cantidad de bytes de entropía a generar (por defecto 32).
 * @returns Cadena hexadecimal del token en texto plano para su inclusión en enlaces o correos.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Calcula el resumen criptográfico SHA-256 de un token en claro (AUTH-001 §4.1).
 *
 * Se utiliza para persistir únicamente el hash en las tablas `email_verification_tokens`
 * o `password_reset_tokens`, garantizando que el token en claro no resida en la base de datos.
 *
 * @param token - Token en claro recibido o generado.
 * @returns Buffer binario de 32 bytes con el hash SHA-256.
 */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * Calcula el hash HMAC-SHA256 de una dirección IP utilizando el pepper del sistema (AUTH-001 §4.1 y §7.3).
 *
 * Permite auditar y correlacionar solicitudes de verificación o restablecimiento sin persistir
 * direcciones IP en texto claro.
 *
 * @param ip - Dirección IP del cliente solicitante.
 * @param pepper - Clave secreta fija de la plataforma (`AUTH_RATE_LIMIT_PEPPER`).
 * @returns Buffer binario de 32 bytes con el HMAC SHA-256.
 */
export function hashIpWithPepper(ip: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(ip).digest();
}

/**
 * Genera un identificador opaco de sesión (sid) aleatorio de 32 bytes en formato base64url (AUTH-001 §5.6).
 *
 * Se utiliza para emitir la cookie `__Host-mocter_sid`. Solo se persiste su hash SHA-256 en base de datos.
 *
 * @returns Cadena codificada en base64url con 32 bytes de entropía criptográfica.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Genera un token CSRF aleatorio de 32 bytes en formato hexadecimal (AUTH-001 §5.6).
 *
 * Se utiliza para emitir la cookie `__Host-mocter_csrf` legible por el cliente y para validar
 * mutaciones autenticadas contra `sessions.csrf_hash`.
 *
 * @returns Cadena hexadecimal de 64 caracteres (32 bytes de entropía).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}
