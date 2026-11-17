import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../../../../_shared";

const paramsSchema = z.object({
  orgId: z.string().uuid("Identificador de comunidad inválido."),
  clientId: z.string().uuid("Identificador de comercio inválido."),
});

/**
 * `POST /api/tenant/community/organizations/[orgId]/members/[clientId]/promote` — Propone promoción a co-líder (`SPEC-15`).
 */
export const POST = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ orgId: string; clientId: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        "Parámetros de comunidad o miembro inválidos.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const service = getCommunitiesGovernanceService();
    const res = await service.promoteMemberToCoLeader({
      organizationId: parsed.data.orgId,
      originatorClientId: session.clientId,
      targetClientId: parsed.data.clientId,
      promotedByUserId: session.userId,
    });

    if (!res.ok) {
      return domainFailureToProblem(req, requestId, res.code, res.error);
    }

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  },
);
