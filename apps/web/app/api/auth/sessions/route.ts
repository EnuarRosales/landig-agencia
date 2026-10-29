import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para listar las sesiones activas del usuario autenticado (AUTH-001 §5.6, T-23).
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/auth/sessions` (y reescrita desde `/auth/sessions`)
 * - **Políticas aplicadas:**
 *   - Requiere sesión activa (`__Host-mocter_sid` o `mocter_sid`).
 *   - No expone hashes de sesión (`sid_hash`, `csrf_hash`), IPs ni tokens sensibles.
 *   - Marca la sesión actual con `isCurrent: true`.
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @returns Respuesta HTTP con lista de sesiones sanitizadas.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;

    if (!sid) {
      log.warn({ event: "auth.unauthenticated", path: "/api/auth/sessions" });
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const sessionValidation = await authService.validateSession(sid);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      log.warn({ event: "auth.session_invalid", path: "/api/auth/sessions", code: sessionValidation.code });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const session = sessionValidation.data.session;
    const listResult = await authService.listUserSessions(session.userId, session.id);

    if (!listResult.ok) {
      log.error({ event: "auth.list_sessions_error", userId: session.userId });
      return NextResponse.json(
        { ok: false, error: "Error interno al obtener las sesiones.", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.sessions_listed",
      userId: session.userId,
      count: listResult.data.length,
      durationMs,
    });

    return NextResponse.json(
      { ok: true, data: { sessions: listResult.data } },
      { status: 200 },
    );
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.sessions_unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
