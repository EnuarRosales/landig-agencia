import { NextResponse, type NextRequest } from "next/server";

/**
 * Función canónica de proxy de control de acceso para `mocter-admin` (Reglas 4.13, 4.16, AUTH-001, Feature 12).
 *
 * Intercepta todas las rutas del backoffice y exige una cookie de sesión activa (`mocter_sid` o `__Host-mocter_sid`).
 * Si no está presente o contiene solo espacios en blanco, redirige a la pantalla de login unificada de la SaaS.
 * Inyecta encabezados `x-pathname` y `x-request-id` para propagación determinística hacia Server Components downstream.
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
  const rawSid =
    request.cookies.get(sidCookieName)?.value ||
    request.cookies.get("mocter_sid")?.value;
  const sid = rawSid?.trim();

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
    const isPrivateIp =
      request.nextUrl.hostname.startsWith("192.168.") ||
      request.nextUrl.hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(request.nextUrl.hostname);

    if (!isProduction && isPrivateIp) {
      loginBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3001`;
    }

    const relativePath = request.nextUrl.pathname + request.nextUrl.search;
    const returnUrl = encodeURIComponent(relativePath || "/");
    const redirectUrl = new URL(`/es/login?return_to=${returnUrl}`, loginBase);

    return NextResponse.redirect(redirectUrl, 307);
  }

  // Inyectar encabezados de trazabilidad y ruta activa para Server Components y Layout Guards
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-mocter-pathname", pathname);
  requestHeaders.set("x-mocter-search", request.nextUrl.search);
  if (!requestHeaders.has("x-request-id")) {
    requestHeaders.set("x-request-id", crypto.randomUUID());
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!api/health|api/webhooks|_next|.*\\..*).*)"],
};
