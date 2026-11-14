import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBillingService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requireTenantBillingOwner } from "@/lib/billing-route-auth";

const reportFieldsSchema = z.object({
  invoiceId: z.string().uuid(),
  targetPlanId: z.string().uuid(),
  targetCycle: z.enum(["monthly", "annual"]),
  operationKind: z.enum(["new_subscription", "renewal", "upgrade"]),
  reportedAmountCents: z.coerce.number().int().positive(),
  paymentReference: z.string().trim().max(120).optional(),
});

/**
 * POST `/api/tenant/billing/bre-b/report` · Recibe el comprobante binario Bre-B (multipart/form-data),
 * lo almacena privadamente en SeaweedFS y garantiza continuidad operativa mientras queda en revisión (`SPEC-04 T-05`).
 */
export const POST = handle(async (req: NextRequest) => {
  const { context, clientId } = await requireTenantBillingOwner(req);
  const formData = await req.formData();

  const voucherFile = formData.get("voucher");
  if (!(voucherFile instanceof File)) {
    return problemResponse(
      400,
      "Validation Error",
      "Debes adjuntar el archivo de comprobante en el campo 'voucher'.",
      { typeSlug: "validation-error", code: "INVALID_VOUCHER_FILE" },
    );
  }

  const parsedFields = reportFieldsSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    targetPlanId: formData.get("targetPlanId"),
    targetCycle: formData.get("targetCycle"),
    operationKind: formData.get("operationKind"),
    reportedAmountCents: formData.get("reportedAmountCents"),
    paymentReference: formData.get("paymentReference") || undefined,
  });

  if (!parsedFields.success) {
    return problemResponse(400, "Validation Error", "Datos del reporte de pago Bre-B inválidos.", {
      typeSlug: "validation-error",
      errors: parsedFields.error.issues,
    });
  }

  const arrayBuffer = await voucherFile.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const billingService = getBillingService();
  const result = await billingService.submitManualBreBReport({
    clientId,
    invoiceId: parsedFields.data.invoiceId,
    targetPlanId: parsedFields.data.targetPlanId,
    targetCycle: parsedFields.data.targetCycle,
    operationKind: parsedFields.data.operationKind,
    paymentReference: parsedFields.data.paymentReference ?? null,
    reportedAmountCents: parsedFields.data.reportedAmountCents,
    fileBuffer,
    submittedByUserId: context.user.id,
  });

  if (!result.ok) {
    const status =
      result.code === "INVOICE_NOT_FOUND" || result.code === "PLAN_NOT_FOUND"
        ? 404
        : result.code === "STORAGE_UPLOAD_ERROR"
          ? 503
          : 422;
    return problemResponse(status, "Bre-B Report Failed", result.error, {
      code: result.code,
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      report: result.data.report,
      subscriptionStatus: result.data.subscription.status,
      activePlanId: result.data.subscription.planId,
      pendingUpgradePlanId: result.data.subscription.pendingUpgradePlanId,
    },
  });
});
