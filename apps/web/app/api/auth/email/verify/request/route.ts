import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para solicitar reenvío de enlace de verificación de correo (AUTH-001 T-09, T-12, design §5.7, §7.3).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/email/verify/request`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Limitación de tasa distribuida en Redis (`redis-control`): 3 por usuario en 15 min y 10 por IP en 1 hora.
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503 sin usar memoria local.
 *   - Responde siempre HTTP 202 con mensaje genérico uniforme (anti-enumeración).
 *
 * @param req - Objeto {@link NextRequest} con JSON conteniendo `email`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/email/verify/request" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    let body: { email?: unknown };
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.validation_failed", reason: "malformed_json" });
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida" },
        { status: 400 },
      );
    }

    if (typeof body?.email !== "string") {
      log.warn({ event: "auth.validation_failed", reason: "missing_email" });
      return NextResponse.json(
        { ok: false, error: "El correo electrónico es requerido" },
        { status: 422 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    // Limitación de tasa distribuida en Redis (Fail-Closed)
    try {
      const rateLimitResult = await authRateLimiter.checkEmailVerifyRequestRateLimit({
        user: body.email,
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
          path: "/api/auth/email/verify/request",
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

    const result = await authService.requestEmailVerification(body.email, { clientIp: ip });
    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      if (result.code === "VALIDATION_ERROR") {
        log.warn({ event: "auth.validation_failed", durationMs });
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 422 },
        );
      }
      log.error({ event: "auth.email_verify_request_error", error: result.error, durationMs });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    log.info({ event: "auth.email_verify_request_dispatched", durationMs });

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
        path: "/api/auth/email/verify/request",
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
      event: "auth.email_verify_request_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar la solicitud." },
      { status: 500 },
    );
  }
}
