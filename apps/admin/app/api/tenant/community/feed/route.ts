import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProductCloningService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../_shared";

const feedQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  compositionType: z.enum(["simple", "combo", "all"]).optional().default("all"),
  onlyNotAdopted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
  sortBy: z.enum(["recent", "popular", "name", "suggestedPrice"]).optional().default("recent"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

/**
 * `GET /api/tenant/community/feed` — Catálogo de productos compartidos paginado y filtrable de tus comunidades (`SPEC-15`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId);
  if (!session.ok) return session.response;

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = feedQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return communityProblemJson(req, requestId, 400, "Validation Error", "Parámetros de catálogo inválidos.", "validation-error", "VALIDATION_ERROR");
  }

  const service = getProductCloningService();
  const res = await service.listCommunityFeedCatalog({
    clientId: session.clientId,
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
