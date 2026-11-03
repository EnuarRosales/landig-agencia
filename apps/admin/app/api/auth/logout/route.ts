import { NextRequest, NextResponse } from "next/server";
import { authService } from "@mocter/domain";

/**
 * Route Handler para revocar la sesión activa del operador en mocter-admin (AUTH-001 §5.6, T-23).
 *
 * Petición: POST /api/auth/logout
 * Revoca la sesión en Redis y PostgreSQL, y purga todas las cookies de sesión en la respuesta.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const isProduction = process.env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;

    if (sid) {
      await authService.revokeSession(sid, "user_logout");
    }

    const response = NextResponse.json(
      { ok: true, message: "Sesión cerrada exitosamente." },
      { status: 200 },
    );

    // Limpieza de cookies de autenticación
    const cookieNames = [
      "__Host-mocter_sid",
      "mocter_sid",
      "__Host-mocter_csrf",
      "mocter_csrf",
    ];

    for (const name of cookieNames) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: msg || "Error interno al cerrar sesión.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

