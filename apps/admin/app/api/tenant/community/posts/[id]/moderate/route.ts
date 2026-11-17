import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunityFeedService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../../_shared";

const paramSchema = z.object({ id: z.string().uuid("Identificador de publicación inválido.") });
const bodySchema = z.object({
  action: z.enum(["approve", "reject", "hide"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * `POST /api/tenant/community/posts/[id]/moderate` — Aprueba, rechaza u oculta una publicación del muro (`SPEC-15`).
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
      return communityProblemJson(req, requestId, 400, "Validation Error", "Acción de moderación inválida.", "validation-error", "VALIDATION_ERROR");
    }

    const service = getCommunityFeedService();
    const res = await service.moderatePost({
      postId: p.data.id,
      actorClientId: session.clientId,
      actorUserId: session.userId,
      action: b.data.action,
      reason: b.data.reason,
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
