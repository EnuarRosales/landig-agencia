import { after, NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  authService,
  getTenantContactsAndUsersService,
  resolveAuthenticatedPortalContext,
  syncTenantMemberChatwootAccess,
} from "@mocter/domain";
import { env } from "@/env";
import { handle } from "@/lib/errors/route";
import {
  acceptInviteBodySchema,
  mapTeamDomainErrorToResponse,
  resolveTeamRequestId,
  teamProblemJson,
} from "../_shared";

/**
 * `GET /api/tenant/team/accept-invite?token=...` — Consulta pública no sensible del estado de una invitación (`SPEC-12`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveTeamRequestId(req);
  const rawToken = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (!rawToken) {
    return teamProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      "El parámetro token es obligatorio.",
      "validation-error",
      "VALIDATION_ERROR",
    );
  }

  const service = getTenantContactsAndUsersService();
  const preview = await service.getInvitationPreview(rawToken);

  return NextResponse.json(
    { ok: true, data: preview },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/tenant/team/accept-invite` — Acepta una invitación pública, activa membresía en celda e inicia sesión en el portal (`SPEC-12`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveTeamRequestId(req);
  const body = await req.json().catch(() => null);
  const parsed = acceptInviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return teamProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos de aceptación inválidos.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const existingSid = (
    req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value
  )?.trim();

  let authenticatedUserId: string | null = null;
  let authenticatedUserEmail: string | null = null;
  if (existingSid) {
    const activeCtx = await resolveAuthenticatedPortalContext(existingSid).catch(() => null);
    if (activeCtx?.user) {
      authenticatedUserId = activeCtx.user.id;
      authenticatedUserEmail = activeCtx.user.email;
    }
  }

  const service = getTenantContactsAndUsersService();
  const acceptRes = await service.acceptTeamInvitation({
    rawToken: parsed.data.token,
    displayName: parsed.data.displayName,
    password: parsed.data.password,
    currentPassword: parsed.data.currentPassword,
    authenticatedUserId,
    authenticatedUserEmail,
  });

  if (!acceptRes.ok) {
    return mapTeamDomainErrorToResponse(req, requestId, acceptRes.code, acceptRes.error);
  }

  const accepted = acceptRes.data;
  const forwarded = req.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const sessionRes = await authService.issueSessionForUserById(accepted.userId, {
    clientIp,
    userAgent,
  });

  after(async () => {
    appLogger.info("tenant.team.invite_accepted", {
      requestId,
      clientId: accepted.clientId,
      memberId: accepted.member.id,
      userId: accepted.userId,
      grantChatwootAccess: accepted.grantChatwootAccess,
    });
    if (accepted.grantChatwootAccess) {
      await syncTenantMemberChatwootAccess({
        clientId: accepted.clientId,
        memberId: accepted.member.id,
        email: accepted.email,
        displayName: accepted.displayName,
        role: "tenant_agent",
      });
    }
  });

  const response = NextResponse.json(
    {
      ok: true,
      data: {
        memberId: accepted.member.id,
        clientId: accepted.clientId,
        userId: accepted.userId,
        email: accepted.email,
        displayName: accepted.displayName,
        role: "tenant_agent",
        redirectTo: "/workspace",
      },
    },
    { status: 200, headers: { "x-request-id": requestId } },
  );

  if (sessionRes.ok) {
    const hostname = req.nextUrl.hostname;
    const cookieDomain =
      isProduction && hostname.endsWith("mocter.co") ? ".mocter.co" : undefined;

    response.cookies.set("mocter_sid", sessionRes.data.sid, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 43200,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    response.cookies.set("mocter_csrf", sessionRes.data.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 43200,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  }

  return response;
});
