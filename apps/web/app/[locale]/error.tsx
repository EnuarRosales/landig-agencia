'use client';

import { useEffect } from 'react';
import { clientLog } from '@/lib/logger/client';
import { serializeError } from '@/lib/logger/serialize-error';

/**
 * Límite de error de segmento para vistas del portal con locale (Regla 4.14).
 *
 * Utiliza `retry()` para reintentar la renderización del segmento e informa el digest
 * para soporte técnico sin exponer mensajes internos del servidor al usuario.
 */
export default function SegmentError({
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
    clientLog('error', 'ui.segment_boundary_error', { err: serializeError(error) });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center"
    >
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-md">
        <h2 className="text-xl font-semibold tracking-tight text-white">
          No fue posible cargar esta sección
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Ocurrió un error transitorio. Puedes reintentar cargar los datos o regresar más tarde.
        </p>
        {digest && (
          <p className="mt-4 font-mono text-xs text-gray-500">
            Referencia: {digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}
