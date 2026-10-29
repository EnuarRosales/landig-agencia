import type { SerializedError } from './types';

/**
 * Convierte un valor de tipo `unknown` en una estructura de error serializable y segura.
 *
 * Estrecha el tipo mediante comprobaciones rigurosas sin asumir que sea `Error`.
 *
 * @param value - Objeto o primitivo capturado en un bloque catch o manejador de errores.
 * @returns Estructura {@link SerializedError} con `digest` si está disponible.
 */
export function serializeError(value: unknown): SerializedError {
  if (value instanceof Error) {
    const digest =
      'digest' in value && typeof value.digest === 'string' ? value.digest : undefined;
    return {
      type: value.name,
      message: value.message,
      stack: value.stack,
      digest,
    };
  }
  return {
    type: typeof value,
    message: String(value),
  };
}
