import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantPromotionsService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapPromotionDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  togglePromotionStatusSchema,
} from "../../_shared";

/**
 * `PATCH /api/tenant/promotions/[id]/status` — Alterna el estado administrativo `isActive` (pausar/reactivar) (`SPEC-18 §9.1`).
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
    const parsed = togglePromotionStatusSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Payload de estado inválido.",
        issues: parsed.error.issues,
      });
    }

    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantPromotionsService();
    const res = await service.togglePromotionStatus(auth.clientId, id, parsed.data.isActive, actor);
    if (!res.ok) {
      return mapPromotionDomainErrorToProblem(req, requestId, res);
    }

    appLogger.info("[PATCH /api/tenant/promotions/:id/status] Estado de promoción actualizado", {
      requestId,
      clientId: auth.clientId,
      promotionId: id,
      isActive: res.data.isActive,
      lifecycleStatus: res.data.lifecycleStatus,
    });

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
