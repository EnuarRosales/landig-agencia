import { after, NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantContactsAndUsersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  forbidNonOwnerResponse,
  inviteMemberSchema,
  isTenantOwnerContext,
  mapTeamDomainErrorToResponse,
  resolveAdminPublicOrigin,
  resolveTeamRequestId,
  teamProblemJson,
} from "../_shared";

/**
 * `POST /api/tenant/team/invite` — Emite una invitación segura (SHA-256, 72h) validando cuotas y membresía `1:0..1` (`SPEC-12`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveTeamRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantOwnerContext(auth.context)) {
    return forbidNonOwnerResponse(req, requestId);
  }

  const body = await req.json().catch(() => null);
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return teamProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos de invitación inválidos.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const service = getTenantContactsAndUsersService();
  const actor = auth.context.user.email || auth.context.user.id;
  const result = await service.issueInvitation(
    auth.clientId,
    {
      email: parsed.data.email,
      displayName: parsed.data.displayName ?? null,
      role: parsed.data.role,
      grantChatwootAccess: parsed.data.grantChatwootAccess,
      invitedByUserId: auth.context.user.id,
    },
    actor,
  );

  if (!result.ok) {
    return mapTeamDomainErrorToResponse(req, requestId, result.code, result.error);
  }

  const { invitation, rawToken } = result.data;
  const origin = resolveAdminPublicOrigin(req);
  const inviterName =
    auth.context.user.displayName || auth.context.user.email || "Propietario";

  after(async () => {
    appLogger.info("tenant.team.invited", {
      requestId,
      clientId: auth.clientId,
      invitationId: invitation.id,
      role: invitation.role,
      grantChatwootAccess: invitation.grantChatwootAccess,
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
        displayName: invitation.displayName ?? null,
        role: invitation.role,
        grantChatwootAccess: invitation.grantChatwootAccess,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
