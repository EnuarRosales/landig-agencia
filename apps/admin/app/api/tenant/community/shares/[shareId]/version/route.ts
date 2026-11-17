import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProductCloningService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../../_shared";

const paramSchema = z.object({ shareId: z.string().uuid("Identificador de publicación inválido.") });

const versionBodySchema = z.object({
  wholesaleCostCents: z.number().int().min(0).nullable().optional(),
  suggestedPriceCents: z.number().int().min(0).nullable().optional(),
  minResalePriceCents: z.number().int().min(0).nullable().optional(),
  includeReferenceStock: z.boolean().optional(),
  changelog: z.string().trim().max(1000).nullable().optional(),
});

/**
 * `POST /api/tenant/community/shares/[shareId]/version` — Publica explícitamente vN+1 desde cambios detectados en `/workspace/products` (`SPEC-15-D07`).
 */
export const POST = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ shareId: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const p = paramSchema.safeParse(params);
    if (!p.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Identificador inválido.", "validation-error", "VALIDATION_ERROR");
    }

    const rawBody = await req.json().catch(() => ({}));
    const b = versionBodySchema.safeParse(rawBody ?? {});
    if (!b.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Parámetros de versión inválidos.", "validation-error", "VALIDATION_ERROR");
    }

    const service = getProductCloningService();
    const res = await service.publishNewShareVersionFromCellProduct({
      shareId: p.data.shareId,
      sharerClientId: session.clientId,
      actorUserId: session.userId,
      ...b.data,
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
