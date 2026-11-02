import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { env } from "@/env";
import { isAdminOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

const isProduction = env.NODE_ENV === "production";
const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
const csrfCookieName = isProduction ? "__Host-mocter_csrf" : "mocter_csrf";

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

/**
 * GET /api/auth/csrf
 *
 * Devuelve el token CSRF de la sesión activa para que el subdominio admin
 * pueda realizar mutaciones contra las APIs protegidas de `apps/web`.
 *
 * Requiere:
 * - Origin exacto del subdominio admin.
 * - Cookie de sesión `mocter_sid` válida.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "csrf.invalid_origin", path: "/api/auth/csrf" });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;
    if (!sid) {
      return NextResponse.json(
        { ok: false, error: "Sesión requerida.", code: "UNAUTHORIZED" },
        { status: 401, headers: corsHeaders(origin) },
      );
    }

    const sessionValidation = await authService.validateSession(sid);
    if (!sessionValidation.ok) {
      const status = sessionValidation.code === "FORBIDDEN" ? 403 : 401;
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status, headers: corsHeaders(origin) },
      );
    }
    if (!sessionValidation.data.user) {
      return NextResponse.json(
        { ok: false, error: "Sesión no encontrada o revocada.", code: "UNAUTHORIZED" },
        { status: 401, headers: corsHeaders(origin) },
      );
    }

    const csrfToken = req.cookies.get(csrfCookieName)?.value || req.cookies.get("mocter_csrf")?.value;
    if (!csrfToken) {
      log.warn({ event: "csrf.cookie_missing", userId: sessionValidation.data.user.id });
      return NextResponse.json(
        { ok: false, error: "Token CSRF no disponible.", code: "CSRF_UNAVAILABLE" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    log.info({
      event: "csrf.delivered",
      userId: sessionValidation.data.user.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, csrfToken },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    log.error({
      event: "csrf.unhandled_error",
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
