import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  authService,
  assertCellProvisionAuthorization,
  cellMigrationService,
} from "@mocter/domain";
import { env } from "@/env";
import { isAdminOrigin } from "@/lib/origin";
import { getRequestLogger } from "@/lib/logger";

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
  if (!isAdminOrigin(req)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const log = await getRequestLogger();
  const origin = req.headers.get("origin") || env.NEXT_PUBLIC_ADMIN_URL;
  const { id: cellId } = await params;

  try {
    if (!isAdminOrigin(req)) {
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
    if (!sessionValidation.ok || !sessionValidation.data.user) {
      return NextResponse.json(
        { ok: false, error: "Sesión inválida.", code: "UNAUTHORIZED" },
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

    const migrationStatusRes = await cellMigrationService.getCellMigrationStatus(cellId);
    if (!migrationStatusRes.ok) {
      return NextResponse.json(
        { ok: false, error: migrationStatusRes.error, code: migrationStatusRes.code },
        { status: 400, headers: corsHeaders(origin) },
      );
    }

    return NextResponse.json(
      { ok: true, data: migrationStatusRes.data },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (error) {
    unstable_rethrow(error);
    const msg = error instanceof Error ? error.message : "Error al consultar estado de migraciones.";
    return NextResponse.json(
      { ok: false, error: msg, code: "MIGRATION_STATUS_ERROR" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

