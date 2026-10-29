import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { headers } from 'next/headers';
import type { LogContext } from './types';

/**
 * Almacén asíncrono para propagar el contexto de la petición (`requestId`, etc.)
 * a través de cadenas asíncronas concurrentes sin variables globales de módulo.
 */
export const requestContext = new AsyncLocalStorage<LogContext>();

/**
 * Obtiene el contexto de log activo del almacén asíncrono o lo recupera
 * desde las cabeceras HTTP de Next.js (`x-request-id`).
 *
 * @returns Promesa que resuelve al {@link LogContext} de la petición.
 */
export async function getLogContext(): Promise<LogContext> {
  const active = requestContext.getStore();
  if (active) {
    return active;
  }

  try {
    const headerStore = await headers();
    const requestId = headerStore.get('x-request-id') ?? crypto.randomUUID();
    return { requestId };
  } catch {
    // Si se invoca fuera de un ciclo de petición HTTP (ej. script o contexto aislado)
    return { requestId: crypto.randomUUID() };
  }
}
