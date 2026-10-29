import type { ErrorCode } from './result';

/**
 * Error de dominio lanzado en capas internas (servicios, repositorios).
 */
export class AppError extends Error {
  override readonly name = 'AppError';

  /**
   * Inicializa una nueva instancia de {@link AppError}.
   *
   * @param code - Código canónico de error de la plataforma.
   * @param message - Descripción de la excepción técnica o de dominio.
   * @param expose - Determina si el mensaje es apto para ser presentado al usuario final.
   * @param options - Opciones nativas de Error para preservar la causa (`{ cause }`).
   */
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly expose: boolean = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Guarda de tipo para determinar si un valor desconocido es una instancia de {@link AppError}.
 *
 * @param e - Valor a comprobar.
 * @returns `true` si es {@link AppError}; `false` en caso contrario.
 */
export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
