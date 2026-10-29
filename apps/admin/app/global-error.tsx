"use client";

import * as React from "react";

/**
 * Root Error Boundary for the admin application (Next.js 16).
 * Catches unhandled errors thrown inside the root layout or root page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col items-center justify-center p-6 font-sans">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Ocurrió un error inesperado</h1>
          <p className="mt-2 text-sm text-gray-600">
            No fue posible cargar el panel administrativo.
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-gray-400">
              Código de referencia: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
