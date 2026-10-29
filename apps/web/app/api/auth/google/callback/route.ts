import { NextRequest, NextResponse } from "next/server";
import {
  authService,
  authRateLimiter,
  RedisUnavailableError,
} from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Callback de Autenticación Federada con Google (AUTH-001 §5.3, §6.1, T-14).
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/auth/google/callback` (y reescrita desde `/auth/google/callback`)
 * - **Políticas aplicadas:**
 *   - Límite de tasa distribuido en Redis (20 peticiones / 15 min por IP).
 *   - Validación atómica de un solo uso del estado OAuth y de la cookie de estado (anti-replay).
 *   - Canje de código por tokens con Google OIDC mediante PKCE S256.
 *   - Verificación estricta de ID Token (emisor, audiencia, expiración, nonce, email_verified).
 *   - Creación o vinculación de cuenta de usuario con sesión opaca persistida (`__Host-mocter_sid`).
 *   - Limpieza inmediata de la cookie de estado tras su consumo.
 *   - Manejo de caídas del proveedor devolviendo «Proveedor temporalmente fuera de servicio».
 *
 * @param req - Objeto {@link NextRequest} con los parámetros de consulta `code` y `state`.
 * @returns Redirección HTTP hacia la aplicación o respuesta JSON con detalles de sesión/error.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    // 1. Limitación de tasa distribuida (20/15 min por IP)
    try {
      const rateLimitResult = await authRateLimiter.checkOAuthRateLimit({
        provider: "google",
        ip,
        pepper,
      });

      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.oauth.callback_rate_limited",
          provider: "google",
          clientIp: ip,
          retryAfter: rateLimitResult.retryAfter,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiados intentos de autenticación. Intentá de nuevo más tarde.",
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
          path: "/api/auth/google/callback",
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

    // 2. Extraer parámetros de búsqueda
    const searchParams = req.nextUrl.searchParams;
    const providerError = searchParams.get("error");
    if (providerError) {
      log.warn({
        event: "auth.oauth.provider_error",
        provider: "google",
        error: providerError,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Autenticación cancelada o denegada por el proveedor.",
          code: "OAUTH_ACCESS_DENIED",
        },
        { status: 400 },
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      log.warn({
        event: "auth.oauth.missing_params",
        provider: "google",
        hasCode: Boolean(code),
        hasState: Boolean(state),
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Parámetros de autenticación incompletos o ausentes.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    // 3. Leer cookie de estado según especificación §6.2
    const clientCookieState =
      req.cookies.get("mocter_oauth_state_google")?.value ||
      req.cookies.get("api_mocter_oauth_state_google")?.value ||
      "";

    // 4. Configuración del cliente Google
    const clientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
    const redirectUri =
      env.GOOGLE_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.nextUrl.origin}/auth/google/callback`;

    if (!clientId || !clientSecret) {
      log.error({
        event: "auth.oauth.config_missing",
        provider: "google",
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Proveedor temporalmente fuera de servicio",
          code: "PROVIDER_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const userAgent = req.headers.get("user-agent") ?? undefined;

    // 5. Procesar autenticación en el servicio de dominio
    const result = await authService.authenticateWithGoogle({
      code,
      state,
      clientCookieState,
      clientId,
      clientSecret,
      redirectUri,
      clientIp: ip,
      userAgent,
      pepper,
    });

    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      log.warn({
        event: "auth.oauth.auth_failed",
        provider: "google",
        code: result.code,
        error: result.error,
        durationMs,
      });

      let status = 400;
      if (result.code === "PROVIDER_UNAVAILABLE") {
        status = 503;
      } else if (
        result.code === "EMAIL_NOT_VERIFIED" ||
        result.code === "EXISTING_USER_UNVERIFIED"
      ) {
        status = 422;
      } else if (
        result.code === "INVALID_AUDIENCE" ||
        result.code === "INVALID_NONCE" ||
        result.code === "TOKEN_EXPIRED" ||
        result.code === "ACCOUNT_DISABLED"
      ) {
        status = 401;
      }

      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
        },
        { status },
      );
    }

    log.info({
      event: "auth.oauth.success",
      provider: "google",
      userId: result.data.user.id,
      durationMs,
    });

    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

    const acceptsJson = req.headers.get("accept")?.includes("application/json");

    const response = acceptsJson
      ? NextResponse.json(
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
        )
      : NextResponse.redirect(new URL("/admin", req.nextUrl.origin), {
          status: 303,
        });

    // 6. Cookie de sesión opaca
    response.cookies.set(sidCookieName, result.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200, // 12 horas
    });

    // Cookie CSRF legible por el cliente
    response.cookies.set(csrfCookieName, result.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    // 7. Limpiar cookies de estado consumidas
    response.cookies.set("mocter_oauth_state_google", "", {
      path: "/auth/google",
      maxAge: 0,
    });
    response.cookies.set("api_mocter_oauth_state_google", "", {
      path: "/api/auth/google",
      maxAge: 0,
    });

    return response;
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.oauth.callback_unexpected_error",
      provider: "google",
      err: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Proveedor temporalmente fuera de servicio",
      },
      { status: 503 },
    );
  }
}
