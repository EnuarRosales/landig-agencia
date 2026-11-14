import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillingService, S3StorageService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformBillingAdmin } from "@/lib/billing-route-auth";

type ReportRouteContext = { params: Promise<{ id: string }> };

/**
 * GET `/api/admin/billing/manual-reports/[id]/voucher` · Descarga segura y autorizada
 * del comprobante binario Bre-B almacenado de forma privada en SeaweedFS (`SPEC-04 T-05`).
 */
export const GET = handle<ReportRouteContext>(async (req: NextRequest, ctx) => {
  await requirePlatformBillingAdmin(req);
  const { id } = await ctx.params;

  if (!z.string().uuid().safeParse(id).success) {
    return problemResponse(400, "Validation Error", "Identificador de reporte inválido.", {
      typeSlug: "validation-error",
    });
  }

  const billingService = getBillingService();
  const reportRes = await billingService.getManualBreBReportById(id);

  if (!reportRes.ok) {
    const status = reportRes.code === "NOT_FOUND" ? 404 : 500;
    return problemResponse(status, "Voucher Lookup Failed", reportRes.error, {
      code: reportRes.code,
    });
  }

  const s3 = new S3StorageService();
  const objRes = await s3.getObject(reportRes.data.voucherMediaKey);
  if (!objRes.ok) {
    const status = objRes.status === 404 ? 404 : 502;
    return problemResponse(
      status,
      "Voucher Storage Error",
      "No fue posible recuperar el comprobante desde el almacenamiento seguro.",
    );
  }

  return new NextResponse(new Uint8Array(objRes.buffer), {
    status: 200,
    headers: {
      "Content-Type": reportRes.data.voucherMimeType || objRes.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
