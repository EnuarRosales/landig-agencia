import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { env } from "@/env";
import { isValidOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Cierre Masivo de Todas las Sesiones del Usuario (AUTH-001 §5.6, §6.4, T-23).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/logout-all` (y reescrita desde `/auth/logout-all`)
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Verificación estricta de sesión activa (`sid`) y token CSRF (`x-csrf-token`).
 *   - Revoca todas las sesiones en Postgres e invalida el Set de sesiones en Redis inmediatamente.
 *   - Limpia de forma exhaustiva las cookies en el cliente.
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @returns Respuesta HTTP confirmando el cierre masivo de sesiones.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/logout-all" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403 },
      );
    }

    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;
    const csrfToken = req.headers.get("x-csrf-token") ?? undefined;

    if (!sid) {
      log.warn({ event: "auth.unauthenticated", path: "/api/auth/logout-all" });
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    if (!csrfToken) {
      log.warn({ event: "auth.csrf_missing", path: "/api/auth/logout-all" });
      return NextResponse.json(
        { ok: false, error: "Encabezado CSRF ausente.", code: "CSRF_MISSING" },
        { status: 403 },
      );
    }

    const sessionValidation = await authService.validateSession(sid, csrfToken);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      log.warn({ event: "auth.session_invalid", path: "/api/auth/logout-all", code: sessionValidation.code });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const session = sessionValidation.data.session;
    await authService.revokeUserSessions(session.userId, "user_logout_all");

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.logout_all_success",
      userId: session.userId,
      durationMs,
    });

    const response = NextResponse.json(
      { ok: true, message: "Todas las sesiones han sido cerradas exitosamente." },
      { status: 200 },
    );

    // Limpieza de todas las cookies de autenticación
    const cookieNames = [
      "__Host-mocter_sid",
      "mocter_sid",
      "__Host-mocter_csrf",
      "mocter_csrf",
      "__Host-mocter_challenge",
      "mocter_challenge",
    ];

    for (const name of cookieNames) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }

    return response;
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.logout_all_unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
