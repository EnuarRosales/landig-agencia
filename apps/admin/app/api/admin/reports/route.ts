import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminPlatformReports,
  TenantCapabilityGateService,
  DrizzleTenantCapabilityGateRepository,
} from "@mocter/domain";

/**
 * Route Handler para métricas ejecutivas consolidadas y analítica global de plataforma (REP-001, CA-008, RN-007).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId =
    req.headers.get("x-client-id") || req.nextUrl?.searchParams?.get("clientId");

  if (clientId) {
    const gateService = new TenantCapabilityGateService(
      new DrizzleTenantCapabilityGateRepository(),
    );
    const check = await gateService.assertCapability(clientId, "reports");
    if (!check.ok) {
      return NextResponse.json(
        { ok: false, error: check.error, code: check.code },
        { status: 403 },
      );
    }
  }

  const reports = await fetchAdminPlatformReports();
  return NextResponse.json({ ok: true, data: reports });
}
