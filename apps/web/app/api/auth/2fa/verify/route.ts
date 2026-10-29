import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  authRateLimiter,
  verify2faChallengeSchema,
  hashChallengeToken,
  RedisUnavailableError,
} from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para verificación de desafío 2FA y culminación de inicio de sesión (AUTH-001 §5.5, §6.1, T-19).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/2fa/verify` (y reescrita desde `/auth/2fa/verify`)
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Extracción de cookie de desafío `__Host-mocter_challenge` (o `mocter_challenge` en desarrollo).
 *   - Validación de formato Zod del código TOTP (`verify2faChallengeSchema`).
 *   - Limitación de tasa distribuida en Redis (5 intentos / 5 min por desafío, Fail-Closed).
 *   - Verificación estricta de ventana ±1 (30s) y anti-replay contra `totp_last_used_step`.
 *   - Consumo atómico del desafío y autodestrucción al 5.° intento fallido consecutivo.
 *   - Emisión de cookies de sesión opaca `__Host-mocter_sid` y CSRF `__Host-mocter_csrf` con `mfa_at = now()`.
 *   - Limpieza de la cookie de desafío ante éxito o agotamiento/expiración.
 *
 * @param req - Objeto {@link NextRequest} con JSON `{ code: string }`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/2fa/verify" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403 },
      );
    }

    const isProduction = env.NODE_ENV === "production";
    const challengeCookieName = isProduction
      ? "__Host-mocter_challenge"
      : "mocter_challenge";

    // 1. Extraer cookie de desafío 2FA
    const challengeToken =
      req.cookies.get(challengeCookieName)?.value ||
      req.cookies.get("mocter_challenge")?.value;

    if (!challengeToken) {
      log.warn({ event: "auth.challenge_missing", path: "/api/auth/2fa/verify" });
      return NextResponse.json(
        {
          ok: false,
          error: "El desafío de autenticación ha vencido o no existe.",
          code: "CHALLENGE_EXPIRED",
        },
        { status: 401 },
      );
    }

    // 2. Extraer y validar el cuerpo de la petición
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.invalid_json", path: "/api/auth/2fa/verify" });
      return NextResponse.json(
        { ok: false, error: "Cuerpo de solicitud inválido.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const parsed = verify2faChallengeSchema.safeParse(body);
    if (!parsed.success) {
      log.warn({
        event: "auth.totp.validation_failed",
        path: "/api/auth/2fa/verify",
        issuesCount: parsed.error.issues.length,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Código de verificación inválido o incompleto.",
          code: "INVALID_TOTP_CODE",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    // 3. Limitación de tasa distribuida en Redis por challenge (5 intentos / 5 min, Fail-Closed)
    const challengeHash = hashChallengeToken(challengeToken);
    try {
      const rateLimitResult = await authRateLimiter.checkTotpChallengeRateLimit(challengeHash);
      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.totp.rate_limited",
          action: "verify_challenge",
          retryAfter: rateLimitResult.retryAfter,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiados intentos de verificación. Por favor intente más tarde.",
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
          path: "/api/auth/2fa/verify",
          err: serializeError(err),
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Servicio temporalmente no disponible. Por favor intente más tarde.",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      throw err;
    }

    // 4. Delegar verificación al servicio de dominio
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || undefined;
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    const result = await authService.verify2faChallenge({
      challengeToken,
      code: parsed.data.code,
      clientIp: ip,
      userAgent,
      pepper,
    });

    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      if (
        result.code === "CHALLENGE_EXPIRED" ||
        result.code === "CHALLENGE_EXHAUSTED" ||
        result.code === "USER_NOT_FOUND" ||
        result.code === "MFA_NOT_ENABLED"
      ) {
        log.warn({
          event: "auth.totp.challenge_failed",
          code: result.code,
          durationMs,
        });

        const response = NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 401 },
        );

        // Limpieza de cookie de desafío expirado/agotado
        response.cookies.set(challengeCookieName, "", {
          httpOnly: true,
          secure: isProduction,
          sameSite: "strict",
          path: "/",
          maxAge: 0,
        });

        return response;
      }

      if (result.code === "INVALID_TOTP_CODE") {
        log.warn({
          event: "auth.totp.invalid_code",
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 401 },
        );
      }

      if (result.code === "CELL_UNAVAILABLE") {
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 503 },
        );
      }

      log.error({
        event: "auth.totp.verify_internal_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 500 },
      );
    }

    // 5. Verificación exitosa: emitir sesión y limpiar cookie de desafío
    log.info({
      event: "auth.totp.verify_success",
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

    // Cookie opaca de sesión (HttpOnly, SameSite=Strict, 12 horas)
    response.cookies.set(sidCookieName, result.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    // Cookie CSRF legible por frontend (SameSite=Strict, 12 horas)
    response.cookies.set(csrfCookieName, result.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    // Limpieza de cookie de desafío consumido
    response.cookies.set(challengeCookieName, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
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
        path: "/api/auth/2fa/verify",
        err: serializeError(e),
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Servicio temporalmente no disponible. Por favor intente más tarde.",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    log.error({
      event: "auth.totp.verify_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar la solicitud." },
      { status: 500 },
    );
  }
}
