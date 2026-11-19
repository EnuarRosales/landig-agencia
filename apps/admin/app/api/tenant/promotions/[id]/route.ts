import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantPromotionsService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  canDeletePromotions,
  mapPromotionDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  upsertPromotionSchema,
} from "../_shared";

/**
 * `GET /api/tenant/promotions/[id]` — Retorna el detalle de la promoción con simulación producto por producto (`SPEC-18 §9.1`).
 */
export const GET = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const service = getTenantPromotionsService();
    const detailRes = await service.getPromotionDetail(auth.clientId, id);
    if (!detailRes.ok) {
      return mapPromotionDomainErrorToProblem(req, requestId, detailRes);
    }

    return NextResponse.json(
      { ok: true, data: detailRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `PUT /api/tenant/promotions/[id]` — Actualiza una promoción existente y reemplaza sus objetivos (`SPEC-18 §9.1`).
 */
export const PUT = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = upsertPromotionSchema.safeParse(body);
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
    const service = getTenantPromotionsService();
    const updatedRes = await service.updatePromotion(auth.clientId, id, parsed.data, actor);
    if (!updatedRes.ok) {
      return mapPromotionDomainErrorToProblem(req, requestId, updatedRes);
    }

    appLogger.info("[PUT /api/tenant/promotions/:id] Promoción actualizada", {
      requestId,
      clientId: auth.clientId,
      promotionId: id,
    });

    return NextResponse.json(
      { ok: true, data: updatedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `DELETE /api/tenant/promotions/[id]` — Soft delete exclusivo para `tenant_owner` (`SPEC-18 §6`, `D-08`).
 */
export const DELETE = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    if (!canDeletePromotions(auth.context)) {
      appLogger.warn("[DELETE /api/tenant/promotions/:id] Rol sin permisos intentó eliminar promoción", {
        requestId,
        clientId: auth.clientId,
        role: auth.context.role,
      });
      return problemResponse(req, requestId, {
        status: 403,
        type: "https://mocter.co/errors/forbidden",
        title: "Forbidden",
        detail: "Solo el propietario del comercio puede eliminar promociones.",
        code: "FORBIDDEN",
      });
    }

    const { id } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantPromotionsService();
    const deletedRes = await service.deletePromotion(
      auth.clientId,
      id,
      actor,
      auth.context.role,
    );
    if (!deletedRes.ok) {
      return mapPromotionDomainErrorToProblem(req, requestId, deletedRes);
    }

    appLogger.info("[DELETE /api/tenant/promotions/:id] Promoción eliminada lógicamente", {
      requestId,
      clientId: auth.clientId,
      promotionId: id,
      actor,
    });

    return NextResponse.json(
      { ok: true, data: deletedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
