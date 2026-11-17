import { NextRequest, NextResponse } from "next/server";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../_shared";

/**
 * `GET /api/tenant/community/overview` — Estado integral de comunidades, membresías, autorizaciones e invitaciones (`SPEC-15`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId);
  if (!session.ok) return session.response;

  const service = getCommunitiesGovernanceService();
  const res = await service.getTenantOverview(session.clientId);
  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
