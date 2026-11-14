import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillingService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformBillingAdmin } from "@/lib/billing-route-auth";

type ReportRouteContext = { params: Promise<{ id: string }> };

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().optional(),
});

/**
 * POST `/api/admin/billing/manual-reports/[id]/review` · Aprueba o rechaza atómicamente
 * un comprobante manual Bre-B (`SPEC-04 T-05`, `RN-SPEC-04-07`).
 */
export const POST = handle<ReportRouteContext>(async (req: NextRequest, ctx) => {
  const admin = await requirePlatformBillingAdmin(req);
  const { id } = await ctx.params;

  if (!z.string().uuid().safeParse(id).success) {
    return problemResponse(400, "Validation Error", "Identificador de reporte inválido.", {
      typeSlug: "validation-error",
    });
  }

  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(400, "Validation Error", "Datos de revisión inválidos.", {
      typeSlug: "validation-error",
      errors: parsed.error.issues,
    });
  }

  const billingService = getBillingService();
  const res = await billingService.reviewManualBreBReport({
    reportId: id,
    action: parsed.data.action,
    rejectionReason: parsed.data.rejectionReason,
    reviewerUserId: admin.user.id,
  });

  if (!res.ok) {
    const status = res.code === "NOT_FOUND" ? 404 : 422;
    return problemResponse(status, "Manual Report Review Failed", res.error, {
      code: res.code,
    });
  }

  return NextResponse.json({
    ok: true,
    data: res.data,
  });
});
