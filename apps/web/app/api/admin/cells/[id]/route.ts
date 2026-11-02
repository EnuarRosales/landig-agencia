import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  updateAdminCell,
  deleteAdminCell,
  type UpdateAdminCellInput,
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
    "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
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
 * PATCH /api/admin/cells/[id]
 *
 * Modifica los atributos operativos o de red de una célula existente (DAT-001 §3.3).
 * Requiere sesión válida, token CSRF y permisos de Platform Owner.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: cellId } = await params;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cells.update.invalid_origin", cellId });
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
      log.warn({ event: "cells.update.csrf_missing", cellId });
      return NextResponse.json(
        { ok: false, error: "Token CSRF requerido.", code: "CSRF_REQUIRED" },
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

    let body: Partial<UpdateAdminCellInput>;
    try {
      body = (await req.json()) as Partial<UpdateAdminCellInput>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida.", code: "INVALID_JSON" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const updateResult = await updateAdminCell(cellId, {
      ...body,
      actorUserId: sessionValidation.data.user.id,
    });

    if (!updateResult.ok) {
      const status =
        updateResult.code === "NOT_FOUND"
          ? 404
          : updateResult.code === "FORBIDDEN"
            ? 403
            : 400;
      return NextResponse.json(
        { ok: false, error: updateResult.error, code: updateResult.code },
        { status, headers: corsHeaders(origin) },
      );
    }

    log.info({
      event: "cells.update_success",
      cellId,
      userId: sessionValidation.data.user.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: updateResult.data },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    log.error({
      event: "cells.update_unhandled_error",
      cellId,
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

/**
 * DELETE /api/admin/cells/[id]
 *
 * Elimina una célula de datos si no tiene inquilinos activos ni rutas asociadas.
 * Requiere sesión válida, token CSRF y permisos de Platform Owner.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: cellId } = await params;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cells.delete.invalid_origin", cellId });
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
      log.warn({ event: "cells.delete.csrf_missing", cellId });
      return NextResponse.json(
        { ok: false, error: "Token CSRF requerido.", code: "CSRF_REQUIRED" },
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

    const deleteResult = await deleteAdminCell(cellId, sessionValidation.data.user.id);

    if (!deleteResult.ok) {
      const status =
        deleteResult.code === "NOT_FOUND"
          ? 404
          : deleteResult.code === "FORBIDDEN"
            ? 403
            : 400;
      return NextResponse.json(
        { ok: false, error: deleteResult.error, code: deleteResult.code },
        { status, headers: corsHeaders(origin) },
      );
    }

    log.info({
      event: "cells.delete_success",
      cellId,
      code: deleteResult.data.code,
      userId: sessionValidation.data.user.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, message: `Célula ${deleteResult.data.code} eliminada exitosamente.`, data: deleteResult.data },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    log.error({
      event: "cells.delete_unhandled_error",
      cellId,
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
