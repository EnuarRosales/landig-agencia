import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para restablecer o establecer la contraseña de una cuenta (AUTH-001 T-11, T-12, design §5.8, §7.3).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/password/reset`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Limitación de tasa distribuida en Redis (`redis-control`): 5 intentos por token en 15 minutos con clave HMAC.
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503 sin usar memoria local.
 *   - Consumo único del token con invalidación de sesiones previas (`password_reset`).
 *   - No inicia sesión automáticamente; el usuario debe redirigirse al login.
 *
 * @param req - Objeto {@link NextRequest} con JSON `{ token, password }`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/password/reset" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

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

    const token =
      typeof body === "object" && body !== null && "token" in body
        ? String((body as { token: unknown }).token)
        : "";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    // Limitación de tasa distribuida en Redis por token (Fail-Closed)
    try {
      const rateLimitResult = await authRateLimiter.checkPasswordResetRateLimit({
        token,
        pepper,
      });

      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.rate_limited",
          retryAfter: rateLimitResult.retryAfter,
          blockedBy: rateLimitResult.blockedBy,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiados intentos. Por favor intente más tarde.",
            code: "RATE_LIMIT_EXCEEDED",
          },
          {
            status: 429,
            headers: {
              "Retry-After": rateLimitResult.retryAfter.toString(),
            },
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
          path: "/api/auth/password/reset",
          err: serializeError(err),
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Servicio temporalmente no disponible. Por favor intente más tarde.",
            code: "REDIS_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      throw err;
    }

    const result = await authService.resetPassword(body);
    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      if (result.code === "VALIDATION_ERROR") {
        log.warn({
          event: "auth.validation_failed",
          issuesCount: Array.isArray(result.issues) ? result.issues.length : undefined,
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error, issues: result.issues },
          { status: 400 },
        );
      }

      if (
        result.code === "INVALID_TOKEN" ||
        result.code === "TOKEN_ALREADY_USED" ||
        result.code === "TOKEN_EXPIRED" ||
        result.code === "PASSWORD_ALREADY_EXISTS" ||
        result.code === "NO_NATIVE_PASSWORD" ||
        result.code === "USER_NOT_FOUND"
      ) {
        log.warn({
          event: "auth.reset_password_failed",
          code: result.code,
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 400 },
        );
      }

      log.error({
        event: "auth.reset_password_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    log.info({
      event: "auth.password_reset_successfully",
      durationMs,
    });

    return NextResponse.json(
      { ok: true, message: result.data.message },
      { status: 200 },
    );
  } catch (e: unknown) {
    unstable_rethrow(e);
    if (
      e instanceof RedisUnavailableError ||
      (e as { name?: string })?.name === "RedisUnavailableError"
    ) {
      log.error({
        event: "auth.redis_unavailable",
        path: "/api/auth/password/reset",
        err: serializeError(e),
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Servicio temporalmente no disponible. Por favor intente más tarde.",
          code: "REDIS_UNAVAILABLE",
        },
        { status: 503 },
      );
    }
    log.error({
      event: "auth.reset_password_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar el cambio de contraseña." },
      { status: 500 },
    );
  }
}
