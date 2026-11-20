import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { resolveAdminPublicOrigin } from "@/lib/resolve-admin-origin";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../../_shared";

const paramSchema = z.object({
  id: z.string().uuid("Identificador de invitación inválido."),
});

/**
 * `POST /api/tenant/community/invitations/[id]/resend` — Reenvía la notificación (`community.invited`)
 * de una invitación pendiente vigente hacia el comercio destinatario (`RN-SPEC-15-13`).
 */
export const POST = handle(
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

    const res = await getCommunitiesGovernanceService().resendInvitationNotification({
      invitationId: parsed.data.id,
      actorClientId: session.clientId,
      actorUserId: session.userId,
      baseUrl: resolveAdminPublicOrigin(req),
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
