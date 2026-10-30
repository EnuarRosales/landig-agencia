import { NextRequest, NextResponse } from "next/server";
import {
  authService,
  defaultAuthRepository,
  type SetupOwnerInputSchema,
} from "@mocter/domain";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";

/**
 * Endpoint de inicialización (bootstrap) del primer Platform Owner de Mocter (AUTH-001 T-27).
 *
 * - Método: POST
 * - Ruta: /api/auth/setup-owner
 * - Políticas aplicadas:
 *   - Verificación de encabezado Origin contra falsificación de peticiones.
 *   - Verificación de operadores de plataforma: si `countPlatformOperators() > 0`, responde 404 permanente.
 *   - Verificación de `SETUP_OWNER_TOKEN` en tiempo constante mediante `crypto.timingSafeEqual`.
 *   - Encriptación de contraseña con Argon2id y persistencia en Router Global con `identity_location = 'router'`.
 *   - Emisión de cookies de sesión segura (`mocter_sid`) y CSRF (`mocter_csrf`).
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    // 1. Validación de Origin contra falsificación de peticiones
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/setup-owner" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    // 2. Comprobación temprana de operadores (Sellado permanente con 404 si ya existen)
    const operatorCount = await defaultAuthRepository.countPlatformOperators();
    if (operatorCount > 0) {
      log.warn({
        event: "auth.setup_owner_already_completed",
        path: "/api/auth/setup-owner",
      });
      return NextResponse.json(
        { ok: false, error: "Recurso no encontrado" },
        { status: 404 },
      );
    }

    // 3. Lectura de carga útil
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Formato de solicitud inválido" },
        { status: 400 },
      );
    }

    // 4. Parámetros de contexto
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || undefined;
    const pepper = env.AUTH_RATE_LIMIT_PEPPER;

    // 5. Delegación al servicio de autenticación de dominio
    const result = await authService.setupInitialPlatformOwner(body as SetupOwnerInputSchema, {
      clientIp: ip,
      userAgent,
      pepper,
    });

    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      if (result.code === "SETUP_OWNER_ALREADY_COMPLETED") {
        return NextResponse.json(
          { ok: false, error: "Recurso no encontrado" },
          { status: 404 },
        );
      }

      if (result.code === "INVALID_SETUP_TOKEN") {
        log.warn({
          event: "auth.setup_owner_invalid_token",
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 401 },
        );
      }

      if (result.code === "VALIDATION_ERROR") {
        return NextResponse.json(
          { ok: false, error: result.error, issues: result.issues },
          { status: 400 },
        );
      }

      log.error({
        event: "auth.setup_owner_failed",
        code: result.code,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    // 6. Configuración de cookies de sesión
    log.info({
      event: "auth.setup_owner_success",
      userId: result.data.user.id,
      durationMs,
    });

    const isProduction = env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

    const response = NextResponse.json(
      {
        ok: true,
        data: {
          user: result.data.user,
          expiresAt: result.data.expiresAt,
        },
      },
      { status: 201 },
    );

    response.cookies.set(sidCookieName, result.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200, // 12 horas
    });

    response.cookies.set(csrfCookieName, result.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });

    return response;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    log.error({
      event: "auth.setup_owner_error",
      durationMs,
      error,
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
