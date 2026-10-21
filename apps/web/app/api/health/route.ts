import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@mocter/domain";


/**
 * Route Handler para monitoreo de salud del sistema (Healthcheck).
 *
 * Utilizado por contenedores Docker (`HEALTHCHECK`), balanceadores Traefik y sondas de Kubernetes (Liveness/Readiness).
 * Ejecuta una comprobación efectiva contra PostgreSQL llamando a {@link checkDatabaseConnection}.
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/health`
 * - **Respuestas:**
 *   - `200 OK`: La aplicación y la base de datos están operativas y saludables.
 *   - `503 Service Unavailable`: La base de datos es inaccesible o falló la verificación.
 *
 * @returns Respuesta HTTP {@link NextResponse} en formato JSON con estado y latencia de conexión.
 */
export async function GET(): Promise<NextResponse> {
  const dbHealth = await checkDatabaseConnection();
  const status = dbHealth.ok ? 200 : 503;

  return NextResponse.json(
    {
      status: dbHealth.ok ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbHealth.ok ? "up" : "down",
          latencyMs: dbHealth.latencyMs,
          ...(dbHealth.error ? { error: dbHealth.error } : {}),
        },
      },
    },
    { status },
  );
}
