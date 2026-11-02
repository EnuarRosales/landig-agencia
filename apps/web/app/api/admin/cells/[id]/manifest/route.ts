import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  CellManifestService,
  assertCellProvisionAuthorization,
} from "@mocter/domain";
import { env } from "@/env";
import { isAdminOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

const isProduction = env.NODE_ENV === "production";
const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";

function getSid(req: NextRequest): string | undefined {
  return req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-csrf-token",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * GET /api/admin/cells/[id]/manifest
 *
 * Genera el paquete declarativo de despliegue de la celda (.env y docker-compose.cell.yml).
 * Requiere sesión activa de Platform Owner con permiso `cells.provision`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: cellId } = await params;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cells.manifest.invalid_origin", cellId });
      return NextResponse.json(
        { ok: false, error: "Origen no autorizado.", code: "INVALID_ORIGIN" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    const sid = getSid(req);
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

    const authCheck = await assertCellProvisionAuthorization(sessionValidation.data.user.id);
    if (!authCheck.ok) {
      log.warn({
        event: "cells.manifest.forbidden",
        userId: sessionValidation.data.user.id,
        cellId,
        error: authCheck.error,
      });
      return NextResponse.json(
        { ok: false, error: authCheck.error, code: "FORBIDDEN" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    const manifestService = new CellManifestService();
    const manifest = await manifestService.generateManifest(cellId);

    log.info({
      event: "cells.manifest.generated",
      cellId,
      code: manifest.code,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: manifest },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    const msg = error instanceof Error ? error.message : "Error al generar manifiesto.";
    log.error({
      event: "cells.manifest.unhandled_error",
      cellId,
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: msg, code: "MANIFEST_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

