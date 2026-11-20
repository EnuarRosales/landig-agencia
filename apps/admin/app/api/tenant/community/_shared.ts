import { NextRequest, NextResponse } from "next/server";
import {
  DrizzleTenantCapabilityGateRepository,
  TenantCapabilityGateService,
  type PortalContext,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

let defaultCapabilityGate: TenantCapabilityGateService | null = null;

function getCapabilityGate(): TenantCapabilityGateService {
  if (!defaultCapabilityGate) {
    defaultCapabilityGate = new TenantCapabilityGateService(
      new DrizzleTenantCapabilityGateRepository(),
    );
  }
  return defaultCapabilityGate;
}

/**
 * Resuelve el identificador de correlación `x-request-id`.
 */
export function resolveCommunityRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

/**
 * Construye una respuesta de error RFC 9457 Problem Details para `/api/tenant/community/*`.
 */
export function communityProblemJson(
  req: NextRequest,
  requestId: string,
  status: number,
  title: string,
  detail: string,
  typeSlug: string,
  code?: string,
  issues?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${typeSlug}`,
      title,
      status,
      detail,
      ...(code ? { code } : {}),
      ...(issues ? { issues } : {}),
      instance: req.nextUrl.pathname,
      reference: requestId,
    },
    {
      status,
      headers: {
        "Content-Type": PROBLEM_CONTENT_TYPE,
        "x-request-id": requestId,
      },
    },
  );
}

/**
 * Determina si el usuario autenticado posee rol propietario de inquilino (`tenant_owner` / `tenancy_owner`).
 */
export function isTenantOwnerRole(context: PortalContext): boolean {
  return (
    context.role === "tenant_owner" ||
    context.role === "tenancy_owner" ||
    Boolean(context.effectiveRoles?.includes("tenant_owner")) ||
    Boolean(context.effectiveRoles?.includes("tenancy_owner"))
  );
}

/**
 * Traduce códigos de error de dominio SPEC-15 a HTTP status codes RFC 9457 consistentes.
 */
export function domainErrorStatusForCode(code: string): number {
  const c = code.toUpperCase();
  if (c.includes("CELL_UNAVAILABLE") || c.includes("S3_UPLOAD_FAILED") || c.includes("S3_READ_FAILED")) {
    return 503;
  }
  if (c.includes("NOT_FOUND")) return 404;
  if (
    c.includes("FORBIDDEN") ||
    c.includes("UNAUTHORIZED") ||
    c.includes("LEADER_APPROVAL_REQUIRED") ||
    c.includes("COMMUNITY_MEMBERSHIP_REQUIRED")
  ) {
    return 403;
  }
  if (
    c.includes("ALREADY_") ||
    c.includes("EXISTS") ||
    c.includes("DUPLICATE") ||
    c.includes("SLUG")
  ) {
    return 409;
  }
  if (
    c.includes("QUOTA_EXCEEDED") ||
    c.includes("BELOW_MIN_RESALE") ||
    c.includes("CANNOT_RESHARE") ||
    c.includes("SUSPENDED") ||
    c.includes("NO_PENDING_CHANGES") ||
    c.includes("CANNOT_ADOPT_OWN") ||
    c.includes("ORIGINATOR_CANNOT") ||
    c.includes("INVALID_VIDEO_URL") ||
    c.includes("INVALID_IMAGE_FORMAT") ||
    c.includes("FILE_TOO_LARGE") ||
    c.includes("POST_NOT_PUBLISHED") ||
    c.includes("INVITATION_EXPIRED") ||
    c.includes("INVITATION_NOT_PENDING")
  ) {
    return 422;
  }
  return 400;
}

/**
 * Responde una falla de dominio usando formato RFC 9457 `application/problem+json`.
 */
export function domainFailureToProblem(
  req: NextRequest,
  requestId: string,
  code: string | undefined,
  detail: string,
  issues?: unknown,
): NextResponse {
  const safeCode = code ?? "BAD_REQUEST";
  const status = domainErrorStatusForCode(safeCode);
  const title =
    status === 404
      ? "Not Found"
      : status === 403
        ? "Forbidden"
        : status === 409
          ? "Conflict"
          : status === 422
            ? "Unprocessable Entity"
            : "Bad Request";

  return communityProblemJson(
    req,
    requestId,
    status,
    title,
    detail,
    safeCode.toLowerCase().replace(/_/g, "-"),
    safeCode,
    issues,
  );
}

/**
 * Verifica sesión activa de inquilino, capacidad `community_feed` en plan vigente y rol opcional `tenant_owner`.
 */
export async function requireCommunitySession(
  req: NextRequest,
  requestId: string,
  options?: { requireOwner?: boolean; skipCapabilityCheck?: boolean },
): Promise<
  | { ok: true; clientId: string; userId: string; role: string; isOwner: boolean; context: PortalContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }

  const isOwner = isTenantOwnerRole(auth.context);

  if (options?.requireOwner && !isOwner) {
    return {
      ok: false,
      response: communityProblemJson(
        req,
        requestId,
        403,
        "Forbidden",
        "Esta operación está restringida al propietario del comercio.",
        "forbidden-owner-only",
        "FORBIDDEN_OWNER_ONLY",
      ),
    };
  }

  if (!options?.skipCapabilityCheck) {
    const capRes = await getCapabilityGate().assertCapability(
      auth.clientId,
      "community_feed",
    );
    if (!capRes.ok) {
      return {
        ok: false,
        response: communityProblemJson(
          req,
          requestId,
          403,
          "Forbidden",
          capRes.error,
          "capability-not-included",
          "CAPABILITY_NOT_INCLUDED",
        ),
      };
    }
  }

  return {
    ok: true,
    clientId: auth.clientId,
    userId: auth.context.user.id,
    role: isOwner ? "tenant_owner" : "tenant_agent",
    isOwner,
    context: auth.context,
  };
}
