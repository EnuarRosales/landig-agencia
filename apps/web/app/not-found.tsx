import Link from "next/link";

/**
 * Página 404 (Recurso no encontrado) para el nivel raíz de la aplicación.
 */
export default function GlobalNotFound() {
  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center font-sans text-foreground">
        <main role="alert" className="max-w-md">
          <span className="font-mono text-6xl font-extrabold text-blue-600">404</span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Página no encontrada
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            La dirección solicitada no existe o no se encuentra disponible.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Volver al inicio
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
