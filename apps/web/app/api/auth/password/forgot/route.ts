import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { isValidOrigin } from "@/lib/origin";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

// Rate limit: 10 solicitudes por hora por IP (AUTH-001 §5.8)
const forgotPasswordRateLimiter = new MemoryRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/**
 * Endpoint para solicitar recuperación de contraseña (AUTH-001 T-11, design §5.8).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/password/forgot`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Limitación de tasa (Rate Limiting) por dirección IP.
 *   - Anti-enumeración estricta: si el usuario no existe, está deshabilitado o es exclusivamente federado,
 *     responde siempre HTTP 202 con el mismo mensaje genérico uniforme sin emitir token.
 *   - Despacha correo transaccional vía {@link authService.forgotPassword}.
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON conteniendo `email`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/password/forgot" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const rateLimitResult = forgotPasswordRateLimiter.check(ip);
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
          error: "Demasiadas solicitudes. Por favor intente más tarde.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.validation_failed", reason: "malformed_json" });
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida" },
        { status: 400 },
      );
    }

    const pepper = env.AUTH_RATE_LIMIT_PEPPER;
    const result = await authService.forgotPassword(body, {
      clientIp: ip,
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
      log.error({
        event: "auth.forgot_password_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    log.info({
      event: "auth.forgot_password_processed",
      durationMs,
    });

    return NextResponse.json(
      { ok: true, message: result.data.message },
      { status: 202 },
    );
  } catch (e: unknown) {
    unstable_rethrow(e);
    log.error({
      event: "auth.forgot_password_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar la solicitud." },
      { status: 500 },
    );
  }
}
