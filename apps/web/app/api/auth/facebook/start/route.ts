import { NextRequest, NextResponse } from "next/server";
import {
  authService,
  authRateLimiter,
  oauthStateManager,
  defaultFacebookOAuthClient,
  RedisUnavailableError,
} from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint de Inicio de Autenticación Federada con Facebook (AUTH-001 §5.3, §6.1, T-15).
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/auth/facebook/start` (y reescrita desde `/auth/facebook/start`)
 * - **Políticas aplicadas:**
 *   - Límite de tasa distribuido en Redis (20 peticiones / 15 min por IP).
 *   - Generación de `state` criptográfico (32 bytes).
 *   - Persistencia atómica en Redis con TTL de 10 minutos (600s).
 *   - Cookie `mocter_oauth_state_facebook` con `SameSite=Lax`, `HttpOnly`, `Secure` y `Path=/auth/facebook`.
 *   - Redirección HTTP 307 al endpoint de diálogo OAuth de Facebook.
 *
 * @param req - Objeto {@link NextRequest} con la consulta entrante (`return_to` opcional).
 * @returns Redirección HTTP hacia Facebook o respuesta JSON de error.
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
        provider: "facebook",
        ip,
        pepper,
      });

      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.oauth.rate_limited",
          provider: "facebook",
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
          path: "/api/auth/facebook/start",
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

    // 2. Sanitización de return_to y creación de estado en Redis
    const returnToQuery = req.nextUrl.searchParams.get("return_to");
    const stateResult = await oauthStateManager.createState({
      provider: "facebook",
      action: "login",
      returnTo: returnToQuery,
    });

    // 3. Resolución dinámica de credenciales y habilitación de Facebook (AUTH-D-08, CA-AUTH-02)
    let clientId = env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || "";
    const clientSecretFallback =
      env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "fallback-secret";
    let scope = "email,public_profile";
    if (typeof authService?.resolveOAuthProviderRuntimeConfig === "function") {
      const runtimeCfg = await authService.resolveOAuthProviderRuntimeConfig("facebook", {
        clientId,
        clientSecret: clientSecretFallback,
      });
      if (!runtimeCfg.ok && runtimeCfg.code === "PROVIDER_DISABLED") {
        return NextResponse.json(
          {
            ok: false,
            error: "Proveedor temporalmente fuera de servicio",
            code: "PROVIDER_DISABLED",
          },
          { status: 503 },
        );
      }
      if (runtimeCfg.ok) {
        clientId = runtimeCfg.data.clientId;
        if (runtimeCfg.data.scopes.length > 0) {
          scope = runtimeCfg.data.scopes.join(",");
        }
      }
    }

    const redirectUri =
      env.FACEBOOK_REDIRECT_URI ||
      process.env.FACEBOOK_REDIRECT_URI ||
      `${req.nextUrl.origin}/auth/facebook/callback`;

    if (!clientId) {
      log.error({
        event: "auth.oauth.config_missing",
        provider: "facebook",
        detail: "FACEBOOK_APP_ID no configurado",
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

    // 4. Construcción de URL de autorización de Facebook con OAuth 2.0 y state
    const authUrl = defaultFacebookOAuthClient.getAuthorizationUrl({
      clientId,
      redirectUri,
      state: stateResult.state,
      scope,
    });

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.oauth.started",
      provider: "facebook",
      durationMs,
    });

    // 5. Configurar respuesta y cookie de state (design.md §6.2)
    const isProduction = env.NODE_ENV === "production";
    const acceptsJson = req.headers.get("accept")?.includes("application/json");

    const response = acceptsJson
      ? NextResponse.json({ ok: true, url: authUrl }, { status: 200 })
      : NextResponse.redirect(authUrl, { status: 307 });

    // Cookie de estado para el path /auth/facebook (especificación §6.2)
    response.cookies.set(stateResult.cookieName, stateResult.state, {
      httpOnly: stateResult.cookieOptions.httpOnly,
      secure: isProduction,
      sameSite: stateResult.cookieOptions.sameSite,
      path: stateResult.cookieOptions.path,
      maxAge: stateResult.cookieOptions.maxAge,
    });

    // Cookie auxiliar con path /api/auth/facebook para pruebas directas en /api/
    response.cookies.set(`api_${stateResult.cookieName}`, stateResult.state, {
      httpOnly: stateResult.cookieOptions.httpOnly,
      secure: isProduction,
      sameSite: stateResult.cookieOptions.sameSite,
      path: "/api/auth/facebook",
      maxAge: stateResult.cookieOptions.maxAge,
    });

    return response;
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.oauth.unexpected_error",
      provider: "facebook",
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
