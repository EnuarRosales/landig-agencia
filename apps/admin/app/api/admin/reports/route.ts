import { NextResponse } from "next/server";
import { fetchAdminPlatformReports } from "@mocter/domain";

/**
 * Route Handler para métricas ejecutivas consolidadas y analítica global de plataforma (REP-001).
 */
export async function GET(): Promise<NextResponse> {
  const reports = await fetchAdminPlatformReports();
  return NextResponse.json({ ok: true, data: reports });
}
