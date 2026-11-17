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

const joinByCodeSchema = z.object({
  inviteCode: z.string().trim().min(4, "Código de invitación inválido.").max(40),
});

/**
 * `POST /api/tenant/community/organizations/join-by-code` — Ingreso directo a comunidad mediante código compartible (`SPEC-15-D05`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = joinByCodeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Código de invitación requerido.",
      "validation-error",
      "VALIDATION_ERROR",
    );
  }

  const service = getCommunitiesGovernanceService();
  const res = await service.joinByInviteCode({
    inviteCode: parsed.data.inviteCode,
    clientId: session.clientId,
    userId: session.userId,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
