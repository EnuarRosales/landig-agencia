import { NextRequest, NextResponse } from "next/server";
import { tenantProfileService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  emitProfileAfterEvent,
  mapProfileDomainError,
  profileProblemResponse,
  requireTenantProfileAccess,
} from "@/lib/tenant-profile-http";
import { env } from "@/env";

/**
 * `GET /api/tenant/profile` · Retorna el perfil comercial completo y canales resumidos del comercio (`SPEC-05 §9.1`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: false });

  const res = await tenantProfileService.getTenantProfile(access.clientId);
  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `PATCH /api/tenant/profile` · Actualiza datos comerciales, ubicación, redes e idioma del comercio (`SPEC-05 §9.1`).
 */
export const PATCH = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid JSON Body",
      detail: "El cuerpo de la petición debe ser JSON válido.",
      code: "INVALID_BODY",
      typeSlug: "invalid-body",
    });
  }

  const res = await tenantProfileService.updateTenantProfile(
    access.clientId,
    access.context.role,
    body,
    {
      userId: access.context.user.id,
      actorEmail: access.context.user.email,
      actorRole: access.context.role,
    },
    access.context.effectiveRoles,
  );

  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  emitProfileAfterEvent("tenant.profile.updated", {
    requestId,
    clientId: access.clientId,
    actor: access.actor,
    locale: res.data.locale,
  });

  const response = NextResponse.json(
    { ok: true, data: res.data },
    {
      status: 200,
      headers: {
        "x-request-id": requestId,
        "x-mocter-locale": res.data.locale,
      },
    },
  );

  if (typeof (body as Record<string, unknown>).locale === "string") {
    response.cookies.set("mocter_locale", res.data.locale, {
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
});
