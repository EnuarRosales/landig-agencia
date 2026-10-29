import { type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { logger } from "@/lib/logger";

const intlMiddleware = createMiddleware(routing);

/**
 * Función canónica de proxy de Next.js 16 (Regla 4.13, sustituye middleware.ts).
 *
 * Responsabilidades:
 * - Genera o propaga `x-request-id` de forma universal.
 * - Aplica la negociación y prefijado de internacionalización (`next-intl`).
 * - Emite traza estructurada con duración en milisegundos en modo debug.
 *
 * @param request - Solicitud HTTP entrante.
 * @returns Respuesta HTTP con encabezado `x-request-id` adjunto.
 */
export function proxy(request: NextRequest) {
  const start = performance.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  // Reenviar encabezado x-request-id hacia el contexto de la aplicación
  request.headers.set("x-request-id", requestId);

  const response = intlMiddleware(request);
  response.headers.set("x-request-id", requestId);

  logger.debug({
    event: "proxy.request",
    requestId,
    method: request.method,
    path: request.nextUrl.pathname,
    durationMs: Math.round(performance.now() - start),
  });

  return response;
}

export const config = {
  matcher: ["/((?!api|api-docs|_next|_vercel|.*\\..*).*)"],
};
