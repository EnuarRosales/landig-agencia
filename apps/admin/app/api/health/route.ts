import { NextResponse } from "next/server";
import { S3StorageService } from "@mocter/domain";

export const dynamic = "force-dynamic";

const s3HealthProbe = new S3StorageService();

/**
 * Route Handler de salud del shell administrativo (`SPEC-00 §9.2`).
 *
 * Utilizado por `HEALTHCHECK` de Docker y por el router de Traefik.
 * Ejecuta una sonda no bloqueante de conectividad hacia SeaweedFS S3 sin exponer secretos.
 *
 * - **Método:** `GET`
 * - **Ruta:** `/api/health`
 * - **Respuesta:** `200 OK` con `{ "status": "ok", "mediaStorage": "ok" | "degraded" }`.
 */
export async function GET(): Promise<NextResponse> {
  const mediaStorage = await s3HealthProbe.checkConnectivity(1_500);
  return NextResponse.json({ status: "ok", mediaStorage });
}
