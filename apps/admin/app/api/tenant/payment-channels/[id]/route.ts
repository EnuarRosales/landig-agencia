import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantPaymentChannelsService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  emitProfileAfterEvent,
  mapProfileDomainError,
  profileProblemResponse,
  requireTenantProfileAccess,
} from "@/lib/tenant-profile-http";

const uuidParamSchema = z.string().uuid("Identificador de canal inválido.");

interface RouteParamsContext {
  params: Promise<{ id: string }>;
}

/**
 * `PATCH /api/tenant/payment-channels/[id]` · Actualiza datos o estado activo de un canal de pago (`SPEC-05 §9.2`).
 */
export const PATCH = handle(async (req: NextRequest, ctx: RouteParamsContext) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const resolvedParams = ctx?.params ? await ctx.params : { id: "" };
  const parsedId = uuidParamSchema.safeParse(resolvedParams.id);
  if (!parsedId.success) {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid Channel ID",
      detail: parsedId.error.issues[0]?.message || "El ID del canal debe ser UUID válido.",
      code: "INVALID_ID",
      typeSlug: "invalid-id",
    });
  }

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

  const res = await tenantPaymentChannelsService.updateChannel(
    access.clientId,
    access.context.role,
    parsedId.data,
    body,
    access.actor,
    access.context.effectiveRoles,
  );

  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  emitProfileAfterEvent("tenant.payment_channel.mutated", {
    requestId,
    clientId: access.clientId,
    channelId: res.data.id,
    channelCode: res.data.channelCode,
    action: "updated",
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `DELETE /api/tenant/payment-channels/[id]` · Elimina físicamente el canal o retorna `409 CHANNEL_USED_IN_ORDERS` si tiene pedidos asociados (`SPEC-05 §9.2`).
 */
export const DELETE = handle(async (req: NextRequest, ctx: RouteParamsContext) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const resolvedParams = ctx?.params ? await ctx.params : { id: "" };
  const parsedId = uuidParamSchema.safeParse(resolvedParams.id);
  if (!parsedId.success) {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid Channel ID",
      detail: parsedId.error.issues[0]?.message || "El ID del canal debe ser UUID válido.",
      code: "INVALID_ID",
      typeSlug: "invalid-id",
    });
  }

  const res = await tenantPaymentChannelsService.deleteChannel(
    access.clientId,
    access.context.role,
    parsedId.data,
    access.actor,
    access.context.effectiveRoles,
  );

  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  emitProfileAfterEvent("tenant.payment_channel.mutated", {
    requestId,
    clientId: access.clientId,
    channelId: parsedId.data,
    action: "deleted",
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});
