import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Middleware de Next.js para la negociación de idioma y redirección de rutas (`next-intl`).
 *
 * Funcionalidades:
 * - Redirige la raíz `/` hacia `/es` de forma predeterminada (`localePrefix: "always"`).
 * - Detecta el idioma del navegador o la cookie `NEXT_LOCALE`.
 * - Excluye archivos estáticos (iconos, robots, sitemap, manifest, sw.js, llms.txt) y rutas `/api/*`
 *   para garantizar que los endpoints REST y assets se sirvan directamente sin reescrituras de prefijo.
 */
export default createMiddleware(routing);

/**
 * Configuración del comparador de rutas (matcher) para el middleware.
 *
 * Omite deliberadamente rutas internas de Next (`_next`, `_vercel`), llamadas a la API (`api`)
 * y cualquier archivo con extensión para maximizar el rendimiento.
 */
export const config = {
  matcher: ["/((?!api|api-docs|_next|_vercel|.*\\..*).*)"],
};
