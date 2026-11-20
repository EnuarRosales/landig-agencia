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
  mediaId: z.string().uuid("Identificador de imagen inválido."),
});

/**
 * `GET /api/tenant/community/posts/media/[mediaId]` — Entrega autenticada de la imagen de una publicación
 * verificando membresía activa del comercio en la comunidad (`SPEC-15-D11`).
 */
export const GET = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ mediaId: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId);
    if (!session.ok) return session.response;

    const params = await context.params;
    const parsed = paramSchema.safeParse(params);
    if (!parsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        "Identificador de imagen inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunityFeedService().getAuthorizedWallMediaBinary({
      clientId: session.clientId,
      mediaId: parsed.data.mediaId,
    });

    if (!res.ok) {
      return domainFailureToProblem(req, requestId, res.code, res.error);
    }

    return new NextResponse(new Uint8Array(res.data.buffer), {
      status: 200,
      headers: {
        "Content-Type": res.data.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "x-request-id": requestId,
      },
    });
  },
);

/**
 * `DELETE /api/tenant/community/posts/media/[mediaId]` — Libera una imagen aún no publicada devolviendo cuota `storage_bytes`.
 */
export const DELETE = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ mediaId: string }> },
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
        "Identificador de imagen inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const res = await getCommunityFeedService().discardUnattachedWallMedia({
      clientId: session.clientId,
      mediaId: parsed.data.mediaId,
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
