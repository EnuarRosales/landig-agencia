import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../../_shared";

const orgIdParamSchema = z.object({
  orgId: z.string().uuid("Identificador de comunidad inválido."),
});

/**
 * `POST /api/tenant/community/organizations/[orgId]/request-join` — Solicita unión a una comunidad descubrible (`SPEC-15`).
 */
export const POST = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ orgId: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const paramParsed = orgIdParamSchema.safeParse(params);
    if (!paramParsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        "Identificador de comunidad inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const service = getCommunitiesGovernanceService();
    const res = await service.requestJoin({
      organizationId: paramParsed.data.orgId,
      clientId: session.clientId,
      requestedByUserId: session.userId,
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
