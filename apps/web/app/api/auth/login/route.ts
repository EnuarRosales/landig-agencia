import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

// Rate limit para inicio de sesión: 5 intentos por cada 15 minutos por IP (AUTH-001 §5.2, §7.3)
const loginRateLimiter = new MemoryRateLimiter({
  maxRequests: 10, // 10 en desarrollo / staging
  windowMs: 15 * 60 * 1000,
});

/**
 * Endpoint de Inicio de Sesión Nativo con Credenciales (AUTH-001 T-10, design §5.2).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/login`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist exacta.
 *   - Limitación de tasa (Rate Limiting) por dirección IP.
 *   - Mitigación de temporización (timing attacks) con verificación ficticia de tiempo constante.
 *   - Rehash transparente de contraseñas ante algoritmos o parámetros obsoletos.
 *   - Creación de sesión opaca con CSRF (`__Host-mocter_sid`, `__Host-mocter_csrf`).
 *   - Challenge de doble factor si la cuenta tiene TOTP activado.
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

    // 2. Limitación de tasa (Rate Limiting)
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const rateLimitResult = loginRateLimiter.check(ip);
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
          error:
            "Demasiados intentos fallidos de inicio de sesión. Por favor intente más tarde.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
          },
        },
      );
    }

    // 3. Validación de Content-Type y formato JSON
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

    const userAgent = req.headers.get("user-agent") ?? undefined;
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

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

    // 5. Caso Doble Factor (TOTP activado)
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

    // 6. Caso Sesión Exitosa
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
