import { NextRequest, NextResponse } from "next/server";
import { leadService } from "@mocter/domain";
import { checkRateLimit } from "../../../lib/rate-limit";


/**
 * Route Handler REST para la recepción pública de solicitudes de prospectos (leads).
 *
 * Expone un contrato HTTP estándar para clientes externos, aplicaciones móviles y webhooks.
 * Aplica limitación de tasa (Rate Limiting) por dirección IP antes de delegar la validación
 * y persistencia a {@link leadService}.
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/leads`
 * - **Cabeceras:** `Content-Type: application/json`
 * - **Respuestas:**
 *   - `201 Created`: Lead registrado satisfactoriamente (`{ ok: true }`). Confirmación de persistencia.
 *   - `400 Bad Request`: JSON malformado o error de validación en campos obligatorios (nombre, correo, teléfono).
 *   - `429 Too Many Requests`: La IP excedió la tasa permitida (10 req/min). Incluye cabecera `Retry-After`.
 *   - `500 Internal Server Error`: Fallo interno de base de datos o conectividad.
 *
 * @param req - Objeto de solicitud HTTP {@link NextRequest}.
 * @returns Respuesta HTTP {@link NextResponse} en formato JSON.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Extracción de IP y verificación de límite de tasa
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  const rateLimitResult = checkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        ok: false,
        error: "Rate limit exceeded. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  // 2. Extracción y análisis de la carga JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON payload",
      },
      { status: 400 },
    );
  }

  // 3. Procesamiento y persistencia mediante LeadService
  const result = await leadService.registerLead(body);

  if (!result.ok) {
    const status = result.code === "VALIDATION_ERROR" ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        code: result.code,
        ...(result.issues ? { issues: result.issues } : {}),
      },
      { status },
    );
  }

  return NextResponse.json(
    {
      ok: true,
    },
    { status: 201 },
  );
}
