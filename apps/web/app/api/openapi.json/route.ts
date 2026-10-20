import { NextResponse } from "next/server";
import { getOpenApiSpec } from "../../../lib/openapi";

/**
 * Route Handler que expone la especificación OpenAPI 3.1 en formato JSON estándar.
 *
 * Consumido por visores interactivos (Swagger UI, Scalar, Redoc), generadores de clientes SDK
 * y herramientas de pruebas de integración como Postman o Insomnia.
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/openapi.json`
 * - **Cabeceras:** `Content-Type: application/json`
 *
 * @returns Respuesta HTTP {@link NextResponse} con el documento OpenAPI serializado.
 */
export async function GET(): Promise<NextResponse> {
  const spec = getOpenApiSpec();

  return NextResponse.json(spec, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
