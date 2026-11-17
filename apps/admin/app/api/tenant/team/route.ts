import { NextRequest, NextResponse } from "next/server";
import { getTenantContactsAndUsersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  isTenantOwnerContext,
  listTeamQuerySchema,
  resolveTeamRequestId,
  teamProblemJson,
} from "./_shared";

/**
 * `GET /api/tenant/team` — Lista paginada y filtrable de miembros del equipo, invitaciones (solo propietario) y cuotas (`SPEC-12`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveTeamRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = listTeamQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return teamProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Parámetros de consulta inválidos.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const isOwner = isTenantOwnerContext(auth.context);
  const service = getTenantContactsAndUsersService();
  const data = await service.listTeamAndInvitations(auth.clientId, {
    viewerRole: isOwner ? "tenant_owner" : "tenant_agent",
    q: parsed.data.q,
    status: parsed.data.status,
    page: parsed.data.page,
    limit: parsed.data.limit,
    sortBy: parsed.data.sortBy,
    sortDir: parsed.data.sortDir,
  });

  return NextResponse.json(
    { ok: true, data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
