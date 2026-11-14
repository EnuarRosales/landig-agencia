import { after, NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  isTenantProfileWriterRole,
  resolveAuthenticatedPortalContext,
  type AuthenticatedPortalContext,
} from "@mocter/domain";
import { HttpError } from "@/lib/errors/route";
import { readSessionToken } from "@/lib/billing-route-auth";

export interface TenantProfileRouteAccess {
  context: AuthenticatedPortalContext;
  clientId: string;
  actor: string;
}

/**
 * Resuelve la sesión autenticada del espacio comercial (`tenant` o prospecto ya asignado en onboarding)
 * y exige rol de propietario cuando `requireOwner` es verdadero (`SPEC-05 §6, §9`).
 */
export async function requireTenantProfileAccess(
  req: NextRequest,
  options: { requireOwner?: boolean } = {},
): Promise<TenantProfileRouteAccess> {
  const sid = await readSessionToken(req);
  if (!sid) {
    throw new HttpError(401, "Sesión requerida para consultar el perfil del comercio.");
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context || !context.user) {
    throw new HttpError(401, "Sesión inválida o expirada.");
  }

  if (
    (context.scope !== "tenant" && context.scope !== "onboarding_prospect") ||
    !context.activeClient?.id
  ) {
    throw new HttpError(403, "Acceso denegado: se requiere un comercio activo en sesión.");
  }

  if (options.requireOwner && !isTenantProfileWriterRole(context.role, context.effectiveRoles)) {
    throw new HttpError(
      403,
      "Permiso denegado: únicamente el propietario del comercio puede modificar esta configuración.",
    );
  }

  return {
    context,
    clientId: context.activeClient.id,
    actor: context.user.email || context.user.id || context.activeClient.id,
  };
}

/**
 * Construye una respuesta de error RFC 9457 (`application/problem+json`) correlacionada por `x-request-id`.
 */
export function profileProblemResponse(params: {
  req: NextRequest;
  requestId: string;
  status: number;
  title: string;
  detail: string;
  code?: string;
  typeSlug?: string;
}): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${params.typeSlug || "tenant-profile-error"}`,
      title: params.title,
      status: params.status,
      detail: params.detail,
      ...(params.code ? { code: params.code } : {}),
      instance: params.req.nextUrl.pathname,
      reference: params.requestId,
    },
    {
      status: params.status,
      headers: {
        "content-type": "application/problem+json",
        "x-request-id": params.requestId,
      },
    },
  );
}

/**
 * Traduce códigos de error de dominio de `TenantProfileService` y `TenantPaymentChannelsService`
 * al código HTTP y slug RFC 9457 correspondiente.
 */
export function mapProfileDomainError(
  req: NextRequest,
  requestId: string,
  detail: string,
  code?: string,
): NextResponse {
  switch (code) {
    case "FORBIDDEN":
      return profileProblemResponse({
        req,
        requestId,
        status: 403,
        title: "Forbidden",
        detail,
        code,
        typeSlug: "forbidden",
      });
    case "CLIENT_NOT_FOUND":
    case "CHANNEL_NOT_FOUND":
      return profileProblemResponse({
        req,
        requestId,
        status: 404,
        title: "Not Found",
        detail,
        code,
        typeSlug: "not-found",
      });
    case "CHANNEL_USED_IN_ORDERS":
      return profileProblemResponse({
        req,
        requestId,
        status: 409,
        title: "Channel Used In Orders",
        detail,
        code,
        typeSlug: "channel-used-in-orders",
      });
    case "STORAGE_UNAVAILABLE":
      return profileProblemResponse({
        req,
        requestId,
        status: 503,
        title: "Service Unavailable",
        detail,
        code,
        typeSlug: "media-storage-unavailable",
      });
    default:
      return profileProblemResponse({
        req,
        requestId,
        status: 400,
        title: "Validation Error",
        detail,
        code: code || "VALIDATION_ERROR",
        typeSlug: "validation-error",
      });
  }
}

/**
 * Emite un evento estructurado Pino en segundo plano vía `after()` sin bloquear la respuesta HTTP (`SPEC-05 §12`).
 */
export function emitProfileAfterEvent(
  eventName: "tenant.profile.updated" | "tenant.payment_channel.mutated",
  payload: Record<string, unknown>,
): void {
  const run = async () => {
    appLogger.info(`[${eventName}]`, { event: eventName, ...payload });
  };
  try {
    after(run);
  } catch {
    void run().catch(() => {});
  }
}
