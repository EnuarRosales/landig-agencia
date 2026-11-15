import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantProductsAndMediaService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  canDeleteProducts,
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  scheduleLowStockEvaluationAfter,
  updateProductSchema,
} from "../_shared";

/**
 * `GET /api/tenant/products/[id]` — Retorna el detalle completo (medios, combo, rentabilidad, prompt) (`SPEC-08`).
 */
export const GET = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const service = getTenantProductsAndMediaService();
    const detailRes = await service.getProductDetail(auth.clientId, id);

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
 * `PUT /api/tenant/products/[id]` — Actualiza atributos, precios, stock, combos y Prompt Maestro (`SPEC-08`).
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
    const parsed = updateProductSchema.safeParse(body);
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
    const service = getTenantProductsAndMediaService();
    const updatedRes = await service.updateProduct(auth.clientId, id, parsed.data, actor);

    if (!updatedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, updatedRes);
    }

    const detailRes = await service.getProductDetail(auth.clientId, id);
    scheduleLowStockEvaluationAfter(auth.clientId, id, actor);

    appLogger.info("[PUT /api/tenant/products/:id] Producto actualizado", {
      requestId,
      clientId: auth.clientId,
      productId: id,
    });

    return NextResponse.json(
      { ok: true, data: detailRes.ok ? detailRes.data : updatedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);

/**
 * `DELETE /api/tenant/products/[id]` — Soft-delete exclusivo para `tenant_owner`; rechaza si participa en un combo (`D-06`, `409`).
 */
export const DELETE = handle(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    if (!canDeleteProducts(auth.context)) {
      appLogger.warn("[DELETE /api/tenant/products/:id] Rol sin permisos intentó eliminar producto", {
        requestId,
        clientId: auth.clientId,
        role: auth.context.role,
      });
      return problemResponse(req, requestId, {
        status: 403,
        type: "https://mocter.co/errors/forbidden",
        title: "Forbidden",
        detail: "Solo el propietario del comercio puede eliminar productos.",
        code: "FORBIDDEN",
      });
    }

    const { id } = await params;
    const actor = auth.context.user?.email || auth.clientId;
    const service = getTenantProductsAndMediaService();
    const deletedRes = await service.deleteProduct(auth.clientId, id, actor);

    if (!deletedRes.ok) {
      return mapDomainErrorToProblem(req, requestId, deletedRes);
    }

    appLogger.info("[DELETE /api/tenant/products/:id] Producto eliminado lógicamente", {
      requestId,
      clientId: auth.clientId,
      productId: id,
      actor,
    });

    return NextResponse.json(
      { ok: true, data: deletedRes.data },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  },
);
