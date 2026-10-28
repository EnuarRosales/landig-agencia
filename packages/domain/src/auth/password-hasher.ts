import { hash, verify } from "@node-rs/argon2";

/**
 * Identificador numérico del algoritmo Argon2id en `@node-rs/argon2`.
 */
export const ARGON2ID_ALGORITHM = 2;

/**
 * Opciones de configuración para el cómputo de hashes Argon2.
 */
export interface Argon2Options {
  /** Costo de memoria en kibibytes (KiB). */
  memoryCost?: number;
  /** Número de iteraciones en el tiempo. */
  timeCost?: number;
  /** Cantidad de hilos paralelos. */
  parallelism?: number;
  /** Longitud en bytes de la salida del hash (por defecto 32 bytes). */
  outputLen?: number;
  /** Identificador de variante de algoritmo (Argon2id = 2). */
  algorithm?: number;
}

/**
 * Parámetros criptográficos canónicos de Argon2id para Mocter (AUTH-001 T-07).
 *
 * Configuración estricta:
 * - Memoria: 64 MiB (65536 KiB)
 * - Iteraciones de tiempo: t = 3
 * - Grado de paralelismo: p = 1
 * - Longitud de salida (hash): 32 bytes
 * - Algoritmo: Argon2id (híbrido resistente a GPU y ataques de canal lateral)
 */
export const ARGON2_CONFIG: Required<Argon2Options> = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
  algorithm: ARGON2ID_ALGORITHM,
};

/**
 * Hash precomputado con los parámetros canónicos para mitigar ataques de temporización (timing attacks).
 *
 * Cuando una cuenta no existe en el flujo de inicio de sesión, se ejecuta la verificación
 * contra este hash para que la respuesta tarde un orden de tiempo idéntico al de una cuenta real.
 */
export const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$c29tZXJhbmRvbXNhbHQxNg$LvCCaD7Zf23PyCbOMb99kQ0FRwmtizHnQFjpZ9OfYFug";

/**
 * Calcula el hash Argon2id de una contraseña utilizando los parámetros canónicos del sistema.
 *
 * @param password - Contraseña en texto claro a cifrar.
 * @param customConfig - Opciones de configuración personalizadas (utilizadas principalmente en pruebas de rehash).
 * @returns Cadena con el hash modular crypt que incluye algoritmo, versión, costo, salt y hash.
 */
export async function hashPassword(
  password: string,
  customConfig?: Argon2Options,
): Promise<string> {
  return await hash(password, {
    ...ARGON2_CONFIG,
    ...customConfig,
  });
}

/**
 * Verifica si una contraseña candidata coincide con el hash Argon2id almacenado.
 *
 * @param password - Contraseña candidata en texto claro.
 * @param passwordHash - Hash Argon2id recuperado de la persistencia.
 * @returns `true` si la contraseña es válida; `false` si es incorrecta o el hash es inválido.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Ejecuta una verificación ficticia de tiempo constante para usuarios inexistentes.
 *
 * Absorbe la latencia de cómputo para impedir la enumeración de usuarios por discrepancia de tiempos.
 *
 * @param candidate - Contraseña enviada en el intento.
 * @returns Siempre `false`.
 */
export async function verifyDummyPassword(candidate: string = "dummy"): Promise<boolean> {
  return await verifyPassword(candidate, DUMMY_ARGON2_HASH);
}

/**
 * Evalúa si un hash almacenado requiere ser recalculado (rehash) debido a que
 * fue generado con parámetros criptográficos inferiores a los canónicos actuales (AUTH-001 T-07).
 *
 * @param existingHash - Hash existente a evaluar.
 * @param config - Configuración canónica de referencia.
 * @returns `true` si el hash debe actualizarse al autenticar; `false` si ya cumple los parámetros.
 */
export function needsRehash(
  existingHash: string,
  config: Required<Argon2Options> = ARGON2_CONFIG,
): boolean {
  if (!existingHash.startsWith("$argon2id$")) {
    return true;
  }

  const parts = existingHash.split("$");
  if (parts.length < 6) {
    return true;
  }

  const paramsPart = parts[3];
  const params: Record<string, number> = {};
  for (const pair of paramsPart.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) {
      params[k] = parseInt(v, 10);
    }
  }

  const memory = params.m ?? 0;
  const time = params.t ?? 0;
  const parallelism = params.p ?? 0;

  if (memory < config.memoryCost || time < config.timeCost || parallelism < config.parallelism) {
    return true;
  }

  return false;
}
