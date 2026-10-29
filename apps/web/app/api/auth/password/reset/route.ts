import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { isValidOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

// Rate limit: 10 intentos por cada 15 minutos por IP (AUTH-001 §5.8)
const resetPasswordRateLimiter = new MemoryRateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
});

/**
 * Endpoint para restablecer o establecer la contraseña de una cuenta (AUTH-001 T-11, design §5.8).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/password/reset`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist.
 *   - Limitación de tasa (Rate Limiting) por dirección IP.
 *   - Consumo único del token con invalidación de sesiones previas (`password_reset`).
 *   - No inicia sesión automáticamente; el usuario debe redirigirse al login.
 *
 * @param req - Objeto {@link NextRequest} con JSON `{ token, password }`.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/password/reset" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const rateLimitResult = resetPasswordRateLimiter.check(ip);
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
          error: "Demasiados intentos. Por favor intente más tarde.",
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

    const result = await authService.resetPassword(body);
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

      if (
        result.code === "INVALID_TOKEN" ||
        result.code === "TOKEN_ALREADY_USED" ||
        result.code === "TOKEN_EXPIRED" ||
        result.code === "PASSWORD_ALREADY_EXISTS" ||
        result.code === "NO_NATIVE_PASSWORD" ||
        result.code === "USER_NOT_FOUND"
      ) {
        log.warn({
          event: "auth.reset_password_failed",
          code: result.code,
          durationMs,
        });
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 400 },
        );
      }

      log.error({
        event: "auth.reset_password_error",
        error: result.error,
        durationMs,
      });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    log.info({
      event: "auth.password_reset_successfully",
      durationMs,
    });

    return NextResponse.json(
      { ok: true, message: result.data.message },
      { status: 200 },
    );
  } catch (e: unknown) {
    unstable_rethrow(e);
    log.error({
      event: "auth.reset_password_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar el cambio de contraseña." },
      { status: 500 },
    );
  }
}
