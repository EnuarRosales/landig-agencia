import { after, NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantContactsAndUsersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  forbidNonOwnerResponse,
  isTenantOwnerContext,
  mapTeamDomainErrorToResponse,
  resolveTeamRequestId,
  teamProblemJson,
  uuidParamSchema,
} from "../../_shared";

/**
 * `DELETE /api/tenant/team/invitations/[id]` — Revoca una invitación pendiente o expirada liberando cuota (`SPEC-12`).
 */
export const DELETE = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveTeamRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    if (!isTenantOwnerContext(auth.context)) {
      return forbidNonOwnerResponse(req, requestId);
    }

    const { id } = await context.params;
    const parsedId = uuidParamSchema.safeParse(id);
    if (!parsedId.success) {
      return teamProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        parsedId.error.issues[0]?.message || "Identificador de invitación inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const service = getTenantContactsAndUsersService();
    const actor = auth.context.user.email || auth.context.user.id;
    const res = await service.revokeInvitation(auth.clientId, parsedId.data, actor);

    if (!res.ok) {
      return mapTeamDomainErrorToResponse(req, requestId, res.code, res.error);
    }

    after(() => {
      appLogger.info("tenant.team.invitation_revoked", {
        requestId,
        clientId: auth.clientId,
        invitationId: parsedId.data,
      });
    });

    return NextResponse.json(
      { ok: true, data: { id: parsedId.data, status: "revoked" } },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
