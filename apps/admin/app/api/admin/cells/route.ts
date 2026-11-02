import { NextRequest, NextResponse } from "next/server";

const DEPRECATED_MESSAGE =
  "Este endpoint dejó de estar disponible. Usá la API protegida de apps/web (/api/admin/cells) con sesión, CSRF y origen admin.";

function deprecatedResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: DEPRECATED_MESSAGE, code: "DEPRECATED" },
    { status: 410 },
  );
}

/**
 * @deprecated Los endpoints de celdas en apps/admin quedan deshabilitados (410 Gone).
 * El listado y registro de celdas se realiza exclusivamente a través de la API
 * protegida en apps/web con validación de sesión, CSRF y permiso `cells.provision`.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  return deprecatedResponse();
}

/**
 * @deprecated Ver GET. No registra celdas.
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  return deprecatedResponse();
}
