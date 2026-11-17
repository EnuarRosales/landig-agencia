import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../_shared";

const orgIdParamSchema = z.object({
  orgId: z.string().uuid("Identificador de comunidad inválido."),
});

const patchOrgSchema = z.object({
  name: z.string().trim().min(3).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  visibility: z.enum(["private_invite", "request_to_join"]).optional(),
  sharePolicy: z.enum(["leaders_only", "collaborative"]).optional(),
  requireShareApproval: z.boolean().optional(),
  moderationMode: z.enum(["pre", "post", "none"]).optional(),
  regenerateInviteCode: z.boolean().optional(),
});

/**
 * `PATCH /api/tenant/community/organizations/[orgId]` — Actualiza visibilidad, política de compartición, moderación o código de invitación (`SPEC-15`).
 */
export const PATCH = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ orgId: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveCommunityRequestId(req);
    const session = await requireCommunitySession(req, requestId, { requireOwner: true });
    if (!session.ok) return session.response;

    const params = await context.params;
    const paramParsed = orgIdParamSchema.safeParse(params);
    if (!paramParsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        "Identificador de comunidad inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const rawBody = await req.json().catch(() => null);
    const bodyParsed = patchOrgSchema.safeParse(rawBody);
    if (!bodyParsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        bodyParsed.error.issues[0]?.message || "Datos inválidos al actualizar comunidad.",
        "validation-error",
        "VALIDATION_ERROR",
        bodyParsed.error.issues,
      );
    }

    const service = getCommunitiesGovernanceService();
    const res = await service.updateOrganizationSettings({
      organizationId: paramParsed.data.orgId,
      actorClientId: session.clientId,
      actorUserId: session.userId,
      ...bodyParsed.data,
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
