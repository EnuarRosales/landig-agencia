import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunityFeedService, MAX_WALL_REPLY_CHARS } from "@mocter/domain";
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

const replyBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escribe una respuesta o emoji para enviar.")
    .max(MAX_WALL_REPLY_CHARS, `La respuesta supera el límite de ${MAX_WALL_REPLY_CHARS} caracteres.`),
});

/**
 * `POST /api/tenant/community/posts/[id]/replies` — Agrega una respuesta con texto y emojis
 * por cualquier miembro activo (`tenant_owner` o `tenant_agent`, `SPEC-15-D13`).
 */
export const POST = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId);
    if (!session.ok) return session.response;

    const params = await context.params;
    const paramParsed = paramSchema.safeParse(params);
    if (!paramParsed.success) {
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

    const rawBody = await req.json().catch(() => null);
    const bodyParsed = replyBodySchema.safeParse(rawBody);
    if (!bodyParsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        bodyParsed.error.issues[0]?.message || "Respuesta inválida.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunityFeedService().createReply({
      postId: paramParsed.data.id,
      authorClientId: session.clientId,
      authorUserId: session.userId,
      body: bodyParsed.data.body,
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
