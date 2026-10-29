import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para solicitar recuperación de contraseña (AUTH-001 T-11, T-12, design §5.8, §7.3).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/password/forgot`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Limitación de tasa distribuida en Redis (`redis-control`): 3 por cuenta y 10 por IP en 1 hora con clave HMAC.
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503 sin usar memoria local.
 *   - Anti-enumeración estricta: si el usuario no existe, está deshabilitado o es exclusivamente federado,
 *     responde siempre HTTP 202 con el mismo mensaje genérico uniforme sin emitir token.
 *   - Despacha correo transaccional vía {@link authService.forgotPassword}.
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON conteniendo `email`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/password/forgot" });
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

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;
    const email =
      typeof body === "object" && body !== null && "email" in body
        ? String((body as { email: unknown }).email)
        : "";

    // Limitación de tasa distribuida en Redis (Fail-Closed)
    try {
      const rateLimitResult = await authRateLimiter.checkForgotPasswordRateLimit({
        email,
        ip,
        pepper,
      });

      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.rate_limited",
          clientIp: ip,
          retryAfter: rateLimitResult.retryAfter,
          blockedBy: rateLimitResult.blockedBy,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiadas solicitudes. Por favor intente más tarde.",
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
          path: "/api/auth/password/forgot",
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

    const result = await authService.forgotPassword(body, {
      clientIp: ip,
      pepper,
    });
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
      log.error({
        event: "auth.forgot_password_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    log.info({
      event: "auth.forgot_password_processed",
      durationMs,
    });

    return NextResponse.json(
      { ok: true, message: result.data.message },
      { status: 202 },
    );
  } catch (e: unknown) {
    unstable_rethrow(e);
    if (
      e instanceof RedisUnavailableError ||
      (e as { name?: string })?.name === "RedisUnavailableError"
    ) {
      log.error({
        event: "auth.redis_unavailable",
        path: "/api/auth/password/forgot",
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
      event: "auth.forgot_password_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar la solicitud." },
      { status: 500 },
    );
  }
}
