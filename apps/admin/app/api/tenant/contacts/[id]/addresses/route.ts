import { NextRequest, NextResponse } from "next/server";
import { getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  createAddressBodySchema,
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
} from "@/app/api/tenant/contacts/_shared";

/**
 * `GET /api/tenant/contacts/[id]/addresses` — Lista la libreta de direcciones de envío del contacto (`SPEC-09`).
 */
export const GET = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const service = getTenantCrmService();
    const listRes = await service.listAddresses(auth.clientId, id);

    if (!listRes.ok) {
      return mapDomainErrorToProblem(req, requestId, listRes);
    }

    return NextResponse.json(
      { ok: true, data: listRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `POST /api/tenant/contacts/[id]/addresses` — Agrega una dirección de envío a la libreta del contacto (`SPEC-09`).
 */
export const POST = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = createAddressBodySchema.safeParse(body);
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
    const createdRes = await service.createAddress(auth.clientId, id, {
      ...parsed.data,
      actor,
    });

    if (!createdRes.ok) {
      return mapDomainErrorToProblem(req, requestId, createdRes);
    }

    return NextResponse.json(
      { ok: true, data: createdRes.data },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  },
);
