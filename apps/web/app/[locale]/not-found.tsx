import Link from "next/link";

/**
 * Página 404 (Recurso no encontrado) para el segmento localizado.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div role="alert" className="max-w-md">
        <span className="font-mono text-5xl font-extrabold text-primary">404</span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Página no encontrada
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El recurso o página que estás buscando no existe o fue movido.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
