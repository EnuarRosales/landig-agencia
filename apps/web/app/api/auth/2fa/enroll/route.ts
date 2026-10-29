import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  authRateLimiter,
  enroll2faSchema,
  RedisUnavailableError,
} from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para solicitud de enrolamiento 2FA (AUTH-001 §5.5, §6.1, T-18).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/2fa/enroll` (y reescrita desde `/auth/2fa/enroll`)
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Verificación estricta de sesión activa (`sid`) y token CSRF (`x-csrf-token`).
 *   - Limitación de tasa distribuida en Redis (5 peticiones / 15 min por usuario).
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503 sin bypass.
 *   - Exclusividad para cuentas con contraseña nativa (HTTP 403 si es exclusivamente federada).
 *   - Ventana de reautenticación de 5 minutos: si venció, exige contraseña actual en el cuerpo.
 *   - Genera secreto criptográfico de 20 bytes en Base32 y lo cifra con AES-256-GCM.
 *   - Retorna la URI canónica `otpauth://totp/...` y el secreto una sola vez (secreto pendiente con TTL 10 min).
 *
 * @param req - Objeto {@link NextRequest} con JSON opcional `{ password?: string }`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/2fa/enroll" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403 },
      );
    }

    // 1. Extraer cookie de sesión
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";

    const sid =
      req.cookies.get(sidCookieName)?.value ||
      req.cookies.get("mocter_sid")?.value;

    if (!sid) {
      log.warn({ event: "auth.unauthenticated", path: "/api/auth/2fa/enroll" });
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 2. Extraer y validar token CSRF
    const csrfToken = req.headers.get("x-csrf-token") || undefined;
    if (!csrfToken) {
      log.warn({ event: "auth.csrf_missing", path: "/api/auth/2fa/enroll" });
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
        path: "/api/auth/2fa/enroll",
      });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const { session } = sessionValidation.data;

    // 4. Limitación de tasa distribuida en Redis (5/15 min por usuario, Fail-Closed)
    try {
      const rateLimitResult = await authRateLimiter.checkTotpEnrollRateLimit(session.userId);
      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.totp.rate_limited",
          action: "enroll",
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
          action: "totp_enroll",
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

    // 5. Parsear cuerpo de la petición si se suministra (contraseña opcional)
    let bodyPassword: string | undefined;
    try {
      const json = await req.json();
      const parsed = enroll2faSchema.safeParse(json);
      if (parsed.success && parsed.data.password) {
        bodyPassword = parsed.data.password;
      }
    } catch {
      // Cuerpo vacío es válido si la reautenticación está vigente (< 5 min)
    }

    // 6. Ejecutar enrolamiento 2FA
    const enrollResult = await authService.enroll2fa({
      userId: session.userId,
      sessionId: session.id,
      reauthAt: session.reauthAt,
      password: bodyPassword,
    });

    const durationMs = Math.round(performance.now() - start);

    if (!enrollResult.ok) {
      if (enrollResult.code === "MFA_NOT_AVAILABLE") {
        log.warn({
          event: "auth.totp_enroll_not_available",
          userId: session.userId,
          durationMs,
        });
        return NextResponse.json(
          {
            ok: false,
            error: enrollResult.error,
            code: enrollResult.code,
          },
          { status: 403 },
        );
      }

      if (enrollResult.code === "REAUTH_REQUIRED" || enrollResult.code === "INVALID_CREDENTIALS") {
        log.warn({
          event: "auth.totp_enroll_reauth_failed",
          userId: session.userId,
          reason: enrollResult.code,
          durationMs,
        });
        return NextResponse.json(
          {
            ok: false,
            error: enrollResult.error,
            code: enrollResult.code,
          },
          { status: 401 },
        );
      }

      log.error({
        event: "auth.totp_enroll_error",
        error: enrollResult.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: enrollResult.error, code: enrollResult.code },
        { status: 400 },
      );
    }

    log.info({
      event: "auth.totp_enroll_success",
      userId: session.userId,
      durationMs,
    });

    return NextResponse.json(
      {
        ok: true,
        data: enrollResult.data,
      },
      { status: 200 },
    );
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.totp_enroll_unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
