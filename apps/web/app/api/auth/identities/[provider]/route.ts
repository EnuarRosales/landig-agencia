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
 * Endpoint de Desvinculación de Identidad Federada (AUTH-001 §5.4, §6.1, T-16).
 *
 * - **Método:** `DELETE`
 * - **Ruta:** `/api/auth/identities/:provider` (y reescrita desde `/auth/identities/:provider`)
 * - **Políticas aplicadas:**
 *   - Requiere sesión activa (`__Host-mocter_sid`) y token CSRF (`x-csrf-token`).
 *   - Límite de tasa distribuido en Redis (5 desvinculaciones / 15 min por usuario).
 *   - Reautenticación obligatoria con contraseña si el usuario posee contraseña nativa.
 *   - Impide desvincular el último método de acceso a la cuenta (HTTP 400).
 *   - Si se desvincula el proveedor usado para el inicio de sesión actual, revoca las demás sesiones y rota la actual (§5.4).
 */
export async function DELETE(
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

    // 1. Validar sesión activa y token CSRF
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";
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

    // 2. Limitación de tasa por usuario (5/15 min)
    try {
      const rateLimitResult = await authRateLimiter.checkUnlinkIdentityRateLimit(session.userId);
      if (!rateLimitResult.allowed) {
        log.warn({
          event: "auth.unlink.rate_limited",
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
          path: `/api/auth/identities/${provider}`,
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

    // 3. Leer cuerpo opcional con contraseña o código TOTP
    let currentPassword: string | undefined;
    let totpCode: string | undefined;

    try {
      const body = await req.json();
      if (typeof body === "object" && body !== null) {
        currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : undefined;
        totpCode = typeof body.totpCode === "string" ? body.totpCode : undefined;
      }
    } catch {
      // Cuerpo vacío o sin JSON
    }

    // 4. Desvincular en el servicio de dominio
    const result = await authService.unlinkProviderIdentity({
      userId: session.userId,
      sessionId: session.id,
      currentAuthMethod: session.authMethod,
      provider,
      currentPassword,
      totpCode,
    });

    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      log.warn({
        event: "auth.unlink.failed",
        provider,
        code: result.code,
        error: result.error,
        durationMs,
      });

      let status = 400;
      if (result.code === "PASSWORD_REQUIRED") {
        status = 422;
      } else if (result.code === "INVALID_CREDENTIALS") {
        status = 401;
      } else if (result.code === "IDENTITY_NOT_FOUND") {
        status = 404;
      } else if (result.code === "ACCOUNT_DISABLED") {
        status = 401;
      }

      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status },
      );
    }

    log.info({
      event: "auth.unlink.success",
      provider,
      userId: session.userId,
      durationMs,
    });

    const response = NextResponse.json(
      { ok: true, message: result.data.message },
      { status: 200 },
    );

    // 5. Si la sesión fue rotada porque el método activo coincidía con el desvinculado, actualizar cookies
    if (result.data.rotatedSession) {
      response.cookies.set(sidCookieName, result.data.rotatedSession.sid, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        path: "/",
        maxAge: 43200,
      });

      response.cookies.set(csrfCookieName, result.data.rotatedSession.csrfToken, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "strict",
        path: "/",
        maxAge: 43200,
      });
    }

    return response;
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.unlink.unexpected_error",
      err: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Proveedor temporalmente fuera de servicio" },
      { status: 503 },
    );
  }
}
