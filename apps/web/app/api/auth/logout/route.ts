import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { env } from "@/env";
import { isValidOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Cierre de Sesión Actual (AUTH-001 §5.6, §6.4, T-23).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/logout` (y reescrita desde `/auth/logout`)
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Revoca la sesión en base de datos e invalida inmediatamente la clave en Redis.
 *   - Limpia de forma exhaustiva las cookies `__Host-mocter_sid`, `__Host-mocter_csrf` y `__Host-mocter_challenge`.
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @returns Respuesta HTTP confirmando el cierre de sesión.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/logout" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403 },
      );
    }

    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;

    if (sid) {
      await authService.revokeSession(sid, "user_logout");
    }

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.logout_success",
      durationMs,
    });

    const response = NextResponse.json(
      { ok: true, message: "Sesión cerrada exitosamente." },
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
      event: "auth.logout_unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
