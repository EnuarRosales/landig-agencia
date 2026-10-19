/**
 * Estructura discriminada del patrón Result para modelar operaciones que pueden triunfar o fallar.
 *
 * Evita la propagación de excepciones no controladas a través de las capas de la aplicación,
 * forzando a los consumidores a verificar la propiedad `ok` antes de acceder a `data` o gestionar el fallo.
 *
 * @typeParam T - Tipo de dato devuelto en caso de éxito.
 * @typeParam E - Tipo de error o estructura de excepción asociada (por defecto {@link Error}).
 */
export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; issues?: unknown };

/**
 * Crea una instancia de resultado exitoso que encapsula los datos producidos por la operación.
 *
 * @typeParam T - Tipo del valor entregado.
 * @param data - Datos de retorno resultantes de la ejecución.
 * @returns Un objeto {@link Result} con discriminador `ok: true`.
 *
 * @example
 * ```typescript
 * return ok(nuevoLead);
 * ```
 */
export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

/**
 * Crea una instancia de resultado fallido con mensaje de error, código y metadatos opcionales.
 *
 * @typeParam E - Tipo de error esperado.
 * @param error - Mensaje descriptivo legible sobre la causa del fallo.
 * @param code - Código único para clasificación programática (ej. `"VALIDATION_ERROR"`, `"DB_ERROR"`).
 * @param issues - Detalles adicionales o lista de problemas (ej. errores producidos por Zod).
 * @returns Un objeto {@link Result} con discriminador `ok: false`.
 *
 * @example
 * ```typescript
 * return err("El correo ya se encuentra registrado", "DUPLICATE_EMAIL");
 * ```
 */
export function err<E = Error>(error: string, code?: string, issues?: unknown): Result<never, E> {
  return { ok: false, error, code, issues };
}
