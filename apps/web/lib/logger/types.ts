/**
 * Tipos base para el sistema de logging estructurado y correlación (Regla 4.13).
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Nombre de evento con semántica jerárquica: `dominio.accion` (ej. `auth.login_success`).
 */
export type LogEventName = `${string}.${string}`;

/**
 * Representación segura y serializable de un error sin exponer propiedades internas arbitrarias.
 */
export interface SerializedError {
  readonly type: string;
  readonly message: string;
  readonly stack?: string;
  readonly digest?: string;
}

/**
 * Contexto de correlación de la petición HTTP concurrente.
 */
export interface LogContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
}

/**
 * Estructura tipada mínima de un evento de log emitido a los flujos del sistema.
 */
export interface LogEvent {
  readonly event: LogEventName;
  readonly durationMs?: number;
  readonly err?: SerializedError;
  readonly [key: string]: unknown;
}
