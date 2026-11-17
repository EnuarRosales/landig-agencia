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

const querySchema = z.object({
  organizationId: z.string().uuid().optional(),
  onlyOutdated: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

/**
 * `GET /api/tenant/community/adoptions` — Lista clones adoptados, estado de versiones disponibles y políticas por atributo (`SPEC-15`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId);
  if (!session.ok) return session.response;

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return communityProblemJson(req, requestId, 400, "Validation Error", "Parámetros inválidos.", "validation-error", "VALIDATION_ERROR");
  }

  const service = getProductCloningService();
  const res = await service.listMyAdoptions({
    clientId: session.clientId,
    organizationId: parsed.data.organizationId,
    onlyOutdated: parsed.data.onlyOutdated,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
