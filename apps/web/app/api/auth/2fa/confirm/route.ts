import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  authRateLimiter,
  confirm2faSchema,
  RedisUnavailableError,
} from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para confirmación y activación de autenticación 2FA (AUTH-001 §5.5, §6.1, T-18).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/2fa/confirm` (y reescrita desde `/auth/2fa/confirm`)
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Verificación estricta de sesión activa (`sid`) y token CSRF (`x-csrf-token`).
 *   - Limitación de tasa distribuida en Redis (5 peticiones / 15 min por usuario).
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503.
 *   - Valida código de 6 dígitos con tolerancia de ±1 paso (30s) y anti-replay contra `totp_last_used_step`.
 *   - Promueve el secreto pendiente a activo y limpia el pendiente.
 *   - Revoca las demás sesiones activas del usuario (`mfa_enabled`).
 *   - Rota la sesión actual fijando `mfa_at = now()` y emite nuevas cookies `sid` y `csrfToken`.
 *
 * @param req - Objeto {@link NextRequest} con JSON `{ code: string }`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/2fa/confirm" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403 },
      );
    }

    // 1. Extraer cookie de sesión
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

    const sid =
      req.cookies.get(sidCookieName)?.value ||
      req.cookies.get("mocter_sid")?.value;

    if (!sid) {
      log.warn({ event: "auth.unauthenticated", path: "/api/auth/2fa/confirm" });
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 2. Extraer y validar token CSRF
    const csrfToken = req.headers.get("x-csrf-token") || undefined;
    if (!csrfToken) {
      log.warn({ event: "auth.csrf_missing", path: "/api/auth/2fa/confirm" });
      return NextResponse.json(
        { ok: false, error: "Encabezado CSRF ausente.", code: "CSRF_MISSING" },
        { status: 403 },
      );
    }

    // 3. Validar sesión y CSRF contra la base de datos
    const sessionValidation = await authService.validateSession(sid, csrfToken);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      log.warn({
        event: "auth.session_invalid",
        status,
        path: "/api/auth/2fa/confirm",
      });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const { session } = sessionValidation.data;

    // 4. Limitación de tasa distribuida en Redis (5/15 min por usuario, Fail-Closed)
    try {
      const rateLimitResult = await authRateLimiter.checkTotpConfirmRateLimit(session.userId);
      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.totp.rate_limited",
          action: "confirm",
          userId: session.userId,
          retryAfter: rateLimitResult.retryAfter,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiados intentos. Intentá de nuevo más tarde.",
            code: "RATE_LIMIT_EXCEEDED",
          },
          {
            status: 429,
            headers: { "Retry-After": rateLimitResult.retryAfter.toString() },
          },
        );
      }
    } catch (err: unknown) {
      if (
        err instanceof RedisUnavailableError ||
        (err as { name?: string })?.name === "RedisUnavailableError"
      ) {
        log.error({
          event: "auth.redis_unavailable",
          action: "totp_confirm",
          error: serializeError(err),
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Servicio de autenticación temporalmente no disponible.",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      throw err;
    }

    // 5. Parsear cuerpo de la petición con confirm2faSchema
    let bodyCode: string;
    try {
      const json = await req.json();
      const parseResult = confirm2faSchema.safeParse(json);
      if (!parseResult.success) {
        return NextResponse.json(
          {
            ok: false,
            error: "Código de verificación inválido o vencido.",
            code: "INVALID_TOTP_CODE",
            issues: parseResult.error.issues,
          },
          { status: 401 },
        );
      }
      bodyCode = parseResult.data.code;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Cuerpo de solicitud inválido.", code: "INVALID_BODY" },
        { status: 400 },
      );
    }

    // 6. Confirmar y activar 2FA
    const confirmResult = await authService.confirm2fa({
      userId: session.userId,
      sessionId: session.id,
      code: bodyCode,
    });

    const durationMs = Math.round(performance.now() - start);

    if (!confirmResult.ok) {
      if (confirmResult.code === "INVALID_TOTP_CODE") {
        log.warn({
          event: "auth.totp_confirm_invalid_code",
          userId: session.userId,
          durationMs,
        });
        return NextResponse.json(
          {
            ok: false,
            error: confirmResult.error,
            code: confirmResult.code,
          },
          { status: 401 },
        );
      }

      log.error({
        event: "auth.totp_confirm_error",
        error: confirmResult.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: confirmResult.error, code: confirmResult.code },
        { status: 400 },
      );
    }

    log.info({
      event: "auth.totp_confirm_success",
      userId: session.userId,
      durationMs,
    });

    // 7. Configurar respuesta y rotar cookies de sesión y CSRF
    const response = NextResponse.json(
      { ok: true, message: confirmResult.data.message },
      { status: 200 },
    );

    response.cookies.set(sidCookieName, confirmResult.data.rotatedSession.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200, // 12 horas
    });

    response.cookies.set(csrfCookieName, confirmResult.data.rotatedSession.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    return response;
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.totp_confirm_unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
