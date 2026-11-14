import { NextRequest, NextResponse } from "next/server";
import { tenantPaymentChannelsService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  emitProfileAfterEvent,
  mapProfileDomainError,
  profileProblemResponse,
  requireTenantProfileAccess,
} from "@/lib/tenant-profile-http";

/**
 * `GET /api/tenant/payment-channels` · Lista los canales de pago informativos del comercio (`SPEC-05 §9.2`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: false });

  const res = await tenantPaymentChannelsService.listChannels(access.clientId);
  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/tenant/payment-channels` · Registra un nuevo canal de pago informativo para pedidos y bot (`SPEC-05 §9.2`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

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

  const res = await tenantPaymentChannelsService.createChannel(
    access.clientId,
    access.context.role,
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
    action: "created",
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
