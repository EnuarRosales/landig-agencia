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

const paramSchema = z.object({ adoptionId: z.string().uuid("Identificador de adopción inválido.") });

/**
 * `DELETE /api/tenant/community/adoptions/[adoptionId]/link` — Desvincula un clon dejando el producto operando independientemente (`SPEC-15`).
 */
export const DELETE = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ adoptionId: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const p = paramSchema.safeParse(params);
    if (!p.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Identificador inválido.", "validation-error", "VALIDATION_ERROR");
    }

    const service = getProductCloningService();
    const res = await service.unlinkAdoption({
      adoptionId: p.data.adoptionId,
      clientId: session.clientId,
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
