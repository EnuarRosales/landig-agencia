import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Confirmación de Verificación de Correo (AUTH-001 T-09, T-12, design §5.7, §7.3).
 *
 * Canjea el token de un solo uso recibido vía POST (los escáneres de correo no ejecutan POST).
 * Aplica limitación de tasa distribuida en Redis (5 confirmaciones por IP en 15 min).
 * Marca `email_verified_at = now()` y consume el token atómicamente.
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/email/verify/confirm`
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/email/verify/confirm" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    // Limitación de tasa distribuida en Redis por IP (Fail-Closed, 5 en 15 min)
    try {
      const rateLimitResult = await authRateLimiter.checkEmailVerifyConfirmRateLimit({
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
            error: "Demasiados intentos de confirmación. Por favor intente más tarde.",
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
          path: "/api/auth/email/verify/confirm",
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

    let body: { token?: unknown };
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.validation_failed", reason: "malformed_json" });
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida" },
        { status: 400 },
      );
    }

    if (typeof body?.token !== "string" || !body.token.trim()) {
      log.warn({ event: "auth.validation_failed", reason: "missing_token" });
      return NextResponse.json(
        { ok: false, error: "Token de verificación no proporcionado" },
        { status: 400 },
      );
    }

    const result = await authService.confirmEmailVerification(body.token.trim());
    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      log.warn({
        event: "auth.email_verify_failed",
        code: result.code,
        durationMs,
      });
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
        },
        { status: 400 },
      );
    }

    log.info({
      event: "auth.email_verified_successfully",
      durationMs,
    });

    return NextResponse.json(
      {
        ok: true,
        message: result.data.message,
        email: result.data.email,
      },
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
        path: "/api/auth/email/verify/confirm",
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
      event: "auth.email_verify_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al verificar el correo." },
      { status: 500 },
    );
  }
}
