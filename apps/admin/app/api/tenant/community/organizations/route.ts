import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCommunitiesGovernanceService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../_shared";

const createOrgSchema = z.object({
  name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres.").max(255),
  slug: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  visibility: z.enum(["private_invite", "request_to_join"]).default("private_invite"),
  sharePolicy: z.enum(["leaders_only", "collaborative"]).default("leaders_only"),
  requireShareApproval: z.boolean().default(true),
  moderationMode: z.enum(["pre", "post", "none"]).default("pre"),
});

/**
 * `POST /api/tenant/community/organizations` — Crea una nueva comunidad cuando el comercio cuenta con autorización y cupo (`SPEC-15-D01`, `D03`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const rawBody = await req.json().catch(() => null);
  const parsed = createOrgSchema.safeParse(rawBody);
  if (!parsed.success) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Configuración inválida para la comunidad.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const service = getCommunitiesGovernanceService();
  const res = await service.createOrganization({
    originatorClientId: session.clientId,
    createdByUserId: session.userId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description,
    category: parsed.data.category,
    visibility: parsed.data.visibility,
    sharePolicy: parsed.data.sharePolicy,
    requireShareApproval: parsed.data.requireShareApproval,
    moderationMode: parsed.data.moderationMode,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
