import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantPromotionsService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  listPromotionsQuerySchema,
  mapPromotionDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
  upsertPromotionSchema,
} from "./_shared";

/**
 * `GET /api/tenant/promotions` — Lista paginada, filtrable y con resumen KPI de la Central de Promociones (`SPEC-18 §9.1`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = resolveRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsedQuery = listPromotionsQuerySchema.safeParse(rawParams);
  if (!parsedQuery.success) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/validation-error",
      title: "Validation Error",
      detail: parsedQuery.error.issues[0]?.message || "Parámetros de consulta inválidos.",
      issues: parsedQuery.error.issues,
    });
  }

  const service = getTenantPromotionsService();
  const listRes = await service.listPromotions(auth.clientId, parsedQuery.data);
  if (!listRes.ok) {
    return mapPromotionDomainErrorToProblem(req, requestId, listRes);
  }

  return NextResponse.json(
    { ok: true, data: listRes.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `POST /api/tenant/promotions` — Crea una promoción comercial automática validando alcance, vigencia y margen (`SPEC-18 §9.1`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = resolveRequestId(req);
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = upsertPromotionSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/validation-error",
      title: "Validation Error",
      detail: parsed.error.issues[0]?.message || "Datos de promoción inválidos.",
      issues: parsed.error.issues,
    });
  }

  const actor = auth.context.user?.email || auth.clientId;
  const service = getTenantPromotionsService();
  const createdRes = await service.createPromotion(auth.clientId, parsed.data, actor);

  if (!createdRes.ok) {
    appLogger.warn("[POST /api/tenant/promotions] Promoción rechazada por regla de negocio", {
      requestId,
      clientId: auth.clientId,
      code: createdRes.code,
    });
    return mapPromotionDomainErrorToProblem(req, requestId, createdRes);
  }

  appLogger.info("[POST /api/tenant/promotions] Promoción creada", {
    requestId,
    clientId: auth.clientId,
    promotionId: createdRes.data.id,
    scopeType: createdRes.data.scopeType,
    discountType: createdRes.data.discountType,
  });

  return NextResponse.json(
    { ok: true, data: createdRes.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});
