import { after, NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  getTenantContactsAndUsersService,
  removeTenantMemberChatwootAccess,
  syncTenantMemberChatwootAccess,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  forbidNonOwnerResponse,
  isTenantOwnerContext,
  mapTeamDomainErrorToResponse,
  resolveTeamRequestId,
  teamProblemJson,
  updateMemberSchema,
  uuidParamSchema,
} from "../_shared";

/**
 * `PATCH /api/tenant/team/[id]` — Edita nombre visible y/o acceso a Chatwoot de un colaborador (`SPEC-12`).
 */
export const PATCH = handle(
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
        parsedId.error.issues[0]?.message || "Identificador de miembro inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return teamProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Datos de actualización inválidos.",
        "validation-error",
        "VALIDATION_ERROR",
        parsed.error.issues,
      );
    }

    const service = getTenantContactsAndUsersService();
    const actor = auth.context.user.email || auth.context.user.id;
    const res = await service.updateMemberProfile(
      auth.clientId,
      parsedId.data,
      parsed.data,
      actor,
    );

    if (!res.ok) {
      return mapTeamDomainErrorToResponse(req, requestId, res.code, res.error);
    }

    const { member, chatwootAction, previousChatwootAgentId } = res.data;

    after(async () => {
      appLogger.info("tenant.team.member_updated", {
        requestId,
        clientId: auth.clientId,
        memberId: member.id,
        chatwootAction,
      });

      if (chatwootAction === "sync" && member.email) {
        await syncTenantMemberChatwootAccess({
          clientId: auth.clientId,
          memberId: member.id,
          email: member.email,
          displayName: member.displayName || member.email,
          role: member.role,
        });
      } else if (chatwootAction === "remove") {
        await removeTenantMemberChatwootAccess({
          clientId: auth.clientId,
          memberId: member.id,
          chatwootAgentId: previousChatwootAgentId,
        });
      }
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: member.id,
          userId: member.userId,
          email: member.email ?? "",
          displayName: member.displayName ?? null,
          role: member.role,
          status: member.status,
          grantChatwootAccess: member.grantChatwootAccess,
          chatwootAgentId: member.chatwootAgentId ?? null,
          joinedAt: member.joinedAt.toISOString(),
          lastAccessAt: member.lastAccessAt ? member.lastAccessAt.toISOString() : null,
        },
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `DELETE /api/tenant/team/[id]` — Retira definitivamente (`status = 'left'`) a un colaborador, revoca sesiones y desacopla Chatwoot (`SPEC-12`).
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
        parsedId.error.issues[0]?.message || "Identificador de miembro inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const service = getTenantContactsAndUsersService();
    const actor = auth.context.user.email || auth.context.user.id;
    const res = await service.retireMember(auth.clientId, parsedId.data, actor);

    if (!res.ok) {
      return mapTeamDomainErrorToResponse(req, requestId, res.code, res.error);
    }

    after(async () => {
      appLogger.info("tenant.team.member_status_changed", {
        requestId,
        clientId: auth.clientId,
        memberId: parsedId.data,
        targetUserId: res.data.userId,
        nextStatus: "left",
      });
      await removeTenantMemberChatwootAccess({
        clientId: auth.clientId,
        memberId: parsedId.data,
        chatwootAgentId: res.data.chatwootAgentId,
      });
    });

    return NextResponse.json(
      { ok: true, data: { id: parsedId.data, status: "left" } },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
