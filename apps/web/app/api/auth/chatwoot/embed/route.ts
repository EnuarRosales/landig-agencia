import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService, authRateLimiter, RedisUnavailableError } from "@mocter/domain";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Genera el documento HTML mínimo con auto-submit para el handoff embebido de Chatwoot.
 *
 * @param targetAction - URL de destino en la instancia Chatwoot para recibir el POST del token.
 * @param token - Token JWT de SSO emitido para consumo único de 5 minutos.
 * @returns Cadena HTML del documento.
 */
function buildAutoSubmitHtml(targetAction: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Conectando con Chatwoot...</title>
  <style>
    body {
      background: #090d16;
      color: #94a3b8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="status">Estableciendo túnel seguro con la bandeja de atención...</div>
  <form id="ssoForm" method="POST" action="${targetAction}">
    <input type="hidden" name="sso_token" value="${token}" />
    <noscript>
      <button type="submit" style="padding: 8px 16px; background: #3b82f6; color: #fff; border: 0; border-radius: 4px; cursor: pointer;">
        Continuar a Chatwoot
      </button>
    </noscript>
  </form>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      var form = document.getElementById("ssoForm");
      if (form) form.submit();
    });
  </script>
</body>
</html>`;
}

/**
 * Genera el documento HTML de error para despliegue dentro del iframe en caso de sesión inválida.
 *
 * @param message - Mensaje explicativo del error.
 * @returns Cadena HTML del documento.
 */
function buildErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Error de Autenticación</title>
  <style>
    body {
      background: #090d16;
      color: #ef4444;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      font-size: 13px;
      text-align: center;
      padding: 16px;
    }
  </style>
</head>
<body>
  <div id="status">${message}</div>
  <script>
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "MOCTER_CHATWOOT_REAUTH_REQUIRED" }, "*");
    }
  </script>
</body>
</html>`;
}

/**
 * Endpoint de handoff para Chatwoot SSO embebido en iframe (AUTH-001 §5.10, T-38, ADM-001 D-32).
 *
 * - **Método:** `GET`
 * - **Rutas:** `/auth/chatwoot/embed` y `/api/auth/chatwoot/embed`
 * - **Garantías de seguridad:**
 *   - Valida la sesión activa y vigente del usuario.
 *   - Valida que `client_id` coincida con la membresía activa del usuario (`user.activeClientId`).
 *   - Verifica que el usuario se encuentre en estado `active`.
 *   - Aplica limitación de tasa (30 peticiones / 15 min en Redis).
 *   - Emite un JWT HS256 efímero (5 minutos) de un solo uso registrado en Redis (`jti`).
 *   - Retorna una página HTML con auto-submit por POST sin exponer el token en el `src` del iframe,
 *     en el historial del nivel superior ni en los registros del servidor.
 *   - Respuesta servida con `Cache-Control: no-store` y CSP restrictiva para framing.
 *
 * @param req - Solicitud HTTP entrante.
 * @returns Respuesta HTTP con el documento HTML o mensaje de error.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    // 1. Extraer identificador de sesión desde cookie protegida
    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;

    if (!sid) {
      log.warn({ event: "auth.chatwoot_embed.unauthenticated", path: req.nextUrl.pathname });
      return new NextResponse(buildErrorHtml("La sesión venció. Iniciá sesión de nuevo."), {
        status: 401,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // 2. Validar sesión activa contra Postgres/Redis
    const sessionValidation = await authService.validateSession(sid);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      log.warn({
        event: "auth.chatwoot_embed.session_invalid",
        code: sessionValidation.code,
        path: req.nextUrl.pathname,
      });
      return new NextResponse(buildErrorHtml(sessionValidation.error), {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const { session, user } = sessionValidation.data;
    if (!user) {
      log.warn({ event: "auth.chatwoot_embed.user_not_found", sessionId: session.id });
      return new NextResponse(buildErrorHtml("Usuario de sesión no encontrado."), {
        status: 401,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // 3. Extraer y validar el client_id solicitado
    const clientId = req.nextUrl.searchParams.get("client_id");
    if (!clientId) {
      log.warn({ event: "auth.chatwoot_embed.missing_client_id", userId: user.id });
      return new NextResponse(buildErrorHtml("client_id is required"), {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (!UUID_REGEX.test(clientId)) {
      log.warn({ event: "auth.chatwoot_embed.invalid_client_id_format", userId: user.id, clientId });
      return new NextResponse(buildErrorHtml("El parámetro client_id debe ser un UUID válido."), {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // 4. Verificar que el cliente coincida con la membresía activa del usuario
    if (session.clientId !== clientId || user.activeClientId !== clientId) {
      log.warn({
        event: "auth.chatwoot_embed.client_mismatch",
        userId: user.id,
        sessionClientId: session.clientId,
        userActiveClientId: user.activeClientId,
        requestedClientId: clientId,
      });
      return new NextResponse(
        buildErrorHtml("El usuario no posee una membresía activa en el inquilino solicitado."),
        {
          status: 403,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            Pragma: "no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }

    // 5. Rate limiting en Redis (30 peticiones cada 15 min por usuario)
    try {
      const rateLimitDecision = await authRateLimiter.checkChatwootSsoRateLimit(user.id);
      if (!rateLimitDecision.allowed) {
        log.warn({
          event: "auth.chatwoot_embed.rate_limited",
          userId: user.id,
          retryAfter: rateLimitDecision.retryAfter,
        });
        return new NextResponse(
          buildErrorHtml("Demasiadas solicitudes de acceso a Chatwoot. Intente más tarde."),
          {
            status: 429,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store, no-cache, must-revalidate, private",
              Pragma: "no-cache",
              "X-Content-Type-Options": "nosniff",
              "Retry-After": String(rateLimitDecision.retryAfter),
            },
          },
        );
      }
    } catch (rlError) {
      if (rlError instanceof RedisUnavailableError) {
        log.error({ event: "auth.chatwoot_embed.redis_unavailable", userId: user.id });
        return new NextResponse(
          buildErrorHtml("Servicio de autenticación temporalmente no disponible."),
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store, no-cache, must-revalidate, private",
              Pragma: "no-cache",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
      throw rlError;
    }

    // 6. Emitir JWT de 5 minutos mediante AuthService
    const ssoResult = await authService.issueChatwootSso(user.id, clientId);
    if (!ssoResult.ok) {
      log.error({
        event: "auth.chatwoot_embed.issue_failed",
        userId: user.id,
        clientId,
        code: ssoResult.code,
      });

      const status =
        ssoResult.code === "SSO_SECRET_MISSING"
          ? 503
          : ssoResult.code === "ACCOUNT_NOT_ACTIVE"
            ? 403
            : 500;

      return new NextResponse(buildErrorHtml(ssoResult.error), {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const durationMs = Math.round(performance.now() - start);
    log.info({
      event: "auth.chatwoot_embed.issued",
      userId: user.id,
      clientId,
      expiresAt: ssoResult.data.expiresAt.toISOString(),
      durationMs,
    });

    // 7. Servir documento HTML auto-submit con Cache-Control: no-store y CSP restrictiva
    const chatwootBaseUrl = env.CHATWOOT_BASE_URL || "https://chat.mocter.co";
    const targetAction = `${chatwootBaseUrl}/auth/sso/callback`;
    const html = buildAutoSubmitHtml(targetAction, ssoResult.data.token);

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "frame-ancestors 'self' https://admin.mocter.co; script-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.chatwoot_embed.unhandled_error",
      error: serializeError(error),
      durationMs,
    });

    return new NextResponse(buildErrorHtml("Error interno del servidor."), {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
