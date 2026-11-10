import { NextRequest, NextResponse } from "next/server";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const dashboard = await tenantWorkspaceService.getDashboard(auth.clientId);
    return NextResponse.json({ ok: true, data: dashboard }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[GET /api/tenant/dashboard Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al obtener el tablero.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

