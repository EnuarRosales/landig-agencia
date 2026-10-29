/**
 * Tipos base para modelar resultados funcionales y errores esperados de negocio (Regla 4.14).
 */

export type ErrorCode =
  | 'VALIDATION'
  | 'BUSINESS_RULE'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

/**
 * Representa la descripción de un fallo esperado de negocio sin exponer detalles de infraestructura.
 */
export interface AppFailure {
  readonly ok: false;
  readonly code: ErrorCode;
  /** Mensaje seguro para el usuario final. Nunca contiene detalles técnicos. */
  readonly message: string;
  /** Errores por campo, claves = nombre del campo del formulario. */
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  /** Identificador para soporte; coincide con el requestId del log. */
  readonly reference?: string;
}

/**
 * Patrón Result para retorno tipado en Server Functions y servicios de dominio.
 */
export type Result<T = void> =
  | { readonly ok: true; readonly data: T }
  | AppFailure;

/**
 * Crea un resultado exitoso tipado.
 *
 * @param data - Carga útil de salida.
 */
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

/**
 * Crea una estructura de fallo esperado tipada.
 *
 * @param code - Código canónico de error.
 * @param message - Mensaje seguro y contextualizado para el usuario.
 * @param extra - Propiedades auxiliares opcionales (`fieldErrors`, `reference`).
 */
export const fail = (
  code: ErrorCode,
  message: string,
  extra: Omit<AppFailure, 'ok' | 'code' | 'message'> = {},
): AppFailure => ({ ok: false, code, message, ...extra });
