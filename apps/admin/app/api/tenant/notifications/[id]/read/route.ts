import { NextRequest, NextResponse } from "next/server";
import { getNotificationDispatcherService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  notificationIdParamSchema,
  notificationProblemJson,
  resolveNotificationRequestId,
} from "../../_shared";

/**
 * `PATCH /api/tenant/notifications/[id]/read` — Marca una notificación in-app del comercio como leída (`SPEC-14`).
 */
export const PATCH = handle(
  async (
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const requestId = resolveNotificationRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const params = await context.params;
    const parsed = notificationIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return notificationProblemJson(
        req,
        requestId,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Identificador de notificación inválido.",
        "validation-error",
        "VALIDATION_ERROR",
      );
    }

    const service = getNotificationDispatcherService();
    const res = await service.markNotificationRead(auth.clientId, parsed.data.id);

    if (!res.ok) {
      return notificationProblemJson(
        req,
        requestId,
        404,
        "Not Found",
        res.error,
        "not-found",
        res.code,
      );
    }

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
