import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { isValidOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

// Rate limit: 10 peticiones por hora por IP (AUTH-001 §5.7)
const verifyRequestRateLimiter = new MemoryRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/**
 * Endpoint para solicitar reenvío de enlace de verificación de correo (AUTH-001 T-09).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/email/verify/request`
 * - Responde siempre HTTP 202 con mensaje genérico uniforme (anti-enumeración).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();

  try {
    if (!isValidOrigin(req)) {
      log.warn({ event: "auth.invalid_origin", path: "/api/auth/email/verify/request" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado" },
        { status: 403 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const rateLimitResult = verifyRequestRateLimiter.check(ip);
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000));
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

    let body: { email?: unknown };
    try {
      body = await req.json();
    } catch {
      log.warn({ event: "auth.validation_failed", reason: "malformed_json" });
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida" },
        { status: 400 },
      );
    }

    if (typeof body?.email !== "string") {
      log.warn({ event: "auth.validation_failed", reason: "missing_email" });
      return NextResponse.json(
        { ok: false, error: "El correo electrónico es requerido" },
        { status: 422 },
      );
    }

    const result = await authService.requestEmailVerification(body.email, { clientIp: ip });
    const durationMs = Math.round(performance.now() - start);

    if (!result.ok) {
      if (result.code === "VALIDATION_ERROR") {
        log.warn({ event: "auth.validation_failed", durationMs });
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 422 },
        );
      }
      log.error({ event: "auth.email_verify_request_error", error: result.error, durationMs });
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    log.info({ event: "auth.email_verify_request_dispatched", durationMs });

    return NextResponse.json(
      { ok: true, message: result.data.message },
      { status: 202 },
    );
  } catch (e: unknown) {
    unstable_rethrow(e);
    log.error({
      event: "auth.email_verify_request_unhandled_error",
      err: serializeError(e),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor al procesar la solicitud." },
      { status: 500 },
    );
  }
}
