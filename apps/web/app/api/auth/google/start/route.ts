import { NextRequest, NextResponse } from "next/server";
import {
  authRateLimiter,
  oauthStateManager,
  defaultGoogleOidcClient,
  RedisUnavailableError,
} from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Inicio de Autenticación Federada con Google (AUTH-001 §5.3, §6.1, T-14).
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/auth/google/start` (y reescrita desde `/auth/google/start`)
 * - **Políticas aplicadas:**
 *   - Límite de tasa distribuido en Redis (20 peticiones / 15 min por IP).
 *   - Generación de `state` criptográfico (32 bytes), desafío PKCE S256 y `nonce` OIDC.
 *   - Persistencia atómica en Redis con TTL de 10 minutos (600s).
 *   - Cookie `mocter_oauth_state_google` con `SameSite=Lax`, `HttpOnly`, `Secure` y `Path=/auth/google`.
 *   - Redirección HTTP 307 al endpoint de autorización de Google.
 *
 * @param req - Objeto {@link NextRequest} con la consulta entrante (`return_to` opcional).
 * @returns Redirección HTTP hacia Google o respuesta JSON de error.
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
          event: "auth.oauth.rate_limited",
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
          path: "/api/auth/google/start",
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

    // 2. Sanitización de return_to y creación de estado PKCE en Redis
    const returnToQuery = req.nextUrl.searchParams.get("return_to");
    const stateResult = await oauthStateManager.createState({
      provider: "google",
      action: "login",
      returnTo: returnToQuery,
    });

    // 3. Resolución de credenciales de Google
    const clientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
    const redirectUri =
      env.GOOGLE_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.nextUrl.origin}/auth/google/callback`;

    if (!clientId) {
      log.error({
        event: "auth.oauth.config_missing",
        provider: "google",
        detail: "GOOGLE_CLIENT_ID no configurado",
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

    // 4. Construcción de URL de autorización de Google con PKCE S256 y nonce
    const authUrl = defaultGoogleOidcClient.getAuthorizationUrl({
      clientId,
      redirectUri,
      state: stateResult.state,
      codeChallenge: stateResult.codeChallenge,
      nonce: stateResult.nonce ?? "",
      prompt: "select_account",
    });

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.oauth.started",
      provider: "google",
      durationMs,
    });

    // 5. Configurar respuesta y cookie de state (design.md §6.2)
    const isProduction = env.NODE_ENV === "production";
    const acceptsJson = req.headers.get("accept")?.includes("application/json");

    const response = acceptsJson
      ? NextResponse.json({ ok: true, url: authUrl }, { status: 200 })
      : NextResponse.redirect(authUrl, { status: 307 });

    // Cookie de estado para el path /auth/google (especificación §6.2)
    response.cookies.set(stateResult.cookieName, stateResult.state, {
      httpOnly: stateResult.cookieOptions.httpOnly,
      secure: isProduction,
      sameSite: stateResult.cookieOptions.sameSite,
      path: stateResult.cookieOptions.path,
      maxAge: stateResult.cookieOptions.maxAge,
    });

    // Cookie auxiliar con path /api/auth/google para pruebas directas en /api/
    response.cookies.set(`api_${stateResult.cookieName}`, stateResult.state, {
      httpOnly: stateResult.cookieOptions.httpOnly,
      secure: isProduction,
      sameSite: stateResult.cookieOptions.sameSite,
      path: "/api/auth/google",
      maxAge: stateResult.cookieOptions.maxAge,
    });

    return response;
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.oauth.unexpected_error",
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
