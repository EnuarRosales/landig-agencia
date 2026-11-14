import { NextRequest, NextResponse } from "next/server";
import { getBillingService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformBillingAdmin } from "@/lib/billing-route-auth";

const VALID_STATUSES = new Set(["pending_review", "approved", "rejected"]);

/**
 * GET `/api/admin/billing/manual-reports` · Lista reportes de pago manual Bre-B para la bandeja administrativa (`SPEC-04 T-05`).
 */
export const GET = handle(async (req: NextRequest) => {
  await requirePlatformBillingAdmin(req);

  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return problemResponse(
      400,
      "Validation Error",
      "Filtro de estado inválido (usa pending_review, approved o rejected).",
      { typeSlug: "validation-error" },
    );
  }

  const billingService = getBillingService();
  const res = await billingService.listManualBreBReports(
    statusParam
      ? { status: statusParam as "pending_review" | "approved" | "rejected" }
      : undefined,
  );

  if (!res.ok) {
    return problemResponse(500, "Manual Reports List Failed", res.error, {
      code: res.code,
    });
  }

  return NextResponse.json({ ok: true, data: res.data });
});
