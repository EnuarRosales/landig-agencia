import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PortalContext } from "@mocter/domain";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/**
 * Resuelve el identificador de correlación `x-request-id` para las rutas de notificaciones del inquilino.
 */
export function resolveNotificationRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

/**
 * Construye una respuesta de error RFC 9457 Problem Details para `/api/tenant/notifications/*`.
 */
export function notificationProblemJson(
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
 * Determina si el contexto autenticado posee el rol propietario del comercio (`tenant_owner` / `tenancy_owner`).
 */
export function isTenantOwnerRole(context: PortalContext): boolean {
  return (
    context.role === "tenant_owner" ||
    context.role === "tenancy_owner" ||
    Boolean(context.effectiveRoles?.includes("tenant_owner")) ||
    Boolean(context.effectiveRoles?.includes("tenancy_owner"))
  );
}

export const listTenantNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Identificador de notificación inválido."),
});
