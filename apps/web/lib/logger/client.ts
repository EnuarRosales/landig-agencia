import 'client-only';
import type { LogEventName, SerializedError } from './types';

type ClientLevel = 'warn' | 'error';

/**
 * Emite un evento de log desde el navegador hacia el servidor sin bloquear el hilo principal.
 *
 * Utiliza `navigator.sendBeacon` con retroceso automático a `fetch` con bandera `keepalive`.
 *
 * @param level - Nivel de severidad admitido en cliente (`warn` | `error`).
 * @param event - Nombre tipado del evento en formato `dominio.accion`.
 * @param data - Carga de datos que puede incluir un error serializado y metadatos.
 */
export function clientLog(
  level: ClientLevel,
  event: LogEventName,
  data: { err?: SerializedError } & Record<string, unknown> = {},
): void {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const body = JSON.stringify({
    level,
    event,
    path: pathname,
    ...data,
  });

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const queued = navigator.sendBeacon('/api/logs', body);
    if (queued) {
      return;
    }
  }

  void fetch('/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // El fallo en la emisión de telemetría del cliente nunca debe propagar excepciones a la UI
  });
}
