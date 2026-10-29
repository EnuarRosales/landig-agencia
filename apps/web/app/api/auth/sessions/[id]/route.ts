import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { env } from "@/env";
import { isValidOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Endpoint para revocar una sesión propia por su identificador público UUID (AUTH-001 §5.6, T-23).
 *
 * - **Método:** `DELETE`
 * - **Ruta:** `/api/auth/sessions/:id` (y reescrita desde `/auth/sessions/:id`)
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Verificación estricta de sesión activa (`sid`) y token CSRF (`x-csrf-token`).
 *   - Solo permite revocar sesiones pertenecientes al usuario autenticado (anti-IDOR).
 *   - Si la sesión revocada es la actual, limpia las cookies de autenticación.
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @param routeParams - Parámetros de ruta con el ID público de la sesión.
 * @returns Respuesta HTTP confirmando la revocación.
 */
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/sessions/[id]" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403 },
      );
    }

    const resolvedParams = await params;
    const targetSessionId = resolvedParams.id;

    if (!targetSessionId) {
      return NextResponse.json(
        { ok: false, error: "Identificador de sesión requerido.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;
    const csrfToken = req.headers.get("x-csrf-token") ?? undefined;

    if (!sid) {
      log.warn({ event: "auth.unauthenticated", path: "/api/auth/sessions/[id]" });
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    if (!csrfToken) {
      log.warn({ event: "auth.csrf_missing", path: "/api/auth/sessions/[id]" });
      return NextResponse.json(
        { ok: false, error: "Encabezado CSRF ausente.", code: "CSRF_MISSING" },
        { status: 403 },
      );
    }

    const sessionValidation = await authService.validateSession(sid, csrfToken);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      log.warn({ event: "auth.session_invalid", path: "/api/auth/sessions/[id]", code: sessionValidation.code });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const session = sessionValidation.data.session;
    const revokeResult = await authService.revokeSessionById(session.userId, targetSessionId);

    if (!revokeResult.ok) {
      const status = revokeResult.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json(
        { ok: false, error: revokeResult.error, code: revokeResult.code },
        { status },
      );
    }

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.session_revoked_by_user",
      userId: session.userId,
      revokedSessionId: targetSessionId,
      durationMs,
    });

    const response = NextResponse.json(
      { ok: true, message: revokeResult.data.message },
      { status: 200 },
    );

    // Si el usuario revocó su sesión actual, limpiar cookies
    if (targetSessionId === session.id) {
      const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";
      const challengeCookieName = isProduction ? "__Host-mocter_challenge" : "mocter_challenge";

      for (const name of [sidCookieName, "mocter_sid", csrfCookieName, "mocter_csrf", challengeCookieName, "mocter_challenge"]) {
        response.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
      }
    }

    return response;
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.session_revoke_unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
