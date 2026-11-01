import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { logger } from "@/lib/logger";

const intlMiddleware = createMiddleware(routing);

/**
 * Función canónica de proxy de Next.js 16 (Regla 4.13, sustituye middleware.ts).
 *
 * Responsabilidades:
 * - Genera o propaga `x-request-id` de forma universal.
 * - Redirecciona peticiones administrativas hacia `mocter-admin` (puerto 3003 / NEXT_PUBLIC_ADMIN_URL).
 * - Aplica la negociación y prefijado de internacionalización (`next-intl`).
 * - Emite traza estructurada con duración en milisegundos en modo debug.
 *
 * @param request - Solicitud HTTP entrante.
 * @returns Respuesta HTTP con encabezado `x-request-id` adjunto o redirección externa.
 */
export function proxy(request: NextRequest) {
  const start = performance.now();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  // Reenviar encabezado x-request-id hacia el contexto de la aplicación
  request.headers.set("x-request-id", requestId);

  // Redirección inmediata del backoffice hacia mocter-admin (puerto 3003)
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin" || pathname.startsWith("/es/admin") || pathname.startsWith("/en/admin")) {
    const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003";
    const subPath = pathname.replace(/^(\/(es|en))?\/admin/, "") || "/";
    const targetUrl = new URL(subPath, adminBase);

    logger.info({
      event: "proxy.admin_redirect",
      requestId,
      from: pathname,
      to: targetUrl.toString(),
    });

    return NextResponse.redirect(targetUrl, 307);
  }

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
  matcher: ["/((?!api|api-docs|auth|_next|_vercel|.*\\..*).*)"],
};
