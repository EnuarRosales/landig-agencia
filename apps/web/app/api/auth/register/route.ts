import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  GENERIC_REGISTER_SUCCESS_MESSAGE,
  authRateLimiter,
  RedisUnavailableError,
} from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Registro Nativo de Usuarios (AUTH-001 T-08, T-12, design §6.1, §7.3).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/register`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist y host.
 *   - Limitación de tasa distribuida en Redis (`redis-control`): 5 solicitudes por hora por IP con clave HMAC.
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503 sin usar memoria local.
 *   - Exigencia de consentimiento obligatorio de tratamiento de datos personales (Ley 1581 de 2012).
 *   - Respuesta genérica uniforme (HTTP 202 Accepted) para prevención de enumeración de cuentas.
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    // 1. Validación de Origin contra falsificación de peticiones en registro
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/register" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    // 2. Extracción de IP y verificación de límite de tasa en Redis (Fail-Closed)
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    try {
      const rateLimitResult = await authRateLimiter.checkRegisterRateLimit({
        ip,
        pepper,
      });

      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.rate_limited",
          clientIp: ip,
          retryAfter: rateLimitResult.retryAfter,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiadas solicitudes de registro. Por favor intente más tarde.",
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
          path: "/api/auth/register",
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

    // 3. Validación de Content-Type y extracción de JSON
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.validation_failed", reason: "malformed_json" });
      return NextResponse.json(
        {
          ok: false,
          error: "Formato de carga útil inválido (JSON requerido)",
        },
        { status: 400 },
      );
    }

    // 4. Delegación al servicio de autenticación de dominio
    const result = await authService.register(body, {
      clientIp: ip,
      pepper: env.AUTH_RATE_LIMIT_PEPPER,
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
          {
            ok: false,
            error: result.error,
            issues: result.issues,
          },
          { status: 422 },
        );
      }

      log.error({
        event: "auth.register_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: 500 },
      );
    }

    log.info({
      event: "auth.register_success",
      durationMs,
    });

    // 5. Respuesta HTTP 202 Accepted uniforme (anti-enumeración)
    return NextResponse.json(
      {
        ok: true,
        message: GENERIC_REGISTER_SUCCESS_MESSAGE,
      },
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
        path: "/api/auth/register",
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
      event: "auth.register_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar el registro." },
      { status: 500 },
    );
  }
}
