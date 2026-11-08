import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { checkDatabaseConnection } from "@mocter/domain";
import { getRequestLogger } from "@/lib/logger";

/**
 * Route Handler para monitoreo de salud del sistema (Healthcheck) y Handshake Celular (CEL-RF-013).
 *
 * En modo celular (o cuando HANDSHAKE_SECRET está configurado):
 * - Valida en tiempo constante mediante {@link crypto.timingSafeEqual} la cabecera `X-Mocter-Handshake-Secret`.
 * - Rechaza con 401 Unauthorized si el secreto es inválido o no coincide.
 *
 * Utilizado por contenedores Docker (`HEALTHCHECK`), balanceadores Traefik, sondas de Kubernetes y el Handshake 360°.
 *
 * @param request - Solicitud HTTP entrante con cabeceras de handshake.
 * @returns Respuesta HTTP {@link NextResponse} en formato JSON con estado y latencia de conexión.
 */
export async function GET(request?: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const configuredSecret = process.env.HANDSHAKE_SECRET;
  const incomingSecret = request?.headers?.get("x-mocter-handshake-secret");

  // Validación de Handshake Secret en tiempo constante (CEL-RF-013)
  if (configuredSecret) {
    if (!incomingSecret) {
      log.warn({ event: "sys.healthcheck_missing_handshake_secret" });
      return NextResponse.json(
        { error: "Unauthorized: Cabecera X-Mocter-Handshake-Secret requerida" },
        { status: 401 },
      );
    }

    const incBuf = Buffer.from(incomingSecret);
    const expBuf = Buffer.from(configuredSecret);
    const isMatch = incBuf.length === expBuf.length && crypto.timingSafeEqual(incBuf, expBuf);

    if (!isMatch) {
      log.warn({ event: "sys.healthcheck_invalid_handshake_secret" });
      return NextResponse.json(
        { error: "Unauthorized: Secreto de handshake celular inválido" },
        { status: 401 },
      );
    }
  }

  const dbHealth = await checkDatabaseConnection();
  const status = dbHealth.ok ? 200 : 503;

  if (!dbHealth.ok) {
    log.warn({
      event: "sys.healthcheck_unhealthy",
      latencyMs: dbHealth.latencyMs,
      dbError: dbHealth.error,
    });
  }

  return NextResponse.json(
    {
      status: dbHealth.ok ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      mode: process.env.CELL_CODE ? "cell" : "control_plane",
      cellCode: process.env.CELL_CODE ?? null,
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
