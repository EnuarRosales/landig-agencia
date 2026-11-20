import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { resolveAdminPublicOrigin } from "@/lib/resolve-admin-origin";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../../_shared";

const orgIdParamSchema = z.object({
  orgId: z.string().uuid("Identificador de comunidad inválido."),
});

const inviteSchema = z.object({
  targetClientSlugOrEmail: z
    .string()
    .trim()
    .min(2, "Ingresa el identificador (slug) o correo del comercio invitado.")
    .max(255),
  role: z.enum(["member", "co_leader"]).default("member"),
});

/**
 * `POST /api/tenant/community/organizations/[orgId]/invite` — Envía una invitación formal por slug o correo corporativo (`SPEC-15`).
 */
export const POST = handle(
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
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return communityProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Datos inválidos de invitación.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const service = getCommunitiesGovernanceService();
    const res = await service.inviteTenant({
      organizationId: paramParsed.data.orgId,
      inviterClientId: session.clientId,
      inviterUserId: session.userId,
      targetClientSlugOrEmail: parsed.data.targetClientSlugOrEmail,
      role: parsed.data.role,
      baseUrl: resolveAdminPublicOrigin(req),
    });

    if (!res.ok) {
      return domainFailureToProblem(req, requestId, res.code, res.error);
    }

    return NextResponse.json(
      { ok: true, data: res.data },
      {
        status: res.data.reusedExisting ? 200 : 201,
        headers: { "x-request-id": requestId },
      },
    );
  },
);
