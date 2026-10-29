import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Endpoint de emisión de tokens JWT para el inicio de sesión único (SSO) en Chatwoot (AUTH-001 §5.10, T-25).
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/auth/chatwoot/sso?client_id=<uuid>` (y reescrita desde `/auth/chatwoot/sso`)
 * - **Políticas aplicadas:**
 *   - Requiere sesión de plataforma activa y vigente.
 *   - Exige que `client_id` coincida con la membresía activa del usuario (`session.clientId` y `user.activeClientId`).
 *   - Emite un JWT HS256 firmado con `CHATWOOT_SSO_SECRET` con TTL de 5 minutos (300 s).
 *   - Limita tasa a 30 peticiones por 15 minutos por usuario en Redis.
 *   - No persiste el token en base de datos ni lo registra en logs.
 *   - Retorna cabeceras estrictas `Cache-Control: no-store`.
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @returns Respuesta HTTP con el token JWT de SSO o error Problem Details.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    // 1. Extraer identificador de sesión desde cookie segura
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;

    if (!sid) {
      log.warn({ event: "auth.chatwoot_sso.unauthenticated", path: req.nextUrl.pathname });
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Iniciá sesión de nuevo.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 2. Validar sesión activa contra Postgres/Redis
    const sessionValidation = await authService.validateSession(sid);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      log.warn({
        event: "auth.chatwoot_sso.session_invalid",
        code: sessionValidation.code,
        path: req.nextUrl.pathname,
      });
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status },
      );
    }

    const { session, user } = sessionValidation.data;

    if (!user) {
      log.warn({ event: "auth.chatwoot_sso.user_not_found", sessionId: session.id });
      return NextResponse.json(
        { ok: false, error: "Usuario de sesión no encontrado.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 3. Extraer y validar el client_id solicitado
    const clientId = req.nextUrl.searchParams.get("client_id");
    if (!clientId) {
      log.warn({ event: "auth.chatwoot_sso.missing_client_id", userId: user.id });
      return NextResponse.json(
        { ok: false, error: "El parámetro client_id es requerido.", code: "MISSING_CLIENT_ID" },
        { status: 400 },
      );
    }

    if (!UUID_REGEX.test(clientId)) {
      log.warn({ event: "auth.chatwoot_sso.invalid_client_id_format", userId: user.id, clientId });
      return NextResponse.json(
        { ok: false, error: "El parámetro client_id debe ser un UUID válido.", code: "INVALID_CLIENT_ID" },
        { status: 400 },
      );
    }

    // 4. Verificar que el cliente coincida con la membresía activa del usuario
    if (session.clientId !== clientId || user.activeClientId !== clientId) {
      log.warn({
        event: "auth.chatwoot_sso.client_mismatch",
        userId: user.id,
        sessionClientId: session.clientId,
        userActiveClientId: user.activeClientId,
        requestedClientId: clientId,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "El usuario no posee una membresía activa en el inquilino solicitado.",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    // 5. Rate limiting en Redis (30 peticiones cada 15 min por usuario)
    try {
      const rateLimitDecision = await authRateLimiter.checkChatwootSsoRateLimit(user.id);
      if (!rateLimitDecision.allowed) {
        log.warn({
          event: "auth.chatwoot_sso.rate_limited",
          userId: user.id,
          retryAfter: rateLimitDecision.retryAfter,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Demasiadas solicitudes de acceso a Chatwoot. Intente más tarde.",
            code: "TOO_MANY_REQUESTS",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rateLimitDecision.retryAfter),
            },
          },
        );
      }
    } catch (rlError) {
      if (rlError instanceof RedisUnavailableError) {
        log.error({ event: "auth.chatwoot_sso.redis_unavailable", userId: user.id });
        return NextResponse.json(
          {
            ok: false,
            error: "Servicio de autenticación temporalmente no disponible.",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      throw rlError;
    }

    // 6. Emitir JWT de 5 minutos mediante AuthService
    const ssoResult = await authService.issueChatwootSso(user.id, clientId);
    if (!ssoResult.ok) {
      log.error({
        event: "auth.chatwoot_sso.issue_failed",
        userId: user.id,
        clientId,
        code: ssoResult.code,
      });

      if (ssoResult.code === "SSO_SECRET_MISSING") {
        return NextResponse.json(
          {
            ok: false,
            error: "Servicio de SSO no configurado en la plataforma.",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }

      if (ssoResult.code === "ACCOUNT_NOT_ACTIVE") {
        return NextResponse.json(
          { ok: false, error: "La cuenta de usuario no se encuentra activa.", code: "FORBIDDEN" },
          { status: 403 },
        );
      }

      return NextResponse.json(
        { ok: false, error: ssoResult.error, code: ssoResult.code },
        { status: 500 },
      );
    }

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.chatwoot_sso.issued",
      userId: user.id,
      clientId,
      expiresAt: ssoResult.data.expiresAt.toISOString(),
      durationMs,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          token: ssoResult.data.token,
          expiresAt: ssoResult.data.expiresAt.toISOString(),
          email: ssoResult.data.claims.email,
          name: ssoResult.data.claims.name,
          identifier: ssoResult.data.claims.identifier,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.chatwoot_sso.unhandled_error",
      error: serializeError(error),
      durationMs,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
