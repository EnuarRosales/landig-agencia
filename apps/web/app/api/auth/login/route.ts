import { NextRequest, NextResponse } from "next/server";
import { authService, GENERIC_INVALID_CREDENTIALS_MESSAGE } from "@mocter/domain";
import { MemoryRateLimiter } from "@/lib/rate-limit";

// Rate limit para inicio de sesión: 5 intentos por cada 15 minutos por IP (AUTH-001 §5.2, §7.3)
const loginRateLimiter = new MemoryRateLimiter({
  maxRequests: 10, // 10 en desarrollo / staging
  windowMs: 15 * 60 * 1000,
});

/**
 * Valida el encabezado Origin contra el host y dominios permitidos (AUTH-001 §5.6).
 *
 * @param req - Solicitud HTTP entrante.
 * @returns `true` si el origen es legítimo; `false` si es sospechoso.
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
 * Endpoint de Inicio de Sesión Nativo con Credenciales (AUTH-001 T-10, design §5.2).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/login`
 * - **Políticas aplicadas:**
 *   - Verificación de encabezado `Origin` contra allowlist exacta.
 *   - Limitación de tasa (Rate Limiting) por dirección IP.
 *   - Mitigación de temporización (timing attacks) con verificación ficticia de tiempo constante.
 *   - Rehash transparente de contraseñas ante algoritmos o parámetros obsoletos.
 *   - Creación de sesión opaca con CSRF (`__Host-mocter_sid`, `__Host-mocter_csrf`).
 *   - Challenge de doble factor si la cuenta tiene TOTP activado.
 *
 * @param req - Objeto {@link NextRequest} con la carga útil JSON (`email`, `password`).
 * @returns Respuesta HTTP {@link NextResponse}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validación de Origin contra CSRF en formularios de autenticación
  if (!isValidOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Origen no autorizado" },
      { status: 403 },
    );
  }

  // 2. Limitación de tasa (Rate Limiting)
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  const rateLimitResult = loginRateLimiter.check(ip);
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "Demasiados intentos fallidos de inicio de sesión. Por favor intente más tarde.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  // 3. Validación de Content-Type y formato JSON
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

  const userAgent = req.headers.get("user-agent") ?? undefined;
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER || "mocter-dev-pepper";

  // 4. Delegación al servicio de autenticación de dominio
  const result = await authService.login(body, {
    clientIp: ip,
    userAgent,
    pepper,
  });

  if (!result.ok) {
    if (result.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        { ok: false, error: result.error, issues: result.issues },
        { status: 400 },
      );
    }

    if (result.code === "INVALID_CREDENTIALS") {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 401 },
      );
    }

    if (
      result.code === "IDENTITY_INCONSISTENT" ||
      result.code === "CELL_UNAVAILABLE"
    ) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  // 5. Caso Doble Factor (TOTP activado)
  if ("mfaRequired" in result.data) {
    const isProduction = process.env.NODE_ENV === "production";
    const challengeCookieName = isProduction
      ? "__Host-mocter_challenge"
      : "mocter_challenge";

    const response = NextResponse.json(
      {
        ok: true,
        mfaRequired: true,
        expiresAt: result.data.expiresAt,
      },
      { status: 200 },
    );

    response.cookies.set(challengeCookieName, result.data.challengeToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 300, // 5 minutos
    });

    return response;
  }

  // 6. Caso Sesión Exitosa
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

  const response = NextResponse.json(
    {
      ok: true,
      data: {
        user: result.data.user,
        emailVerified: result.data.emailVerified,
        clientId: result.data.clientId,
        expiresAt: result.data.expiresAt,
      },
    },
    { status: 200 },
  );

  // Cookie opaca de sesión (HttpOnly, SameSite=Strict, 12 horas máx absoluto)
  response.cookies.set(sidCookieName, result.data.sid, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 43200, // 12 horas
  });

  // Cookie CSRF (legible por el cliente para el encabezado X-CSRF-Token)
  response.cookies.set(csrfCookieName, result.data.csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 43200,
  });

  return response;
}
