import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunityFeedService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../_shared";

const updateProfileSchema = z.object({
  sharePhone: z.boolean(),
  shareEmail: z.boolean(),
  shareAddress: z.boolean(),
  shareSocialLinks: z.boolean(),
});

/**
 * `GET /api/tenant/community/sharing-profile` — Consulta qué datos comparte este comercio con miembros de su comunidad (`SPEC-15`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId);
  if (!session.ok) return session.response;

  const service = getCommunityFeedService();
  const res = await service.getSharingProfileForClient(session.clientId);
  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `PATCH /api/tenant/community/sharing-profile` — Configura qué datos del comercio son visibles para otros miembros (`SPEC-15`).
 */
export const PATCH = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      "Preferencias de privacidad inválidas.",
      "validation-error",
      "VALIDATION_ERROR",
    );
  }

  const service = getCommunityFeedService();
  const res = await service.updateSharingProfile({
    clientId: session.clientId,
    actorUserId: session.userId,
    ...parsed.data,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
