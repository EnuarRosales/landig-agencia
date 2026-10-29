import { NextRequest, NextResponse } from "next/server";
import {
  authService,
  authRateLimiter,
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
 * Endpoint de Callback de Vinculación de Identidad Federada (AUTH-001 §5.4, §6.1, T-16).
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/auth/link/:provider/callback` (y reescrita desde `/auth/link/:provider/callback`)
 * - **Políticas aplicadas:**
 *   - Valida el estado mediante cookie `mocter_oauth_link_state_<provider>` con `Path=/auth/link`.
 *   - No depende de cookie de sesión (`__Host-mocter_sid` es `SameSite=Strict` y el navegador no la envía en la navegación de vuelta).
 *   - El usuario ancla se resuelve atómicamente a través del `userId` almacenado en Redis durante `start`.
 *   - Valida que la identidad no pertenezca ya a otro usuario (HTTP 409 Conflict ante intento de duplicación).
 *   - Emite nueva sesión opaca rotada para el usuario vinculado y redirige a `returnTo`.
 *   - Limpia cookies de estado de vinculación.
 */
export async function GET(
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

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    // 1. Rate limiting por IP en OAuth
    try {
      const rateLimitResult = await authRateLimiter.checkOAuthRateLimit({
        provider,
        ip,
        pepper,
      });

      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.link.callback_rate_limited",
          provider,
          clientIp: ip,
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
          path: `/api/auth/link/${provider}/callback`,
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

    // 2. Extraer parámetros
    const searchParams = req.nextUrl.searchParams;
    const providerError = searchParams.get("error");
    if (providerError) {
      log.warn({
        event: "auth.link.provider_error",
        provider,
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
      return NextResponse.json(
        {
          ok: false,
          error: "Parámetros de autenticación incompletos o ausentes.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    // 3. Leer cookie de estado de vinculación (Path=/auth/link)
    const cookieName = `mocter_oauth_link_state_${provider}`;
    const clientCookieState =
      req.cookies.get(cookieName)?.value ||
      req.cookies.get(`api_${cookieName}`)?.value ||
      "";

    // 4. Credenciales del proveedor
    const clientId =
      provider === "google"
        ? env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ""
        : env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || "";
    const clientSecret =
      provider === "google"
        ? env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ""
        : env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "";
    const redirectUri = `${req.nextUrl.origin}/auth/link/${provider}/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { ok: false, error: "Proveedor temporalmente fuera de servicio", code: "PROVIDER_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const userAgent = req.headers.get("user-agent") ?? undefined;

    // 5. Procesar vinculación en el servicio de dominio
    const result = await authService.linkProviderIdentity({
      provider,
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
        event: "auth.link.failed",
        provider,
        code: result.code,
        error: result.error,
        durationMs,
      });

      let status = 400;
      if (result.code === "PROVIDER_UNAVAILABLE") {
        status = 503;
      } else if (result.code === "IDENTITY_ALREADY_LINKED") {
        status = 409;
      } else if (
        result.code === "EMAIL_NOT_VERIFIED" ||
        result.code === "MISSING_OR_UNVERIFIED_EMAIL"
      ) {
        status = 422;
      } else if (result.code === "ACCOUNT_DISABLED") {
        status = 401;
      }

      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status },
      );
    }

    log.info({
      event: "auth.link.success",
      provider,
      userId: result.data.user.id,
      durationMs,
    });

    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

    const acceptsJson = req.headers.get("accept")?.includes("application/json");
    const destinationUrl = new URL(result.data.returnTo, req.nextUrl.origin);

    const response = acceptsJson
      ? NextResponse.json(
          {
            ok: true,
            data: {
              user: result.data.user,
              emailVerified: result.data.emailVerified,
              returnTo: result.data.returnTo,
            },
          },
          { status: 200 },
        )
      : NextResponse.redirect(destinationUrl, { status: 303 });

    // 6. Fijar sesión opaca
    response.cookies.set(sidCookieName, result.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    response.cookies.set(csrfCookieName, result.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    // 7. Limpiar cookies de estado consumidas
    response.cookies.set(cookieName, "", {
      path: "/auth/link",
      maxAge: 0,
    });
    response.cookies.set(`api_${cookieName}`, "", {
      path: "/api/auth/link",
      maxAge: 0,
    });

    return response;
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.link.callback_unexpected_error",
      err: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Proveedor temporalmente fuera de servicio" },
      { status: 503 },
    );
  }
}
