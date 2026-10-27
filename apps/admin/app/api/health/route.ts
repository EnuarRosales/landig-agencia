import { NextResponse } from "next/server";

/**
 * Route Handler de salud del shell administrativo.
 *
 * Utilizado por `HEALTHCHECK` de Docker y por el router de Traefik.
 * No verifica dependencias: el shell no consulta base de datos.
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/health`
 * - **Respuesta:** `200 OK` con `{ "status": "ok" }`.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
