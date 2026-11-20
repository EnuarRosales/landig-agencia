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

const paramSchema = z.object({
  id: z.string().uuid("Identificador de publicación inválido."),
});

/**
 * `POST /api/tenant/community/posts/[id]/pin` — Fija una publicación en primer lugar dentro de su comunidad
 * (reemplazando automáticamente cualquier fijación previa, `SPEC-15-D12`).
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
        "Identificador de publicación inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunityFeedService().pinPost({
      postId: parsed.data.id,
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

/**
 * `DELETE /api/tenant/community/posts/[id]/pin` — Desfija una publicación del muro (`SPEC-15-D12`).
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
        "Identificador de publicación inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunityFeedService().unpinPost({
      postId: parsed.data.id,
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
