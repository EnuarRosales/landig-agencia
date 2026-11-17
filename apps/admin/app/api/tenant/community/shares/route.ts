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
  organizationId: z.string().uuid("Identificador de comunidad inválido."),
});

const publishShareSchema = z.object({
  organizationId: z.string().uuid("Identificador de comunidad inválido."),
  sourceProductId: z.string().uuid("Identificador de producto inválido."),
  wholesaleCostCents: z.number().int().min(0).nullable().optional(),
  suggestedPriceCents: z.number().int().min(0).nullable().optional(),
  minResalePriceCents: z.number().int().min(0).nullable().optional(),
  includeReferenceStock: z.boolean().optional().default(false),
  changelog: z.string().trim().max(1000).nullable().optional(),
});

/**
 * `GET /api/tenant/community/shares?organizationId=...` — Lista productos del comercio elegibles y detecta cambios pendientes en los ya compartidos (`SPEC-15-D07`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return communityProblemJson(req, requestId, 400, "Validation Error", "Se requiere organizationId válido.", "validation-error", "VALIDATION_ERROR");
  }

  const service = getProductCloningService();
  const res = await service.listLeaderCandidateProducts({
    clientId: session.clientId,
    organizationId: parsed.data.organizationId,
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
 * `POST /api/tenant/community/shares` — Publica un producto propio (simple o combo) en la comunidad respetando `sharePolicy` y no re-compartición (`SPEC-15`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = publishShareSchema.safeParse(rawBody);
  if (!parsed.success) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos inválidos al compartir producto.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const service = getProductCloningService();
  const res = await service.publishShareFromCellProduct({
    ...parsed.data,
    sharerClientId: session.clientId,
    createdByUserId: session.userId,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
