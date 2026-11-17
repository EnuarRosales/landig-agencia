import { NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  clients,
  eq,
  getDb,
  getTenantChatwootAccount,
  isTenantOwnerRole,
  provisionTenantChatwootAccount,
} from "@mocter/domain";
import { handle, HttpError } from "@/lib/errors/route";
import { resolveTenantSession } from "@/lib/tenant-auth";

/**
 * `POST /api/tenant/conversations/retry` — Permite al `tenant_owner` reintentar idempotentemente
 * la vinculación de la bandeja omnicanal cuando su plan incluye `chatwoot_inboxes` y la cuenta
 * quedó en estado `failed` o sin aprovisionar (`SPEC-13`).
 */
export const POST = handle(async (req: NextRequest): Promise<Response> => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { context, clientId } = auth;
  const isOwner = isTenantOwnerRole(context.role, context.effectiveRoles);
  if (!isOwner) {
    throw new HttpError(
      403,
      "Solo el propietario del comercio puede reintentar la vinculación de la bandeja.",
    );
  }

  if (!context.capabilities?.chatwoot_inboxes) {
    throw new HttpError(403, "Tu plan comercial no incluye buzones de atención omnicanal.");
  }

  const existing = await getTenantChatwootAccount({ clientId });
  if (existing?.state === "active" && existing.chatwootAccountId !== null) {
    return NextResponse.json(
      {
        ok: true,
        data: {
          state: existing.state,
          chatwootAccountId: existing.chatwootAccountId,
        },
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }

  if (existing?.state === "suspended") {
    throw new HttpError(
      403,
      "Tu bandeja de atención se encuentra suspendida. Revisa el estado de tu suscripción.",
    );
  }

  let planId = context.activeClient?.planId ?? null;
  if (!planId) {
    const db = getDb();
    const [client] = await db
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    planId = client?.planId ?? null;
  }

  if (!planId) {
    throw new HttpError(404, "No se encontró un plan activo asociado a este comercio.");
  }

  const provResult = await provisionTenantChatwootAccount({
    clientId,
    planId,
    actor: context.user.email || "tenant_owner",
  });

  const updated = await getTenantChatwootAccount({ clientId });
  if (!provResult.ok || updated?.state === "failed") {
    appLogger.warn("tenant.chatwoot.retry_provisioning_failed", {
      requestId,
      clientId,
      userId: context.user.id,
      code: provResult.ok ? "PROVISIONING_FAILED" : provResult.code,
    });

    return NextResponse.json(
      {
        type: "about:blank",
        title: "BAD_GATEWAY",
        status: 502,
        code: "CHATWOOT_PROVISIONING_UNAVAILABLE",
        detail:
          "No fue posible completar la activación de tu bandeja de conversaciones en este momento. Intenta nuevamente en unos instantes.",
        instance: req.nextUrl.pathname,
        reference: requestId,
      },
      {
        status: 502,
        headers: {
          "content-type": "application/problem+json",
          "x-request-id": requestId,
        },
      },
    );
  }

  appLogger.info("tenant.chatwoot.retry_provisioning_ok", {
    requestId,
    clientId,
    userId: context.user.id,
    state: updated?.state ?? "active",
    chatwootAccountId: updated?.chatwootAccountId ?? null,
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        state: updated?.state ?? "active",
        chatwootAccountId: updated?.chatwootAccountId ?? null,
      },
    },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
