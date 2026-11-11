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
 * - En cualquier nodo celular (`CELL_CODE`), apaga la landing comercial y redirige a `/login` o `/workspace`.
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

  const pathname = request.nextUrl.pathname;

  // 1. Comportamiento universal para cualquier nodo celular (CELL_CODE definido dinámicamente)
  // En un nodo celular, no existe la base de datos central (db-portal), admin.plans ni el cluster de Redis.
  // Por ende, la landing comercial, páginas institucionales y la autenticación se delegan al
  // Login Central del Plano de Control (puerto 3001 / mocter.co).
  if (process.env.CELL_CODE) {
    const isLandingOrAuthRoute =
      pathname === "/" ||
      pathname === "/es" ||
      pathname === "/en" ||
      pathname === "/es/" ||
      pathname === "/en/" ||
      pathname === "/login" ||
      pathname.startsWith("/es/login") ||
      pathname.startsWith("/en/login") ||
      pathname === "/register" ||
      pathname.startsWith("/es/register") ||
      pathname.startsWith("/en/register") ||
      pathname === "/privacidad" ||
      pathname.startsWith("/es/privacidad") ||
      pathname.startsWith("/en/privacidad") ||
      pathname === "/terminos" ||
      pathname.startsWith("/es/terminos") ||
      pathname.startsWith("/en/terminos") ||
      pathname === "/cookies" ||
      pathname.startsWith("/es/cookies") ||
      pathname.startsWith("/en/cookies");

    if (isLandingOrAuthRoute) {
      const isProduction = process.env.NODE_ENV === "production";
      const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
      const sid = request.cookies.get(sidCookieName)?.value || request.cookies.get("mocter_sid")?.value;

      if (sid) {
        const targetWorkspace = new URL("/workspace", request.nextUrl.origin);
        logger.info({
          event: "proxy.cell_authenticated_root_redirect",
          requestId,
          cellCode: process.env.CELL_CODE,
          from: pathname,
          to: targetWorkspace.toString(),
        });
        return NextResponse.redirect(targetWorkspace, 307);
      }

      let centralLoginBase = isProduction
        ? (process.env.NEXT_PUBLIC_SITE_URL || "https://mocter.co")
        : "http://localhost:3001";

      if (
        !isProduction &&
        request.nextUrl.hostname !== "localhost" &&
        request.nextUrl.hostname !== "127.0.0.1" &&
        request.nextUrl.hostname !== "0.0.0.0" &&
        !request.nextUrl.hostname.endsWith(".mocter.co") &&
        request.nextUrl.hostname !== "mocter.co"
      ) {
        centralLoginBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3001`;
      }

      const localeMatch = pathname.match(/^\/(es|en)(\/|$)/);
      const locale = localeMatch ? localeMatch[1] : "es";
      const returnUrl = encodeURIComponent(request.nextUrl.href);
      const targetLogin = new URL(`/${locale}/login?return_to=${returnUrl}`, centralLoginBase);

      logger.info({
        event: "proxy.cell_redirect_to_central_login",
        requestId,
        cellCode: process.env.CELL_CODE,
        from: pathname,
        to: targetLogin.toString(),
      });
      return NextResponse.redirect(targetLogin, 307);
    }
  }

  // 2. Redirección inmediata del backoffice hacia mocter-admin (puerto 3003) con control de sesión
  const isBackofficeRoute =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/es/admin") ||
    pathname.startsWith("/en/admin") ||
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/") ||
    pathname.startsWith("/es/workspace") ||
    pathname.startsWith("/en/workspace") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname.startsWith("/es/onboarding") ||
    pathname.startsWith("/en/onboarding");

  if (isBackofficeRoute) {
    const isProduction = process.env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = request.cookies.get(sidCookieName)?.value || request.cookies.get("mocter_sid")?.value;

    if (!sid) {
      let loginBase = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");
      if (
        !isProduction &&
        request.nextUrl.hostname !== "localhost" &&
        request.nextUrl.hostname !== "127.0.0.1" &&
        request.nextUrl.hostname !== "0.0.0.0" &&
        !request.nextUrl.hostname.endsWith(".mocter.co") &&
        request.nextUrl.hostname !== "mocter.co"
      ) {
        loginBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3001`;
      }
      const returnUrl = encodeURIComponent(request.nextUrl.href);
      const targetLogin = new URL(`/es/login?return_to=${returnUrl}`, loginBase);

      logger.warn({
        event: "proxy.backoffice_unauthorized_redirect",
        requestId,
        from: pathname,
        to: targetLogin.toString(),
      });

      return NextResponse.redirect(targetLogin, 307);
    }

    let adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || (isProduction ? "https://admin.mocter.co" : "http://localhost:3003");
    if (
      !isProduction &&
      request.nextUrl.hostname !== "localhost" &&
      request.nextUrl.hostname !== "127.0.0.1" &&
      !request.nextUrl.hostname.endsWith(".mocter.co") &&
      request.nextUrl.hostname !== "mocter.co"
    ) {
      adminBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3003`;
    }

    // Remover prefijo de idioma (/es o /en) preservando completamente /admin, /workspace o /onboarding
    const canonicalPath = pathname.replace(/^\/(es|en)/, "") || "/";
    const targetUrl = new URL(canonicalPath + request.nextUrl.search, adminBase);

    logger.info({
      event: "proxy.backoffice_redirect",
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
