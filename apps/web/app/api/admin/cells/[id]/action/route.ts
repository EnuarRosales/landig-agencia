import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  updateCellStatus,
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
  if (!isAdminOrigin(req)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * POST /api/admin/cells/[id]/action
 *
 * Ejecuta acciones operativas sobre el ciclo de vida de la celda (drain, maintenance, reactivate, draft).
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
      log.warn({ event: "cells.action.invalid_origin", cellId });
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
      return NextResponse.json(
        { ok: false, error: authCheck.error, code: "FORBIDDEN" },
        { status: 403, headers: corsHeaders(origin) },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    let targetStatus: "draining" | "maintenance" | "active" | "draft";
    if (action === "drain") {
      targetStatus = "draining";
    } else if (action === "maintenance") {
      targetStatus = "maintenance";
    } else if (action === "draft") {
      targetStatus = "draft";
    } else {
      return NextResponse.json(
        { ok: false, error: `Acción inválida: "${action}". Permitidas: drain, maintenance, draft.`, code: "INVALID_ACTION" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const updateResult = await updateCellStatus(cellId, targetStatus);
    if (!updateResult.ok) {
      const status = updateResult.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { ok: false, error: updateResult.error, code: updateResult.code },
        { status, headers: corsHeaders(origin) },
      );
    }

    log.info({
      event: "cells.action.success",
      cellId,
      newStatus: targetStatus,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: updateResult.data },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    const msg = error instanceof Error ? error.message : "Error al procesar acción.";
    log.error({
      event: "cells.action.unhandled_error",
      cellId,
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: msg, code: "ACTION_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
