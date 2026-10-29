import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Inicio de Sesión Nativo con Credenciales (AUTH-001 T-10, T-12, design §5.2, §7.3).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/login`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist exacta.
 *   - Limitación de tasa distribuida en Redis (`redis-control`) con claves HMAC y TTL.
 *   - Política Fail-Closed: si Redis no responde, retorna HTTP 503 sin usar memoria local.
 *   - Mitigación de temporización (timing attacks) con verificación ficticia de tiempo constante.
 *   - Rehash transparente de contraseñas ante algoritmos o parámetros obsoletos.
 *   - Creación de sesión opaca con CSRF (`__Host-mocter_sid`, `__Host-mocter_csrf`).
 *   - Challenge de doble factor si la cuenta tiene TOTP activado.
 *   - Reinicio automático del contador de fallos de cuenta+IP ante login exitoso.
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON (`email`, `password`).
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    // 1. Validación de Origin contra CSRF en formularios de autenticación
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/login" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    // 2. Validación de Content-Type y formato JSON previo
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

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    const email =
      typeof body === "object" && body !== null && "email" in body
        ? String((body as { email: unknown }).email)
        : "";

    // 3. Limitación de tasa distribuida en Redis (Fail-Closed, design.md §7.3, §7.4)
    try {
      const rateLimitResult = await authRateLimiter.checkLoginRateLimit({
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
            error:
              "Demasiados intentos fallidos de inicio de sesión. Por favor intente más tarde.",
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
          path: "/api/auth/login",
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

    // 4. Delegación al servicio de autenticación de dominio
    const result = await authService.login(body, {
      clientIp: ip,
      userAgent,
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

      if (result.code === "INVALID_CREDENTIALS") {
        // Registro atómico de intento fallido en Redis
        try {
          await authRateLimiter.recordLoginFailure({ email, ip, pepper });
        } catch (err: unknown) {
          if (
            err instanceof RedisUnavailableError ||
            (err as { name?: string })?.name === "RedisUnavailableError"
          ) {
            log.error({
              event: "auth.redis_unavailable",
              path: "/api/auth/login",
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

        log.warn({
          event: "auth.login_failed",
          reason: "invalid_credentials",
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 401 },
        );
      }

      if (
        result.code === "IDENTITY_INCONSISTENT" ||
        result.code === "CELL_UNAVAILABLE"
      ) {
        log.error({
          event: "auth.cell_unavailable",
          code: result.code,
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 503 },
        );
      }

      log.error({
        event: "auth.login_internal_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    // 5. Reinicio del contador de fallos de cuenta+IP ante autenticación exitosa (T-12)
    try {
      await authRateLimiter.resetLoginFailure({ email, ip, pepper });
    } catch (err: unknown) {
      if (
        err instanceof RedisUnavailableError ||
        (err as { name?: string })?.name === "RedisUnavailableError"
      ) {
        log.error({
          event: "auth.redis_unavailable",
          path: "/api/auth/login",
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

    // 6. Caso Doble Factor (TOTP activado)
    const isProduction = env.NODE_ENV === "production";

    if ("mfaRequired" in result.data) {
      log.info({
        event: "auth.mfa_required",
        userId: result.data.userId,
        durationMs,
      });

      const challengeCookieName = isProduction
        ? "__Host-mocter_challenge"
        : "mocter_challenge";

      const response = NextResponse.json(
        {
          ok: true,
          mfaRequired: true,
          expiresAt: result.data.expiresAt,
        },
        { status: 200 },
      );

      response.cookies.set(challengeCookieName, result.data.challengeToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        path: "/",
        maxAge: 300, // 5 minutos
      });

      return response;
    }

    // 7. Caso Sesión Exitosa
    log.info({
      event: "auth.login_success",
      userId: result.data.user.id,
      durationMs,
    });

    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

    const response = NextResponse.json(
      {
        ok: true,
        data: {
          user: result.data.user,
          emailVerified: result.data.emailVerified,
          clientId: result.data.clientId,
          expiresAt: result.data.expiresAt,
        },
      },
      { status: 200 },
    );

    // Cookie opaca de sesión (HttpOnly, SameSite=Strict, 12 horas máx absoluto)
    response.cookies.set(sidCookieName, result.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200, // 12 horas
    });

    // Cookie CSRF (legible por el cliente para el encabezado X-CSRF-Token)
    response.cookies.set(csrfCookieName, result.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    return response;
  } catch (e: unknown) {
    unstable_rethrow(e);
    if (
      e instanceof RedisUnavailableError ||
      (e as { name?: string })?.name === "RedisUnavailableError"
    ) {
      log.error({
        event: "auth.redis_unavailable",
        path: "/api/auth/login",
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
      event: "auth.login_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar la solicitud." },
      { status: 500 },
    );
  }
}
