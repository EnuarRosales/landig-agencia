import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  updateAdminCellHost,
  deleteAdminCellHost,
  type UpdateCellHostInput,
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
 * PATCH /api/admin/cell-hosts/[id]
 *
 * Modifica el estado o configuración de un host (CEL-RF-001).
 * Requiere sesión válida, token CSRF y permiso `cells.provision`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: hostId } = await params;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cell_hosts.update.invalid_origin", hostId });
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

    let body: Partial<UpdateCellHostInput>;
    try {
      body = (await req.json()) as Partial<UpdateCellHostInput>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Carga útil JSON inválida.", code: "INVALID_JSON" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const updateResult = await updateAdminCellHost(hostId, {
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
      event: "cell_hosts.update_success",
      hostId,
      userId: sessionValidation.data.user.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: updateResult.data },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (err) {
    unstable_rethrow(err);
    log.error({
      event: "cell_hosts.update_error",
      hostId,
      err: serializeError(err),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno al modificar el host.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

/**
 * DELETE /api/admin/cell-hosts/[id]
 *
 * Elimina un host si no tiene celdas de datos asignadas (CEL-RF-001).
 * Requiere sesión válida, token CSRF y permiso `cells.provision`.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: hostId } = await params;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cell_hosts.delete.invalid_origin", hostId });
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

    const deleteResult = await deleteAdminCellHost(hostId, sessionValidation.data.user.id);
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
      event: "cell_hosts.delete_success",
      hostId,
      userId: sessionValidation.data.user.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: deleteResult.data },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (err) {
    unstable_rethrow(err);
    log.error({
      event: "cell_hosts.delete_error",
      hostId,
      err: serializeError(err),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno al eliminar el host.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

