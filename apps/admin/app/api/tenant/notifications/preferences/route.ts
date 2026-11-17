import { NextRequest, NextResponse } from "next/server";
import {
  getNotificationDispatcherService,
  updateTenantPreferencesPayloadSchema,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  isTenantOwnerRole,
  notificationProblemJson,
  resolveNotificationRequestId,
} from "../_shared";

/**
 * `PUT /api/tenant/notifications/preferences` — Actualiza preferencias de alerta por evento y destinatario (`SPEC-14`).
 *
 * Exclusivo para `tenant_owner`. Rechaza apagar correo en eventos obligatorios (`422 MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED`).
 */
export const PUT = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveNotificationRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isTenantOwnerRole(auth.context)) {
    return notificationProblemJson(
      req,
      requestId,
      403,
      "Forbidden",
      "Solo el propietario del comercio puede modificar las preferencias de notificación.",
      "forbidden",
      "FORBIDDEN_ROLE",
    );
  }

  const rawBody: unknown = await req.json().catch(() => null);
  const parsed = updateTenantPreferencesPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return notificationProblemJson(
      req,
      requestId,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos de preferencias inválidos.",
      "validation-error",
      "VALIDATION_ERROR",
      parsed.error.issues,
    );
  }

  const service = getNotificationDispatcherService();
  const result = await service.updateTenantPreferences(
    auth.clientId,
    auth.context.user.id,
    "tenant_owner",
    parsed.data.items,
  );

  if (!result.ok) {
    const status =
      result.code === "MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED"
        ? 422
        : result.code === "FORBIDDEN_ROLE"
          ? 403
          : 400;
    const title =
      status === 422
        ? "Unprocessable Entity"
        : status === 403
          ? "Forbidden"
          : "Validation Error";
    return notificationProblemJson(
      req,
      requestId,
      status,
      title,
      result.error,
      status === 422 ? "business-rule-violation" : "validation-error",
      result.code,
    );
  }

  return NextResponse.json(
    { ok: true, data: result.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
