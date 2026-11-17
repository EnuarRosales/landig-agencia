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

const paramSchema = z.object({ shareId: z.string().uuid("Identificador inválido.") });

const moderateSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().max(500).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(["active", "archived"]),
});

/**
 * `POST /api/tenant/community/shares/[shareId]/moderate` — Aprueba o rechaza una propuesta de producto colaborativo (`SPEC-15-D04`).
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

    const rawBody = await req.json().catch(() => null);
    const b = moderateSchema.safeParse(rawBody);
    if (!b.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Decisión inválida.", "validation-error", "VALIDATION_ERROR");
    }

    const service = getProductCloningService();
    const res = await service.moderateShare({
      shareId: p.data.shareId,
      actorClientId: session.clientId,
      actorUserId: session.userId,
      decision: b.data.decision,
      rejectionReason: b.data.rejectionReason,
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
 * `PATCH /api/tenant/community/shares/[shareId]/moderate` — Archiva o reactiva un producto compartido sin dañar clones existentes (`SPEC-15`).
 */
export const PATCH = handle(
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

    const rawBody = await req.json().catch(() => null);
    const b = statusSchema.safeParse(rawBody);
    if (!b.success) {
      return communityProblemJson(req, requestId, 400, "Validation Error", "Estado inválido.", "validation-error", "VALIDATION_ERROR");
    }

    const service = getProductCloningService();
    const res = await service.archiveOrRestoreShare({
      shareId: p.data.shareId,
      actorClientId: session.clientId,
      status: b.data.status,
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
