import 'server-only';
import pino, { type Logger } from 'pino';
import { REDACT_PATHS } from './redact';
import { getLogContext } from './context';
import type { LogContext } from './types';
import { env } from '@/env';

const isProd = env.NODE_ENV === 'production';

/**
 * Instancia raíz del logger estructurado de servidor basada en Pino (Regla 4.13).
 */
export const logger: Logger = pino({
  level: isProd ? 'info' : 'debug',
  base: {
    service: 'mocter-web',
    env: env.NODE_ENV,
  },
  redact: {
    paths: [...REDACT_PATHS],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
});

/**
 * Genera un logger secundario con metadatos contextuales enlazados de forma permanente.
 *
 * @param ctx - Contexto y propiedades adicionales para vincular al logger.
 * @returns Instancia hija de {@link Logger}.
 */
export function withContext(ctx: LogContext & Record<string, unknown>): Logger {
  return logger.child(ctx);
}

/**
 * Retorna un logger hijo enlazado automáticamente al `x-request-id` de la petición en curso.
 *
 * @param bindings - Parámetros contextuales adicionales (ej. `{ action: 'login' }`).
 * @returns Promesa que resuelve a la instancia hija de {@link Logger}.
 */
export async function getRequestLogger(bindings: Record<string, unknown> = {}): Promise<Logger> {
  const ctx = await getLogContext();
  return logger.child({ ...ctx, ...bindings });
}
