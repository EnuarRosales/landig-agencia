import { NextRequest, NextResponse } from "next/server";
import { getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  updateAddressBodySchema,
} from "@/app/api/tenant/contacts/_shared";

/**
 * `PATCH /api/tenant/contacts/[id]/addresses/[addressId]` — Actualiza una dirección o la promueve como predeterminada (`SPEC-09`).
 */
export const PATCH = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string; addressId: string }> },
  ) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id, addressId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateAddressBodySchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Datos de dirección inválidos.",
        issues: parsed.error.issues,
      });
    }

    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const updatedRes = await service.updateAddress(auth.clientId, id, addressId, {
      ...parsed.data,
      actor,
    });

    if (!updatedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, updatedRes);
    }

    return NextResponse.json(
      { ok: true, data: updatedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `DELETE /api/tenant/contacts/[id]/addresses/[addressId]` — Elimina una dirección promoviendo otra si existía predeterminada (`SPEC-09`).
 */
export const DELETE = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string; addressId: string }> },
  ) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id, addressId } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const deletedRes = await service.deleteAddress(auth.clientId, id, addressId, actor);

    if (!deletedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, deletedRes);
    }

    return NextResponse.json(
      { ok: true, data: deletedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
