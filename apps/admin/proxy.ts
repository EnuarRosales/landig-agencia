import { NextResponse, type NextRequest } from "next/server";

/**
 * Función canónica de proxy de control de acceso para `mocter-admin` (Regla 4.13, AUTH-001).
 *
 * Intercepta todas las rutas del backoffice y exige una cookie de sesión activa (`mocter_sid`).
 * Si no está presente, redirige a la pantalla de login unificada de la SaaS.
 *
 * @param request - Solicitud HTTP entrante.
 * @returns Respuesta HTTP o redirección hacia login.
 */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rutas exentas de autenticación de usuario (diagnósticos y webhooks)
  if (
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid =
    request.cookies.get(sidCookieName)?.value ||
    request.cookies.get("mocter_sid")?.value;

  if (!sid) {
    // Si es una petición a la API de backend, responde 401 JSON para no romper peticiones AJAX con redirecciones cross-origin
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Sesión no iniciada o expirada.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protoHeader = request.headers.get("x-forwarded-proto") || (isProduction ? "https" : request.nextUrl.protocol.replace(":", ""));

    // Origen canónico de admin (basado en encabezado entrante o variable canónica de entorno)
    const adminOrigin = hostHeader
      ? `${protoHeader}://${hostHeader}`
      : (process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co");

    // Base canónica del portal de login
    let loginBase = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");
    if (
      !isProduction &&
      request.nextUrl.hostname !== "localhost" &&
      request.nextUrl.hostname !== "127.0.0.1" &&
      !request.nextUrl.hostname.endsWith(".mocter.co") &&
      request.nextUrl.hostname !== "mocter.co"
    ) {
      loginBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3001`;
    }

    const fullRequestedUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, adminOrigin);
    const returnUrl = encodeURIComponent(fullRequestedUrl.href);
    const redirectUrl = new URL(`/es/login?return_to=${returnUrl}`, loginBase);

    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/health|api/webhooks|_next|.*\\..*).*)"],
};

