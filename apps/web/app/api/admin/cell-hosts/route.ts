import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  fetchAdminCellHosts,
  createAdminCellHost,
  type CreateCellHostInput,
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

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * GET /api/admin/cell-hosts
 *
 * Lista los hosts registrados en el Plano de Control para el placement de celdas (CEL-RF-001).
 * Requiere sesión activa y autoridad de Platform Owner.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cell_hosts.invalid_origin", path: "/api/admin/cell-hosts" });
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
      return NextResponse.json(
        { ok: false, error: sessionValidation.error, code: sessionValidation.code },
        { status: 401, headers: corsHeaders(origin) },
      );
    }

    const hosts = await fetchAdminCellHosts();

    log.info({
      event: "cell_hosts.list_success",
      count: hosts.length,
      userId: sessionValidation.data.user?.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json({ ok: true, data: hosts }, { status: 200, headers: corsHeaders(origin) });
  } catch (err) {
    unstable_rethrow(err);
    log.error({
      event: "cell_hosts.list_error",
      err: serializeError(err),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno al consultar los hosts de celdas.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

/**
 * POST /api/admin/cell-hosts
 *
 * Registra un nuevo host para placement explícito de celdas (CEL-RF-001).
 * Requiere sesión válida, token CSRF y permiso `cells.provision`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();
  const start = performance.now();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;

  try {
    if (!isAdminOrigin(req)) {
      log.warn({ event: "cell_hosts.create.invalid_origin", path: "/api/admin/cell-hosts" });
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
      log.warn({ event: "cell_hosts.csrf_missing", path: "/api/admin/cell-hosts" });
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

    const input = body as Partial<CreateCellHostInput>;
    if (!input.code || !input.deploymentProfile || !input.connectivityConfigRef) {
      return NextResponse.json(
        {
          ok: false,
          error: "Código, perfil de despliegue y referencia de configuración de conectividad son obligatorios.",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    const result = await createAdminCellHost({
      code: input.code,
      deploymentProfile: input.deploymentProfile,
      status: input.status,
      connectivityConfigRef: input.connectivityConfigRef,
      actorUserId: sessionValidation.data.user.id,
    });

    if (!result.ok) {
      const status = result.code === "FORBIDDEN" ? 403 : result.code === "VALIDATION_ERROR" || result.code === "DUPLICATE_CODE" ? 400 : 500;
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status, headers: corsHeaders(origin) },
      );
    }

    log.info({
      event: "cell_hosts.create_success",
      hostId: result.data.id,
      code: result.data.code,
      userId: sessionValidation.data.user.id,
      durationMs: Math.round(performance.now() - start),
    });

    return NextResponse.json({ ok: true, data: result.data }, { status: 201, headers: corsHeaders(origin) });
  } catch (err) {
    unstable_rethrow(err);
    log.error({
      event: "cell_hosts.create_error",
      err: serializeError(err),
      durationMs: Math.round(performance.now() - start),
    });
    return NextResponse.json(
      { ok: false, error: "Error interno al registrar host.", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

