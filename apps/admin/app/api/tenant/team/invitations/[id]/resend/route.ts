import { after, NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantContactsAndUsersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  forbidNonOwnerResponse,
  isTenantOwnerContext,
  mapTeamDomainErrorToResponse,
  resolveAdminPublicOrigin,
  resolveTeamRequestId,
  teamProblemJson,
  uuidParamSchema,
} from "../../../_shared";

/**
 * `POST /api/tenant/team/invitations/[id]/resend` — Reenvía una invitación vigente o expirada generando nuevo token SHA-256 (`SPEC-12`).
 */
export const POST = handle(
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
    const res = await service.resendInvitation(auth.clientId, parsedId.data, actor);

    if (!res.ok) {
      return mapTeamDomainErrorToResponse(req, requestId, res.code, res.error);
    }

    const { invitation, rawToken } = res.data;
    const origin = resolveAdminPublicOrigin(req);
    const inviterName =
      auth.context.user.displayName || auth.context.user.email || "Propietario";

    after(async () => {
      appLogger.info("tenant.team.invitation_resent", {
        requestId,
        clientId: auth.clientId,
        invitationId: invitation.id,
      });
      await service.dispatchInvitationEmail({
        clientId: auth.clientId,
        invitationId: invitation.id,
        recipientEmail: invitation.email,
        inviteeName: invitation.displayName,
        inviterName,
        rawToken,
        baseUrl: origin,
      });
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
        },
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
