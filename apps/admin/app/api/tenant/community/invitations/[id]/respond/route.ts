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

const paramSchema = z.object({ id: z.string().uuid("Identificador de invitación inválido.") });
const bodySchema = z.object({ decision: z.enum(["accepted", "rejected"]) });

/**
 * `POST /api/tenant/community/invitations/[id]/respond` — Acepta o rechaza una invitación a comunidad (`SPEC-15`).
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
    const p = paramSchema.safeParse(params);
    if (!p.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Identificador inválido.", "validation-error", "VALIDATION_ERROR");
    }

    const rawBody = await req.json().catch(() => null);
    const b = bodySchema.safeParse(rawBody);
    if (!b.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Decisión inválida.", "validation-error", "VALIDATION_ERROR");
    }

    const service = getCommunitiesGovernanceService();
    const res = await service.respondInvitation({
      invitationId: p.data.id,
      clientId: session.clientId,
      userId: session.userId,
      decision: b.data.decision,
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
