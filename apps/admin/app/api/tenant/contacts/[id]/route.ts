import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantCrmService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  canDeleteContacts,
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  updateContactBodySchema,
} from "../_shared";

/**
 * `GET /api/tenant/contacts/[id]` — Obtiene la ficha integral del contacto (`SPEC-09`).
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
    const detailRes = await service.getContactDetail(auth.clientId, id);

    if (!detailRes.ok) {
      return mapDomainErrorToProblem(req, requestId, detailRes);
    }

    return NextResponse.json(
      { ok: true, data: detailRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `PATCH /api/tenant/contacts/[id]` — Actualiza datos generales y canal preferido preservando origen `source` (`SPEC-09`).
 */
export const PATCH = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateContactBodySchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Datos de actualización inválidos.",
        issues: parsed.error.issues,
      });
    }

    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const updatedRes = await service.updateContact(auth.clientId, id, {
      ...parsed.data,
      updatedBy: actor,
    });

    if (!updatedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, updatedRes);
    }

    appLogger.info("[PATCH /api/tenant/contacts/:id] Contacto actualizado", {
      requestId,
      clientId: auth.clientId,
      contactId: id,
    });

    return NextResponse.json(
      { ok: true, data: updatedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `DELETE /api/tenant/contacts/[id]` — Ejecuta borrado lógico seguro exclusivo para `tenant_owner` (`SPEC-09 RN-07`).
 */
export const DELETE = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    if (!canDeleteContacts(auth.context)) {
      return problemResponse(req, requestId, {
        status: 403,
        type: "https://mocter.co/errors/forbidden",
        title: "Forbidden",
        detail: "Solo el propietario de la organización puede eliminar contactos.",
        code: "FORBIDDEN",
      });
    }

    const { id } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantCrmService();
    const deletedRes = await service.deleteContact(auth.clientId, id, actor);

    if (!deletedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, deletedRes);
    }

    return NextResponse.json(
      { ok: true, data: deletedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
