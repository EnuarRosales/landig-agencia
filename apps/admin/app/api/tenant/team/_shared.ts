import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { type PortalContext } from "@mocter/domain";
export { resolveAdminPublicOrigin } from "@/lib/resolve-admin-origin";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/**
 * Resuelve el `requestId` para trazabilidad estructurada en rutas de equipo.
 */
export function resolveTeamRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

/**
 * Emite una respuesta RFC 9457 Problem Details consistente con `AGENTS.md §4.14`.
 */
export function teamProblemJson(
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
 * Verifica si el contexto autenticado posee el rol de propietario del comercio (`tenant_owner`).
 */
export function isTenantOwnerContext(context: PortalContext): boolean {
  return (
    context.role === "tenant_owner" ||
    Boolean(context.effectiveRoles?.includes("tenant_owner"))
  );
}

/**
 * Devuelve una respuesta 403 Forbidden cuando un colaborador sin rol `tenant_owner` intenta mutar el equipo.
 */
export function forbidNonOwnerResponse(
  req: NextRequest,
  requestId: string,
): NextResponse {
  return teamProblemJson(
    req,
    requestId,
    403,
    "Forbidden",
    "Solo el propietario del comercio puede gestionar invitaciones y miembros del equipo.",
    "forbidden",
    "OWNER_ROLE_REQUIRED",
  );
}

/**
 * Traduce códigos de error de dominio de equipo a respuestas HTTP RFC 9457 (`SPEC-12`).
 */
export function mapTeamDomainErrorToResponse(
  req: NextRequest,
  requestId: string,
  code: string | undefined,
  message: string,
): NextResponse {
  switch (code) {
    case "NOT_FOUND":
      return teamProblemJson(req, requestId, 404, "Not Found", message, "not-found", code);
    case "ALREADY_TEAM_MEMBER":
    case "EMAIL_BELONGS_TO_ANOTHER_TENANT":
    case "INVITATION_ALREADY_PENDING":
    case "USER_ALREADY_HAS_ACTIVE_MEMBERSHIP":
      return teamProblemJson(req, requestId, 409, "Conflict", message, "conflict", code);
    case "QUOTA_EXCEEDED":
    case "TEAM_QUOTA_EXCEEDED":
      return teamProblemJson(
        req,
        requestId,
        422,
        "Unprocessable Entity",
        message,
        "business-rule",
        "TEAM_QUOTA_EXCEEDED",
      );
    case "CHATWOOT_AGENTS_QUOTA_EXCEEDED":
      return teamProblemJson(
        req,
        requestId,
        422,
        "Unprocessable Entity",
        message,
        "business-rule",
        "CHATWOOT_AGENTS_QUOTA_EXCEEDED",
      );
    case "CANNOT_REMOVE_OWNER":
    case "LAST_OWNER_CANNOT_BE_REMOVED":
      return teamProblemJson(
        req,
        requestId,
        422,
        "Unprocessable Entity",
        message,
        "business-rule",
        "LAST_OWNER_CANNOT_BE_REMOVED",
      );
    case "INVALID_CURRENT_PASSWORD":
      return teamProblemJson(
        req,
        requestId,
        401,
        "Unauthorized",
        message,
        "unauthorized",
        code,
      );
    case "USER_DISABLED":
      return teamProblemJson(req, requestId, 403, "Forbidden", message, "forbidden", code);
    case "OWNER_CANNOT_BE_MODIFIED":
    case "INVITATION_NOT_RESENDABLE":
    case "INVITATION_TOKEN_INVALID_OR_EXPIRED":
    case "INVITATION_INVALID":
    case "INVITATION_EXPIRED":
    case "EXISTING_ACCOUNT_PASSWORD_REQUIRED":
    case "FEDERATED_SESSION_REQUIRED":
      return teamProblemJson(
        req,
        requestId,
        422,
        "Unprocessable Entity",
        message,
        "business-rule",
        code,
      );
    default:
      return teamProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        message,
        "validation-error",
        code,
      );
  }
}

export const uuidParamSchema = z.string().uuid("El identificador debe ser un UUID válido.");

export const listTeamQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(["all", "active", "suspended"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortBy: z.enum(["joined_at", "display_name", "email", "status"]).default("joined_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("Ingresa un correo electrónico válido.").max(255),
  displayName: z.string().trim().max(160).optional().nullable(),
  role: z.enum(["tenant_agent"]).default("tenant_agent"),
  grantChatwootAccess: z.boolean().default(true),
});

export const updateMemberSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(160)
      .optional(),
    role: z.enum(["tenant_owner", "tenant_agent"]).optional(),
    grantChatwootAccess: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.role !== undefined ||
      v.grantChatwootAccess !== undefined,
    { message: "Debes indicar al menos un campo a actualizar." },
  );

export const updateMemberStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export const acceptInviteBodySchema = z.object({
  token: z.string().trim().min(16, "El token de invitación es obligatorio.").max(256),
  displayName: z.string().trim().max(160).optional(),
  password: z.string().max(128).optional(),
  currentPassword: z.string().max(128).optional(),
});
