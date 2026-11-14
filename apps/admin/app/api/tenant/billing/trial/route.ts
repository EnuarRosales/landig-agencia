import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillingService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requireTenantBillingOwner } from "@/lib/billing-route-auth";

const activateTrialSchema = z.object({
  planId: z.string().uuid().optional(),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

/**
 * POST `/api/tenant/billing/trial` · Activa de forma idempotente el periodo de prueba del espacio (`SPEC-04 T-05`).
 */
export const POST = handle(async (req: NextRequest) => {
  const { context, clientId } = await requireTenantBillingOwner(req);

  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = activateTrialSchema.safeParse(rawBody);
  if (!parsed.success) {
    return problemResponse(400, "Validation Error", "Parámetros de activación de prueba inválidos.", {
      typeSlug: "validation-error",
      errors: parsed.error.issues,
    });
  }

  const billingService = getBillingService();
  const res = await billingService.activateTrialForTenant({
    clientId,
    planId: parsed.data.planId,
    cycle: parsed.data.cycle,
    executedBy: context.user.id,
  });

  if (!res.ok) {
    const status = res.code === "PLAN_NOT_FOUND" || res.code === "CLIENT_NOT_FOUND" ? 404 : 422;
    return problemResponse(status, "Trial Activation Failed", res.error, {
      code: res.code,
    });
  }

  return NextResponse.json({
    ok: true,
    data: res.data,
  });
});
