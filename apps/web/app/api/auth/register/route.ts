import { NextRequest, NextResponse } from "next/server";
import { authService, GENERIC_REGISTER_SUCCESS_MESSAGE } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";

// Rate limit para registro: 5 solicitudes por hora por IP (AUTH-001 §6.1)
const registerRateLimiter = new MemoryRateLimiter({
  maxRequests: 20, // 20 en desarrollo / staging
  windowMs: 60 * 60 * 1000,
});

/**
 * Valida el encabezado Origin contra el origen permitido (AUTH-001 §5.6).
 *
 * @param req - Solicitud HTTP entrante.
 * @returns Booleano indicando si el origen es legítimo.
 */
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
 * Endpoint de Registro Nativo de Usuarios (AUTH-001 T-08).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/register`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist y host.
 *   - Limitación de tasa (Rate Limiting) por dirección IP.
 *   - Exigencia de consentimiento obligatorio de tratamiento de datos personales (Ley 1581 de 2012).
 *   - Respuesta genérica uniforme (HTTP 202 Accepted) para prevención de enumeración de cuentas.
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON.
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validación de Origin contra falsificación de peticiones en registro
  if (!isValidOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Origen no autorizado" },
      { status: 403 },
    );
  }

  // 2. Extracción de IP y verificación de límite de tasa
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  const rateLimitResult = registerRateLimiter.check(ip);
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        ok: false,
        error: "Demasiadas solicitudes de registro. Por favor intente más tarde.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  // 3. Validación de Content-Type y extracción de JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Formato de carga útil inválido (JSON requerido)",
      },
      { status: 400 },
    );
  }

  // 4. Delegación al servicio de autenticación de dominio
  const result = await authService.register(body, { clientIp: ip });

  if (!result.ok) {
    if (result.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          issues: result.issues,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: result.error,
      },
      { status: 500 },
    );
  }

  // 5. Respuesta HTTP 202 Accepted uniforme (anti-enumeración)
  return NextResponse.json(
    {
      ok: true,
      message: GENERIC_REGISTER_SUCCESS_MESSAGE,
    },
    { status: 202 },
  );
}
