import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../_shared";

const leaderRequestSchema = z.object({
  proposedCommunityName: z
    .string()
    .trim()
    .min(3, "El nombre propuesto de comunidad debe tener al menos 3 caracteres.")
    .max(255),
  businessModel: z
    .string()
    .trim()
    .min(10, "Describe brevemente el modelo de negocio de tu comunidad (mínimo 10 caracteres).")
    .max(2000),
});

/**
 * `POST /api/tenant/community/leader-request` — Envía solicitud de habilitación como Líder de Comunidad (`SPEC-15-D03`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = leaderRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos inválidos en la solicitud de líder.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const service = getCommunitiesGovernanceService();
  const res = await service.requestLeaderAuthorization({
    clientId: session.clientId,
    requestedByUserId: session.userId,
    proposedCommunityName: parsed.data.proposedCommunityName,
    businessModel: parsed.data.businessModel,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
