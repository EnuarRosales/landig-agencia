import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  fetchAdminCells,
  createAdminCell,
  type CreateAdminCellInput,
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-csrf-token",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

/**
 * GET /api/admin/cells
 *
 * Lista las celdas del plano de control. Requiere sesión activa y autoridad
 * de Platform Owner con permiso `cells.provision`. No expone secretos.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cells.invalid_origin", path: "/api/admin/cells" });
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

    const cells = await fetchAdminCells();

    log.info({
      event: "cells.list_success",
      userId: sessionValidation.data.user.id,
      count: cells.length,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: cells },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    log.error({
      event: "cells.list_unhandled_error",
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
 * POST /api/admin/cells
 *
 * Registra una nueva celda en estado `draft`. Requiere:
 * - Origin exacto del subdominio admin.
 * - Sesión activa.
 * - Token CSRF vía encabezado `x-csrf-token`.
 * - Autoridad de Platform Owner con permiso `cells.provision`.
 *
 * Nunca confía en un actor o rol suministrado en JSON.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cells.invalid_origin", path: "/api/admin/cells" });
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
      log.warn({ event: "cells.csrf_missing", path: "/api/admin/cells" });
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Cuerpo JSON inválido.", code: "INVALID_JSON" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const input = body as Partial<CreateAdminCellInput>;
    if (!input.code || !input.pgbouncerHost || !input.databaseName || !input.appUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Código, host de PgBouncer, nombre de base de datos y URL de la aplicación celular son obligatorios.",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const result = await createAdminCell({
      code: input.code,
      tier: input.tier ?? "standard",
      topologyType: input.topologyType ?? "remote_vps",
      pgbouncerHost: input.pgbouncerHost,
      pgbouncerPort: input.pgbouncerPort,
      databaseName: input.databaseName,
      appUrl: input.appUrl,
      privateIp: input.privateIp,
      publicIp: input.publicIp,
      workingDir: input.workingDir,
      deployUser: input.deployUser,
      maxClients: input.maxClients,
      region: input.region,
      actorUserId: sessionValidation.data.user.id,
    });

    if (!result.ok) {
      const status = result.code === "FORBIDDEN" ? 403 : result.code === "VALIDATION_ERROR" ? 400 : 500;
      log.warn({
        event: "cells.create_failed",
        userId: sessionValidation.data.user.id,
        code: result.code,
        durationMs: Math.round(performance.now() - start),
      });
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status, headers: corsHeaders(origin) },
      );
    }

    log.info({
      event: "cells.create_success",
      userId: sessionValidation.data.user.id,
      cellId: result.data.id,
      code: result.data.code,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json(
      { ok: true, data: result.data },
      { status: 201, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    log.error({
      event: "cells.create_unhandled_error",
      error: serializeError(error),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
