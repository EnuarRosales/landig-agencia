'use client';

import { useEffect } from 'react';
import { clientLog } from '@/lib/logger/client';
import { serializeError } from '@/lib/logger/serialize-error';

/**
 * Límite global de error para fallos en el layout raíz (Regla 4.14).
 *
 * En Next.js, `global-error.tsx` debe definir obligatoriamente las etiquetas `<html>` y `<body>`.
 * Utiliza `retry()` para reintentar y expone el `digest` de correlación sin filtrar detalles técnicos.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest =
    error instanceof Error && 'digest' in error && typeof error.digest === 'string'
      ? error.digest
      : undefined;

  useEffect(() => {
    clientLog('error', 'ui.global_boundary_error', { err: serializeError(error) });
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col items-center justify-center bg-[#05070f] p-4 text-white">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-bold tracking-tight">Error inesperado del sistema</h1>
          <p className="mt-2 text-sm text-gray-400">
            Ocurrió un inconveniente al cargar la plataforma. El incidente ha sido notificado para su
            resolución inmediata.
          </p>
          {digest && (
            <p className="mt-3 font-mono text-xs text-gray-500">
              Código de referencia: {digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
