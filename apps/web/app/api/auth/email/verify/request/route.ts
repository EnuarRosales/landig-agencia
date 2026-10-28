import { NextRequest, NextResponse } from "next/server";
import { authService } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";

// Rate limit: 10 peticiones por hora por IP (AUTH-001 §5.7)
const verifyRequestRateLimiter = new MemoryRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  const host = req.headers.get("host");
  try {
    const originUrl = new URL(origin);
    if (host && originUrl.host === host) {
      return true;
    }
    if (
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1" ||
      originUrl.hostname === "mocter.co" ||
      originUrl.hostname.endsWith(".mocter.co")
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Endpoint para solicitar reenvío de enlace de verificación de correo (AUTH-001 T-09).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/email/verify/request`
 * - Responde siempre HTTP 202 con mensaje genérico uniforme (anti-enumeración).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isValidOrigin(req)) {
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
    return NextResponse.json(
      { ok: false, error: "Carga útil JSON inválida" },
      { status: 400 },
    );
  }

  if (typeof body?.email !== "string") {
    return NextResponse.json(
      { ok: false, error: "El correo electrónico es requerido" },
      { status: 422 },
    );
  }

  const result = await authService.requestEmailVerification(body.email, { clientIp: ip });

  if (!result.ok) {
    if (result.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, message: result.data.message },
    { status: 202 },
  );
}
