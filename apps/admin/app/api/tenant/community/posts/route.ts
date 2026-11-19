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

const listPostsQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const createPostSchema = z.object({
  organizationId: z.string().uuid("Identificador de comunidad inválido."),
  body: z
    .string()
    .trim()
    .min(2, "Escribe un mensaje para compartir en el muro.")
    .max(4000, "La publicación excede el límite de 4000 caracteres."),
});

/**
 * `GET /api/tenant/community/posts` — Muro unificado o por comunidad respetando privacidad del autor (`SPEC-15`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId);
  if (!session.ok) return session.response;

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = listPostsQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return communityProblemJson(req, requestId, 400, "Validation Error", "Parámetros inválidos.", "validation-error", "VALIDATION_ERROR");
  }

  const service = getCommunityFeedService();
  const res = await service.getTenantWallPosts({
    clientId: session.clientId,
    organizationId: parsed.data.organizationId,
    limit: parsed.data.limit,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/tenant/community/posts` — Publica un mensaje en el muro respetando moderación `pre` | `post` | `none` (`SPEC-15`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = createPostSchema.safeParse(rawBody);
  if (!parsed.success) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Contenido de publicación inválido.",
      "validation-error",
      "VALIDATION_ERROR",
    );
  }

  const service = getCommunityFeedService();
  const res = await service.createPost({
    organizationId: parsed.data.organizationId,
    authorClientId: session.clientId,
    authorUserId: session.userId,
    body: parsed.data.body,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
