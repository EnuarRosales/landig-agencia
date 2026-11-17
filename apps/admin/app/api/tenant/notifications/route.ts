import { NextRequest, NextResponse } from "next/server";
import { getNotificationDispatcherService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  isTenantOwnerRole,
  listTenantNotificationsQuerySchema,
  notificationProblemJson,
  resolveNotificationRequestId,
} from "./_shared";

/**
 * `GET /api/tenant/notifications` — Bandeja in-app paginada, conteo de no leídas y preferencias del comercio (`SPEC-14`).
 */
export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveNotificationRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = listTenantNotificationsQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return notificationProblemJson(
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

  const isOwner = isTenantOwnerRole(auth.context);
  const service = getNotificationDispatcherService();
  const data = await service.listTenantInboxAndPreferences(auth.clientId, {
    unreadOnly: parsed.data.unreadOnly,
    page: parsed.data.page,
    limit: parsed.data.limit,
    viewerRole: isOwner ? "tenant_owner" : "tenant_agent",
  });

  return NextResponse.json(
    { ok: true, data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
