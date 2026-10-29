import type { NextRequest } from "next/server";

/**
 * Nombre del encabezado HTTP estándar para el token CSRF (AUTH-001 §5.6).
 */
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Nombre de la cookie canónica de CSRF en entorno de producción con prefijo __Host- (AUTH-001 design §7.1).
 */
export const CSRF_COOKIE_NAME_PROD = "__Host-mocter_csrf";

/**
 * Nombre de la cookie de CSRF en entorno de desarrollo local sin prefijo __Host- (AUTH-001 design §7.1).
 */
export const CSRF_COOKIE_NAME_DEV = "mocter_csrf";

/**
 * Duración máxima absoluta de la cookie CSRF en segundos (12 horas = 43200s).
 */
export const CSRF_COOKIE_MAX_AGE = 43200;

/**
 * Resuelve el nombre de la cookie CSRF correspondiente según el entorno de ejecución.
 *
 * @param isProduction - Indica si la aplicación se ejecuta en modo producción.
 * @returns Nombre de la cookie (`__Host-mocter_csrf` o `mocter_csrf`).
 */
export function getCsrfCookieName(isProduction: boolean): string {
  return isProduction ? CSRF_COOKIE_NAME_PROD : CSRF_COOKIE_NAME_DEV;
}

/**
 * Retorna las opciones canónicas para la configuración de la cookie CSRF en respuestas HTTP.
 *
 * Debe ser legible por JavaScript en el cliente (`httpOnly: false`) para que los formularios
 * o interceptores de peticiones (`fetch`) puedan incluirla en el encabezado `X-CSRF-Token`.
 *
 * @param isProduction - Indica si la aplicación se ejecuta en modo producción.
 * @returns Objeto de opciones de cookie para NextResponse.
 */
export function getCsrfCookieOptions(isProduction: boolean) {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: CSRF_COOKIE_MAX_AGE,
  };
}

/**
 * Extrae el token CSRF provisto en el encabezado `X-CSRF-Token` de la solicitud entrante.
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @returns El token en texto claro si está presente; de lo contrario `undefined`.
 */
export function getCsrfTokenFromRequest(req: NextRequest): string | undefined {
  const token = req.headers.get(CSRF_HEADER_NAME);
  return token ? token.trim() : undefined;
}
