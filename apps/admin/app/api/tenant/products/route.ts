import { NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  getTenantProductsAndMediaService,
  normalizeProductStatus,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  createProductSchema,
  listCatalogQuerySchema,
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  scheduleLowStockEvaluationAfter,
} from "./_shared";

/**
 * `GET /api/tenant/products` — Lista paginada, filtrable y ordenable con contrato `SPEC-17` (`SPEC-08 D-06`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = resolveRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsedQuery = listCatalogQuerySchema.safeParse(rawParams);
  if (!parsedQuery.success) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/validation-error",
      title: "Validation Error",
      detail: parsedQuery.error.issues[0]?.message || "Parámetros de consulta inválidos.",
      issues: parsedQuery.error.issues,
    });
  }

  const q = parsedQuery.data;
  const normalizedStatus =
    q.status && q.status !== "all" ? normalizeProductStatus(q.status) : q.status;

  const service = getTenantProductsAndMediaService();
  const listRes = await service.listCatalog(auth.clientId, {
    q: q.q,
    status: normalizedStatus,
    kind: q.kind,
    compositionType: q.compositionType,
    lowStock: q.lowStock,
    page: q.page,
    limit: q.limit,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
  });

  if (!listRes.ok) {
    return mapDomainErrorToProblem(req, requestId, listRes);
  }

  return NextResponse.json(
    { ok: true, data: listRes.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/tenant/products` — Crea un producto simple o combo verificando cuotas, atributos y margen (`SPEC-08`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = resolveRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/validation-error",
      title: "Validation Error",
      detail: parsed.error.issues[0]?.message || "Datos de producto inválidos.",
      issues: parsed.error.issues,
    });
  }

  const actor = auth.context.user?.email || auth.clientId;
  const service = getTenantProductsAndMediaService();
  const createdRes = await service.createProduct(auth.clientId, parsed.data, actor);

  if (!createdRes.ok) {
    appLogger.warn("[POST /api/tenant/products] Operación rechazada por regla de negocio", {
      requestId,
      clientId: auth.clientId,
      code: createdRes.code,
    });
    return mapDomainErrorToProblem(req, requestId, createdRes);
  }

  const createdProduct = createdRes.data;
  const detailRes = await service.getProductDetail(auth.clientId, createdProduct.id);

  scheduleLowStockEvaluationAfter(auth.clientId, createdProduct.id, actor);

  appLogger.info("[POST /api/tenant/products] Producto registrado", {
    requestId,
    clientId: auth.clientId,
    productId: createdProduct.id,
    compositionType: createdProduct.compositionType,
  });

  return NextResponse.json(
    { ok: true, data: detailRes.ok ? detailRes.data : createdProduct },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
