import { NextRequest, NextResponse } from "next/server";
import { authService } from "@mocter/domain";

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
 * Endpoint de Confirmación de Verificación de Correo (AUTH-001 T-09).
 *
 * Canjea el token de un solo uso recibido vía POST (los escáneres de correo no ejecutan POST).
 * Marca `email_verified_at = now()` y consume el token atómicamente.
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/email/verify/confirm`
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isValidOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Origen no autorizado" },
      { status: 403 },
    );
  }

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Carga útil JSON inválida" },
      { status: 400 },
    );
  }

  if (typeof body?.token !== "string" || !body.token.trim()) {
    return NextResponse.json(
      { ok: false, error: "Token de verificación no proporcionado" },
      { status: 400 },
    );
  }

  const result = await authService.confirmEmailVerification(body.token.trim());

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        code: result.code,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: result.data.message,
      email: result.data.email,
    },
    { status: 200 },
  );
}
