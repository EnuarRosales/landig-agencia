import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  CellHandshakeService,
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
 * POST /api/admin/cells/[id]/handshake
 *
 * Ejecuta el Handshake de Verificación Dual 360° (DAT-001 §3.6.3).
 * Requiere sesión activa de Platform Owner con permiso `cells.provision` y CSRF.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: cellId } = await params;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cells.handshake.invalid_origin", cellId });
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

    const csrfToken = req.headers.get("x-csrf-token") ?? undefined;
    if (!csrfToken) {
      log.warn({ event: "cells.handshake.csrf_missing", cellId });
      return NextResponse.json(
        { ok: false, error: "Encabezado CSRF ausente.", code: "CSRF_MISSING" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    const sessionValidation = await authService.validateSession(sid, csrfToken);
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
        event: "cells.handshake.forbidden",
        userId: sessionValidation.data.user.id,
        cellId,
        error: authCheck.error,
      });
      return NextResponse.json(
        { ok: false, error: authCheck.error, code: "FORBIDDEN" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    const handshakeService = new CellHandshakeService();
    const result = await handshakeService.executeHandshake(cellId);

    log.info({
      event: "cells.handshake.executed",
      cellId,
      code: result.code,
      status: result.status,
      ok: result.ok,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: result.ok, data: result },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    const msg = error instanceof Error ? error.message : "Error al ejecutar handshake.";
    log.error({
      event: "cells.handshake.unhandled_error",
      cellId,
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: msg, code: "HANDSHAKE_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

