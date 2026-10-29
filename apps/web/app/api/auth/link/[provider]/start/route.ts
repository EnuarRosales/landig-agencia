import { NextRequest, NextResponse } from "next/server";
import {
  authService,
  authRateLimiter,
  oauthStateManager,
  defaultGoogleOidcClient,
  defaultFacebookOAuthClient,
  RedisUnavailableError,
} from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

interface RouteParams {
  params: Promise<{
    provider: string;
  }>;
}

/**
 * Endpoint de Inicio de Vinculación de Identidad Federada (AUTH-001 §5.4, §6.1, T-16).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/link/:provider/start` (y reescrita desde `/auth/link/:provider/start`)
 * - **Políticas aplicadas:**
 *   - Requiere sesión activa (`__Host-mocter_sid`) y token CSRF (`x-csrf-token`).
 *   - Límite de tasa distribuido en Redis (10 vinculaciones / 15 min por usuario).
 *   - Persiste en Redis el `userId`, proveedor y `return_to` bajo `auth:oauth:<provider>:<hash(state)>`.
 *   - Emite cookie `mocter_oauth_link_state_<provider>` con `SameSite=Lax`, `Path=/auth/link`.
 *   - Retorna URL de autorización o redirige.
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    const resolvedParams = await params;
    const provider = resolvedParams.provider.toLowerCase();

    if (provider !== "google" && provider !== "facebook") {
      return NextResponse.json(
        { ok: false, error: "Proveedor no soportado.", code: "INVALID_PROVIDER" },
        { status: 400 },
      );
    }

    // 1. Validar sesión activa y CSRF
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || "";
    const csrfToken = req.headers.get("x-csrf-token") ?? undefined;

    if (!sid) {
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const sessionValidation = await authService.validateSession(sid, csrfToken);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const session = sessionValidation.data.session;

    // 2. Limitación de tasa por usuario (10/15 min)
    try {
      const rateLimitResult = await authRateLimiter.checkLinkIdentityRateLimit(session.userId);
      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.link.rate_limited",
          provider,
          userId: session.userId,
          retryAfter: rateLimitResult.retryAfter,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiados intentos. Intentá de nuevo más tarde.",
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
          path: `/api/auth/link/${provider}/start`,
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

    // 3. Crear estado OAuth con action: "link" y userId asociado
    const returnToQuery = req.nextUrl.searchParams.get("return_to");
    const stateResult = await oauthStateManager.createState(
      {
        provider,
        action: "link",
        userId: session.userId,
        returnTo: returnToQuery,
      },
      isProduction,
    );

    // 4. Construir URL de autorización del proveedor
    let authUrl = "";
    if (provider === "google") {
      const clientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
      const redirectUri = `${req.nextUrl.origin}/auth/link/google/callback`;

      if (!clientId) {
        return NextResponse.json(
          { ok: false, error: "Proveedor temporalmente fuera de servicio", code: "PROVIDER_NOT_CONFIGURED" },
          { status: 503 },
        );
      }

      authUrl = defaultGoogleOidcClient.getAuthorizationUrl({
        clientId,
        redirectUri,
        state: stateResult.state,
        codeChallenge: stateResult.codeChallenge,
        nonce: stateResult.nonce ?? "",
        prompt: "select_account",
      });
    } else {
      const clientId = env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || "";
      const redirectUri = `${req.nextUrl.origin}/auth/link/facebook/callback`;

      if (!clientId) {
        return NextResponse.json(
          { ok: false, error: "Proveedor temporalmente fuera de servicio", code: "PROVIDER_NOT_CONFIGURED" },
          { status: 503 },
        );
      }

      authUrl = defaultFacebookOAuthClient.getAuthorizationUrl({
        clientId,
        redirectUri,
        state: stateResult.state,
        scope: "email,public_profile",
      });
    }

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.link.started",
      provider,
      userId: session.userId,
      durationMs,
    });

    const acceptsJson = req.headers.get("accept")?.includes("application/json");
    const response = acceptsJson
      ? NextResponse.json({ ok: true, url: authUrl }, { status: 200 })
      : NextResponse.redirect(authUrl, { status: 307 });

    // Cookie de estado con Path=/auth/link según especificación §6.2
    response.cookies.set(stateResult.cookieName, stateResult.state, {
      httpOnly: stateResult.cookieOptions.httpOnly,
      secure: isProduction,
      sameSite: stateResult.cookieOptions.sameSite,
      path: stateResult.cookieOptions.path,
      maxAge: stateResult.cookieOptions.maxAge,
    });

    // Cookie auxiliar con Path=/api/auth/link para pruebas de API directa
    response.cookies.set(`api_${stateResult.cookieName}`, stateResult.state, {
      httpOnly: stateResult.cookieOptions.httpOnly,
      secure: isProduction,
      sameSite: stateResult.cookieOptions.sameSite,
      path: "/api/auth/link",
      maxAge: stateResult.cookieOptions.maxAge,
    });

    return response;
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.link.unexpected_error",
      err: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Proveedor temporalmente fuera de servicio" },
      { status: 503 },
    );
  }
}
