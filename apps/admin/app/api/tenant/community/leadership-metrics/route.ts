import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunityLeadershipMetricsService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../_shared";

const querySchema = z.object({
  organizationId: z.string().uuid("Identificador de comunidad inválido."),
  periodType: z
    .enum(["daily", "weekly", "monthly", "quarterly", "semiannual", "annual", "custom"])
    .optional()
    .default("monthly"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * `GET /api/tenant/community/leadership-metrics` — Radar de impacto atribuido estrictamente por `source_share_id` para líderes y co-líderes (`SPEC-15-D09`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return communityProblemJson(req, requestId, 400, "Validation Error", "Parámetros de métricas inválidos.", "validation-error", "VALIDATION_ERROR");
  }

  const customRange =
    parsed.data.periodType === "custom" && parsed.data.startDate && parsed.data.endDate
      ? { startDate: parsed.data.startDate, endDate: parsed.data.endDate }
      : undefined;

  const service = getCommunityLeadershipMetricsService();
  const res = await service.getCommunityAttributedMetrics({
    organizationId: parsed.data.organizationId,
    requestingClientId: session.clientId,
    userRole: session.role,
    periodType: parsed.data.periodType,
    customRange,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
