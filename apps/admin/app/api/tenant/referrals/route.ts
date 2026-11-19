import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appLogger, getReferralsService, type ReferralsService } from "@mocter/domain";
import { env } from "@/env";
import { handle } from "@/lib/errors/route";
import { problemResponse, requireTenantBillingOwner } from "@/lib/billing-route-auth";

const referralsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("El parámetro page debe ser un entero.")
    .min(1, "El parámetro page debe ser mayor o igual a 1.")
    .default(1),
  limit: z.coerce
    .number()
    .int("El parámetro limit debe ser un entero.")
    .min(1, "El parámetro limit debe ser mayor o igual a 1.")
    .max(100, "El parámetro limit no puede exceder 100 registros por página.")
    .default(20),
  status: z.enum(["pending", "qualified", "rewarded", "rejected"]).optional(),
});

/**
 * Construye el handler `GET /api/tenant/referrals` protegido exclusivamente para el propietario
 * del comercio (`tenant_owner` / `tenancy_owner`), validado con Zod y RFC 9457 (`SPEC-16 §9.1`).
 *
 * @param referralsService - Servicio de dominio de referidos (inyectable en pruebas).
 * @returns Handler compatible con Next.js App Router envuelto en `handle()`.
 */
export function createTenantReferralsGetHandler(referralsService: ReferralsService) {
  return handle(async (req: NextRequest) => {
    const { context, clientId } = await requireTenantBillingOwner(req);

    const rawQuery = {
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      status: req.nextUrl.searchParams.get("status")?.trim() || undefined,
    };

    const parsed = referralsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return problemResponse(
        400,
        "Validation Error",
        "Parámetros de paginación o filtro de referidos inválidos.",
        {
          typeSlug: "validation-error",
          code: "INVALID_QUERY_PARAMS",
          errors: parsed.error.issues,
        },
      );
    }

    const clientSlug = context.activeClient?.slug || "comercio";
    const publicBaseUrl = env.NEXT_PUBLIC_APP_URL;

    const overviewRes = await referralsService.getTenantReferralsOverview(
      clientId,
      clientSlug,
      publicBaseUrl,
      parsed.data,
    );

    if (!overviewRes.ok) {
      return problemResponse(
        500,
        "Referrals Overview Error",
        "No fue posible obtener la información del programa de referidos.",
        {
          typeSlug: "referrals-overview-error",
          code: overviewRes.code,
        },
      );
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    appLogger.info("tenant.referrals.panel_loaded", {
      requestId,
      clientId,
      page: parsed.data.page,
      limit: parsed.data.limit,
      statusFilter: parsed.data.status ?? "all",
      totalReferred: overviewRes.data.metrics.totalReferred,
      availableCreditCents: overviewRes.data.metrics.availableCreditCents,
    });

    return NextResponse.json(
      {
        ok: true,
        data: overviewRes.data,
      },
      { status: 200 },
    );
  });
}

/**
 * Endpoint HTTP `GET /api/tenant/referrals` (`SPEC-16 §9.1`).
 */
export const GET = (req: NextRequest) =>
  createTenantReferralsGetHandler(getReferralsService())(req);
