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

const adoptBodySchema = z.object({
  customSalePriceCents: z.number().int().min(0).nullable().optional(),
  customCostPriceCents: z.number().int().min(0).nullable().optional(),
  initialStock: z.number().int().min(0).nullable().optional(),
  initialStatus: z.enum(["active", "draft"]).optional().default("active"),
  includeMediaMode: z.enum(["all_compatible", "cover_only", "none"]).optional().default("all_compatible"),
  retainLink: z.boolean().optional().default(true),
  autoSyncAttributes: z.array(z.string()).optional().default([]),
});

/**
 * `POST /api/tenant/community/shares/[shareId]/adopt` — Clona un producto compartido (simple o combo) hacia el catálogo y almacenamiento propio del comercio (`SPEC-15-D06`, `D10`).
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
    const b = adoptBodySchema.safeParse(rawBody ?? {});
    if (!b.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        b.error.issues[0]?.message || "Parámetros de adopción inválidos.",
        "validation-error",
        "VALIDATION_ERROR",
        b.error.issues,
      );
    }

    const service = getProductCloningService();
    const res = await service.adoptShareToTenant({
      shareId: p.data.shareId,
      adopterClientId: session.clientId,
      createdByUserId: session.userId,
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
