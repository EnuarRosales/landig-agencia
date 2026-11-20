import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunityFeedService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../_shared";

const paramSchema = z.object({
  id: z.string().uuid("Identificador de publicación inválido."),
});

const patchBodySchema = z.object({
  body: z.string().max(24000, "El contenido enriquecido excede el tamaño máximo permitido."),
  bodyFormat: z.enum(["plain", "html"]).optional().default("html"),
  mediaId: z.string().uuid("Identificador de imagen inválido.").nullable().optional(),
  videoUrl: z.string().max(1024).nullable().optional(),
});

/**
 * `PATCH /api/tenant/community/posts/[id]` — Edita una publicación existente del muro
 * exclusiva para el comercio autor, actualizando texto enriquecido, enlaces, video o imagen (`SPEC-15-D11`, `D14`).
 */
export const PATCH = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const parsedParams = paramSchema.safeParse(params);
    if (!parsedParams.success) {
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
    const parsedBody = patchBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        parsedBody.error.issues[0]?.message ?? "Datos de edición de publicación inválidos.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunityFeedService().updatePost({
      postId: parsedParams.data.id,
      actorClientId: session.clientId,
      actorUserId: session.userId,
      body: parsedBody.data.body,
      bodyFormat: parsedBody.data.bodyFormat,
      mediaId: parsedBody.data.mediaId,
      videoUrl: parsedBody.data.videoUrl,
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
 * `DELETE /api/tenant/community/posts/[id]` — Elimina manualmente una publicación propia,
 * sus respuestas en cascada y restituye la cuota `storage_bytes` de su imagen (`SPEC-15-D14`).
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

    const res = await getCommunityFeedService().deletePost({
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
