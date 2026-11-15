import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantProductsAndMediaService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import { mapDomainErrorToProblem, resolveRequestId } from "@/app/api/tenant/products/_shared";

/**
 * `DELETE /api/tenant/products/[id]/media/[mediaId]` — Elimina vínculo multimedia y promueve portada si aplica (`SPEC-08 §9.4`).
 */
export const DELETE = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string; mediaId: string }> },
  ) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id, mediaId } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantProductsAndMediaService();
    const res = await service.deleteProductMedia(auth.clientId, id, mediaId, actor);

    if (!res.ok) {
      return mapDomainErrorToProblem(req, requestId, res);
    }

    appLogger.info("[DELETE /api/tenant/products/:id/media/:mediaId] Medio desvinculado", {
      requestId,
      clientId: auth.clientId,
      productId: id,
      mediaId,
      promotedCoverMediaId: res.data.promotedCoverMediaId,
    });

    return NextResponse.json(
      { ok: true, data: res.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
