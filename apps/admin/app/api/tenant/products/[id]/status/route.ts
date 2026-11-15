import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantProductsAndMediaService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  scheduleLowStockEvaluationAfter,
  updateProductStatusSchema,
} from "@/app/api/tenant/products/_shared";

/**
 * `PATCH /api/tenant/products/[id]/status` — Cambia el estado operativo del producto (`active`, `inactive`, `draft`) (`SPEC-08 §9.3`).
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
    const parsed = updateProductStatusSchema.safeParse(body);
    if (!parsed.success) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: parsed.error.issues[0]?.message || "Estado operativo inválido.",
        issues: parsed.error.issues,
      });
    }

    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantProductsAndMediaService();
    const res = await service.updateProductStatus(auth.clientId, id, parsed.data.status, actor);

    if (!res.ok) {
      return mapDomainErrorToProblem(req, requestId, res);
    }

    scheduleLowStockEvaluationAfter(auth.clientId, id, actor);

    appLogger.info("[PATCH /api/tenant/products/:id/status] Estado actualizado", {
      requestId,
      clientId: auth.clientId,
      productId: id,
      status: res.data.status,
    });

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
