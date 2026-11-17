import { NextRequest, NextResponse } from "next/server";
import { getNotificationDispatcherService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import { resolveNotificationRequestId } from "../_shared";

/**
 * `POST /api/tenant/notifications/read-all` — Marca todas las notificaciones pendientes del comercio como leídas (`SPEC-14`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveNotificationRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const service = getNotificationDispatcherService();
  const res = await service.markAllNotificationsRead(auth.clientId);

  return NextResponse.json(
    { ok: true, data: res.ok ? res.data : { updatedCount: 0 } },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
