import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../_shared";

const paramSchema = z.object({
  id: z.string().uuid("Identificador de invitación inválido."),
});

/**
 * `DELETE /api/tenant/community/invitations/[id]` — Cancela (revoca) una invitación pendiente
 * enviada por el comercio creador de la comunidad (`RN-SPEC-15-13`).
 */
export const DELETE = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const parsed = paramSchema.safeParse(params);
    if (!parsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        "Identificador de invitación inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunitiesGovernanceService().revokeInvitation({
      invitationId: parsed.data.id,
      actorClientId: session.clientId,
      actorUserId: session.userId,
    });

    if (!res.ok) {
      return domainFailureToProblem(req, requestId, res.code, res.error);
    }

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
