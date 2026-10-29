import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

// Rate limit: 5 intentos por cada 15 minutos por IP (AUTH-001 §5.8)
const changePasswordRateLimiter = new MemoryRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

/**
 * Endpoint para cambio autenticado de contraseña (AUTH-001 T-11, design §5.8).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/password/change`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Verificación estricta de sesión activa (`sid`) y token CSRF (`x-csrf-token`).
 *   - Verificación de contraseña actual mediante Argon2id en tiempo constante.
 *   - Exigencia de código TOTP si la cuenta posee doble factor activado.
 *   - Revocación de todas las demás sesiones activas del usuario (`exceptSessionId`).
 *   - Rotación inmediata de la sesión actual con emisión de nuevas cookies `sid` y `csrfToken`.
 *
 * @param req - Objeto {@link NextRequest} con JSON `{ currentPassword, newPassword, totpCode? }`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/password/change" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const rateLimitResult = changePasswordRateLimiter.check(ip);
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
      );
      log.warn({
        event: "auth.rate_limited",
        clientIp: ip,
        retryAfter,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Demasiados intentos. Por favor intente más tarde.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
          },
        },
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
      log.warn({ event: "auth.unauthenticated", path: "/api/auth/password/change" });
      return NextResponse.json(
        { ok: false, error: "No autenticado." },
        { status: 401 },
      );
    }

    // 2. Extraer y validar token CSRF
    const csrfToken = req.headers.get("x-csrf-token") || undefined;
    if (!csrfToken) {
      log.warn({ event: "auth.csrf_missing", path: "/api/auth/password/change" });
      return NextResponse.json(
        { ok: false, error: "Encabezado CSRF ausente." },
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
      });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error },
        { status },
      );
    }

    const { session } = sessionValidation.data;

    // 4. Procesar carga útil
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.validation_failed", reason: "malformed_json" });
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida" },
        { status: 400 },
      );
    }

    // 5. Ejecutar cambio de contraseña y rotación de sesión
    const changeResult = await authService.changePassword(body, {
      userId: session.userId,
      sessionId: session.id,
    });
    const durationMs = Math.round(performance.now() - start);

    if (!changeResult.ok) {
      if (changeResult.code === "VALIDATION_ERROR") {
        log.warn({
          event: "auth.validation_failed",
          issuesCount: Array.isArray(changeResult.issues) ? changeResult.issues.length : undefined,
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: changeResult.error, issues: changeResult.issues },
          { status: 400 },
        );
      }

      if (changeResult.code === "INVALID_CREDENTIALS") {
        log.warn({
          event: "auth.password_change_failed",
          reason: "invalid_credentials",
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: changeResult.error },
          { status: 401 },
        );
      }

      if (changeResult.code === "MFA_REQUIRED") {
        log.warn({
          event: "auth.password_change_mfa_required",
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: changeResult.error, code: "MFA_REQUIRED" },
          { status: 403 },
        );
      }

      log.error({
        event: "auth.password_change_error",
        error: changeResult.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: changeResult.error },
        { status: 400 },
      );
    }

    log.info({
      event: "auth.password_changed_successfully",
      userId: session.userId,
      durationMs,
    });

    // 6. Configurar respuesta y rotar cookies de sesión y CSRF
    const response = NextResponse.json(
      { ok: true, message: changeResult.data.message },
      { status: 200 },
    );

    response.cookies.set(sidCookieName, changeResult.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200, // 12 horas
    });

    response.cookies.set(csrfCookieName, changeResult.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    return response;
  } catch (e: unknown) {
    unstable_rethrow(e);
    log.error({
      event: "auth.password_change_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar el cambio de contraseña." },
      { status: 500 },
    );
  }
}
