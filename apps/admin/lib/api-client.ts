/**
 * Módulo cliente centralizado para peticiones HTTP en mocter-admin (Reglas 4.12, 4.16, AUTH-001).
 *
 * Intercepta respuestas HTTP 401 (Sesión no iniciada o expirada por inactividad),
 * purga cookies de sesión obsoletas en el cliente y redirige automáticamente
 * al portal de login universal preservando la URL de retorno y el indicador `reason=expired`.
 */

export function resolveLoginBase(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_APP_URL || "https://mocter.co";
  }

  const hostname = window.location.hostname;
  const isProduction = process.env.NODE_ENV === "production";

  if (
    !isProduction &&
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172."))
  ) {
    return `${window.location.protocol}//${hostname}:3001`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");
}

/**
 * Pone a cero las cookies de sesión y redirige inmediatamente al login universal.
 *
 * @param returnToUrl - URL completa a la que el usuario debe retornar tras autenticarse.
 */
export function handleUnauthorized(returnToUrl?: string): void {
  if (typeof window === "undefined") return;

  // Limpiar cookies de sesión en el cliente
  document.cookie = "mocter_sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0;";
  document.cookie = "__Host-mocter_sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0;";

  const currentHref = returnToUrl || window.location.href;
  const loginBase = resolveLoginBase();
  const encodedReturnTo = encodeURIComponent(currentHref);
  const targetUrl = `${loginBase.replace(/\/$/, "")}/es/login?return_to=${encodedReturnTo}&reason=expired`;

  window.location.href = targetUrl;
}

/**
 * Wrapper sobre fetch nativo que intercepta errores 401 Unauthorized y ejecuta
 * la política de expiración de sesión automáticamente.
 *
 * @param input - Recurso URL o RequestInfo.
 * @param init - Opciones de la solicitud HTTP.
 * @returns Promesa con el objeto Response.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
}

